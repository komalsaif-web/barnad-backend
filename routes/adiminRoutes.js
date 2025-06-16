const express = require('express');
const router = express.Router();
const { addAdmin , loginDoctor , changePassword } = require('../controllers/adminController');

router.post('/admin', addAdmin);
router.post('/login', loginDoctor);
router.post('/change-password', changePassword);

module.exports = router;
