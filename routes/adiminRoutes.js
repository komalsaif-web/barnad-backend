const express = require('express');
const router = express.Router();
const { addAdmin , loginDoctor , changePassword , getAllDoctorNames} = require('../controllers/adminController');

router.post('/admin', addAdmin);
router.post('/login', loginDoctor);
router.post('/change-password', changePassword);
router.post('/doctor-name', getAllDoctorNames);

module.exports = router;
