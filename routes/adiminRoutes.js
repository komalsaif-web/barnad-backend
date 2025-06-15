const express = require('express');
const router = express.Router();
const { addAdmin } = require('../controllers/adminController');

router.post('/admin', addAdmin);

module.exports = router;
