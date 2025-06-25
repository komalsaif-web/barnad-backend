import express from 'express';
import { handleChatMessage, getFinalDiagnosis } from './controllers/chatController.js';

const router = express.Router();

router.post('/api/chat', handleChatMessage);
router.get('/api/final-diagnosis', getFinalDiagnosis);

export default router;
