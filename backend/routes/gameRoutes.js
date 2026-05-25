const express = require('express');
const router = express.Router();
const { getGameStatus, handleGameWin, handleGameLose } = require('../controllers/gameController');
const { protect } = require('../middleware/authMiddleware');

router.get('/status', protect, getGameStatus);
router.post('/win', protect, handleGameWin);
router.post('/lose', protect, handleGameLose);

module.exports = router;
