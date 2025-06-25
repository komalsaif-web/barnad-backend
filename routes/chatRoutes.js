const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

// ✅ POST message to AI
router.post('/chat', chatController.handleChatMessage);

// ✅ GET latest diagnosis by patient ID
router.get('/chat/ai-diagnosis/:id', chatController.getLatestAiDiagnosis);

module.exports = router;
