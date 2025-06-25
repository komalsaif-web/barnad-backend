const express = require('express');
const router = express.Router();

const {
  handleChatMessage,
  getDiagnosisByPatientId
} = require('../controllers/chatController');

// ✅ POST message
router.post('/chat', handleChatMessage);

// ✅ GET diagnosis by patient ID (no function call here!)
router.get('/chat/diagnosis/:id', getDiagnosisByPatientId);

module.exports = router;
