const express = require('express');
const router = express.Router();
const {
  getUserProfile,
  updateUserProfile,
  deleteSavedCard,
  forgotPassword,
  resetPassword,
  requestAccountDeletion,
  confirmAccountDeletion,
  cancelAccountDeletion,
  restoreAccount,
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

router.route('/profile').get(protect, getUserProfile).put(protect, updateUserProfile);

router.delete('/profile/cards/:cardId', protect, deleteSavedCard);

router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

router.post('/request-deletion', protect, requestAccountDeletion);
router.post('/confirm-deletion', protect, confirmAccountDeletion);
router.post('/cancel-deletion', protect, cancelAccountDeletion);
router.post('/restore-account', restoreAccount);

module.exports = router;
