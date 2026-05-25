const express = require('express');
const router = express.Router();
const {
  getUserProfile,
  updateUserProfile,
  deleteSavedCard,
  forgotPassword,
  resetPassword,
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

router.route('/profile').get(protect, getUserProfile).put(protect, updateUserProfile);

router.delete('/profile/cards/:cardId', protect, deleteSavedCard);

router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;
