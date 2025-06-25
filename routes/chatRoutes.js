const express = require('express');
const {
  handleChatMessage,
  getDiagnosisByPatientId
} = require('../controllers/chatController');

const router = express.Router();

// 🟢 AI chat interaction (with patientId)
router.post('/chat', handleChatMessage);

// 🔵 Get saved diagnosis for a patient
router.get('/chat/diagnosis/:id', getDiagnosisByPatientId);

module.exports = router;
