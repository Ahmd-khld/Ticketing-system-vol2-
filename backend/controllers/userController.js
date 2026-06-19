const User = require('../models/User');
const Ticket = require('../models/Ticket');
const { sendEmail } = require('../utils/emailService');
const { issueOtp, consumeOtp } = require('../utils/otpService');
const { buildOtpEmail } = require('../utils/otpEmail');
const { encryptDeterministic } = require('../utils/encryption');

const getUserProfile = async (req, res) => {
  try {
    // Do NOT use .lean() because we need Mongoose getters to decrypt PII
    const user = await User.findById(req.user._id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      hasDisability: user.hasDisability,
      role: user.role,
      savedCards: user.savedCards,
      deletionDate: user.deletionDate,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      // Email is a sensitive identifier: it can ONLY be changed through the
      // secure, verified flow at /api/users/email-change/* (password + 2FA +
      // new-address verification). Reject attempts to change it here so this
      // endpoint can't be used to bypass that flow.
      if (
        req.body.email &&
        req.body.email.trim().toLowerCase() !== user.email.trim().toLowerCase()
      ) {
        return res.status(400).json({
          message:
            'Email cannot be changed here. Use the secure email-change flow (password + 2FA verification).',
        });
      }

      // Name and phone are immutable via self-service profile updates: they are
      // intentionally never applied here, regardless of the request body. Only
      // accessibility preference can be changed (email goes through its own flow).
      if (req.body.hasDisability !== undefined) {
        user.hasDisability = req.body.hasDisability;
      }

      const updatedUser = await user.save();

      const io = req.app.get('io');
      if (io) {
        io.emit('userUpdated', {
          _id: updatedUser._id,
          name: updatedUser.name,
          email: updatedUser.email,
          phone: updatedUser.phone,
          hasDisability: updatedUser.hasDisability,
        });
      }

      res.json({
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        hasDisability: updatedUser.hasDisability,
        message: 'Profile updated successfully',
      });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        message: 'This email address is already in use by another account.',
      });
    }
    res.status(500).json({ message: error.message });
  }
};

