const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

router.post('/chat', chatController.handleChatMessage);
router.get('/chat/diagnosis/:id', chatController.getDiagnosisByPatientId);

module.exports = router;
