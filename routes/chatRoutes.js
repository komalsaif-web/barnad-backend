const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

// ✅ POST: Handle incoming chat message from patient
router.post('/chat', chatController.handleChatMessage);

// ✅ GET: Fetch saved diagnosis by patient ID
router.get('/chat/diagnosis/:id', chatController.getDiagnosisByid);

module.exports = router;
