const User = require('../models/User');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const Ticket = require('../models/Ticket');
const OTP = require('../models/OTP');
const { sendEmail } = require('../utils/emailService');

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const getUserProfile = async (req, res) => {
  try {
    // Use .lean() for faster JSON transformation on read-only queries
    const user = await User.findById(req.user._id).select('-password').lean();
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
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'User with this email does not exist' });
    }

    const otpCode = generateOTP();

    // Upsert OTP for the email
    await OTP.findOneAndUpdate(
      { email },
      { otp: otpCode, createdAt: Date.now() },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px;">
        <h2 style="color: #0B4228; text-align: center;">Password Reset Code</h2>
        <p>Hello,</p>
        <p>You requested to reset your password. Your verification code is:</p>
        <div style="background-color: #f3f4f6; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #0B4228;">${otpCode}</span>
        </div>
        <p>This code will expire in 10 minutes. If you did not request this, please ignore this email.</p>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="font-size: 12px; color: #6b7280; text-align: center;">Smart Garden IoT System</p>
      </div>
    `;

    const emailResult = await sendEmail({
      to: user.email,
      subject: 'Password Reset Verification Code',
      html: emailHtml,
    });

    if (emailResult.status === 'success') {
      res.json({ message: 'Password reset code sent to email' });
    } else {
      res.status(500).json({ message: 'Failed to send reset code' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { email, otp, password } = req.body;

    const user = await User.findOne({ email });

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

    const otpRecord = await OTP.findOne({ email, otp });

    if (otpRecord) {
      // Set new password
      user.password = password; // Hashing is handled by pre-save middleware
      user.otpAttempts = 0;
      user.deletionDate = null;
      user.isRestricted = false;
      user.restrictionReason = '';
      user.requiresPasswordReset = false; // Phase 3 Playbook Cleanup
      await user.save();

      // Delete OTP after successful reset
      await OTP.deleteOne({ _id: otpRecord._id });

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
    const otpCode = generateOTP();
    await OTP.findOneAndUpdate(
      { email: user.email },
      { otp: otpCode, createdAt: Date.now() },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px;">
        <h2 style="color: #dc2626; text-align: center;">Account Deletion Request</h2>
        <p>Hello ${user.name},</p>
        <p>We received a request to delete your Smart Garden account. To proceed, please use the following verification code:</p>
        <div style="background-color: #f3f4f6; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #dc2626;">${otpCode}</span>
        </div>
        <p><strong>Note:</strong> Once confirmed, your account will be scheduled for deletion in 7 days. You can cancel this request at any time before then by logging into your profile.</p>
        <p>This code will expire in 10 minutes.</p>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="font-size: 12px; color: #6b7280; text-align: center;">Smart Garden IoT System</p>
      </div>
    `;

    await sendEmail({
      to: user.email,
      subject: 'Security Code: Account Deletion Request',
      html: emailHtml,
    });

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
    const otpRecord = await OTP.findOne({ email: user.email, otp });
    if (!otpRecord) {
      return res.status(400).json({ message: 'Invalid or expired verification code.' });
    }

    // 3. Schedule Deletion (7 days from now)
    user.deletionDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    // 4. Invalidate current tokens
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    
    await user.save();

    // Delete OTP after successful use
    await OTP.deleteOne({ _id: otpRecord._id });

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
