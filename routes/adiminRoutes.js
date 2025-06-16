const express = require('express');
const router = express.Router();
const { addAdmin } = require('../controllers/adminController');
const { loginDoctor, changePassword } = require('../controllers/authController');

router.post('/admin', addAdmin);
router.post('/login', loginDoctor);
router.post('/change-password', changePassword);

module.exports = router;
