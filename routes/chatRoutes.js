const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

// ✅ POST: Send message or symptoms to AI
router.post('/chat', chatController.handleChatMessage);

// ✅ GET: Fetch diagnosis history for a patient
router.get('/chat/history/:id', chatController.getDiagnosisHistory);

module.exports = router;