const deleteSavedCard = async (req, res) => {
  try {
    // Use an atomic database operation ($pull) instead of loading and saving the whole document
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $pull: { savedCards: { _id: req.params.cardId } } },
      { new: true } // Returns the updated document
    )
      .select('savedCards')
      .lean();

    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ message: 'Card removed successfully', savedCards: user.savedCards });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email });

    if (!user) {
      // Return 200 OK to prevent email enumeration
      return res.json({ message: 'Password reset code sent to email' });
    }

    const otpCode = await issueOtp(email);

    sendEmail({
      to: user.email,
      subject: 'Password Reset Verification Code',
      html: buildOtpEmail({
        otp: otpCode,
        heading: 'Password Reset Code',
        intro: 'You requested to reset your password. Your verification code is:',
      }),
    }).catch(err => console.error('Background email failed:', err.message));

    res.json({ message: 'Password reset code sent to email' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { email, otp, password } = req.body;

    const user = await User.findOne({ email: email });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.deletionDate) {
      return res.status(403).json({
        message:
          'Account is locked and scheduled for deletion due to too many failed attempts.',
        isLocked: true,
      });
    }

    const otpValid = await consumeOtp(email, otp);

    if (otpValid) {
      // Set new password
      user.password = password; // Hashing is handled by pre-save middleware
      user.otpAttempts = 0;
      user.deletionDate = null;
      user.isRestricted = false;
      user.restrictionReason = '';
      user.requiresPasswordReset = false; // Phase 3 Playbook Cleanup
      await user.save();

      res.json({ message: 'Password has been reset successfully' });
    } else {
      user.otpAttempts = (user.otpAttempts || 0) + 1;

      if (user.otpAttempts >= 5) {
        user.isRestricted = true;
        user.restrictionReason =
          'Too many failed verification attempts. Account locked for 30 days and scheduled for deletion.';
        user.deletionDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await user.save();

        return res.status(403).json({
          message:
            'Max attempts reached. Your account has been locked for 30 days and is scheduled for deletion.',
          isLocked: true,
        });
      }

      await user.save();
      const remaining = 5 - user.otpAttempts;
      res.status(400).json({
        message: `Invalid or expired verification code. ${remaining} attempts remaining.`,
        remainingAttempts: remaining,
      });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteUserProfile = async (req, res) => {
  try {
    const deletedUser = await User.findByIdAndDelete(req.user._id);
    if (!deletedUser) return res.status(404).json({ message: 'User not found' });

    // Cascade delete user tickets to accurately update park stats
    await Ticket.deleteMany({ userId: req.user._id });

    const io = req.app.get('io');
    if (io) {
      io.emit('userDeleted', req.user._id.toString());

      // Broadcast updated ticket stats
      const [totalTicketsSold, purchasingUsersAgg, mostSoldAgg, salesAgg] = await Promise.all([
        Ticket.countDocuments(),
        Ticket.aggregate([{ $group: { _id: '$userId' } }, { $count: 'totalPurchasingUsers' }]),
        Ticket.aggregate([
          {
            $group: { _id: { type: '$ticketType', plan: '$subscriptionPlan' }, count: { $sum: 1 } },
          },
          { $sort: { count: -1 } },
          { $limit: 1 },
        ]),
        Ticket.aggregate([
          { $match: { status: { $ne: 'CANCELLED' } } },
          {
            $group: {
              _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
              totalTickets: { $sum: 1 },
              revenue: { $sum: '$price' },
            },
          },
          { $sort: { '_id.year': -1, '_id.month': -1 } },
          { $limit: 12 },
        ]),
      ]);

      const purchasingUsers =
        purchasingUsersAgg.length > 0 ? purchasingUsersAgg[0].totalPurchasingUsers : 0;
      let mostSoldTicket = 'None yet';
      if (mostSoldAgg.length > 0) {
        const top = mostSoldAgg[0];
        const typeCap = top._id.type
          ? top._id.type.charAt(0).toUpperCase() + top._id.type.slice(1)
          : 'Unknown';
        mostSoldTicket = `${typeCap} (${top._id.plan || 'unknown'})`;
      }
      io.emit('totalTicketsUpdate', { totalTicketsSold, purchasingUsers, mostSoldTicket });

      const formattedSales = salesAgg
        .map((s) => ({
          month: new Date(s._id.year, s._id.month - 1).toLocaleString('default', {
            month: 'short',
            year: 'numeric',
          }),
          totalTickets: s.totalTickets,
          revenue: s.revenue,
        }))
        .reverse();
      io.emit('monthlySalesUpdate', formattedSales);
    }

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const cancelAccountDeletion = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.deletionDate = null;
    await user.save();

    res.json({ message: 'Account deletion cancelled successfully.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const requestAccountDeletion = async (req, res) => {
  try {
    const { password } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) return res.status(404).json({ message: 'User not found' });

    // 1. Verify Password
    if (!(await user.matchPassword(password))) {
      return res.status(401).json({ message: 'Incorrect password.' });
    }

    // 2. Generate and Send OTP
    const otpCode = await issueOtp(user.email);

    sendEmail({
      to: user.email,
      subject: 'Security Code: Account Deletion Request',
      html: buildOtpEmail({
        otp: otpCode,
        heading: 'Account Deletion Request',
        greeting: `Hello ${user.name},`,
        intro: 'We received a request to delete your Smart Garden account. To proceed, please use the following verification code:',
        note: 'Once confirmed, your account will be scheduled for deletion in 7 days. You can cancel any time before then from your profile. This code expires in 10 minutes.',
      }),
    }).catch(err => console.error('Background email failed:', err.message));

    res.json({ message: 'Verification code sent to your email.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const confirmAccountDeletion = async (req, res) => {
  try {
    const { password, otp } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) return res.status(404).json({ message: 'User not found' });

    // 1. Verify Password
    if (!(await user.matchPassword(password))) {
      return res.status(401).json({ message: 'Incorrect password.' });
    }

    // 2. Verify OTP
    const otpValid = await consumeOtp(user.email, otp);
    if (!otpValid) {
      return res.status(400).json({ message: 'Invalid or expired verification code.' });
    }

    // 3. Schedule Deletion (7 days from now)
    user.deletionDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // 4. Invalidate current tokens
    user.tokenVersion = (user.tokenVersion || 0) + 1;

    await user.save();
    // OTP already consumed by consumeOtp() above.

    res.json({
      message: 'Account scheduled for deletion. You have 7 days to undo this action. You have been logged out.',
      deletionDate: user.deletionDate 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const restoreAccount = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (!user.deletionDate) {
      return res.status(400).json({ message: 'This account is not scheduled for deletion.' });
    }

    // Verify Password
    if (!(await user.matchPassword(password))) {
      return res.status(401).json({ message: 'Incorrect password.' });
    }

    // Cancel deletion
    user.deletionDate = null;
    await user.save();

    res.json({ message: 'Account restored successfully. You can now log in.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getUserProfile,
  updateUserProfile,
  deleteSavedCard,
  forgotPassword,
  resetPassword,
  deleteUserProfile,
  requestAccountDeletion,
  confirmAccountDeletion,
  cancelAccountDeletion,
  restoreAccount,
};
