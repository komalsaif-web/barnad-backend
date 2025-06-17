const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patientController');

router.post('/create', patientController.createPatient);
router.get('/all', patientController.getAllPatients);
router.get('/by-doctor/:doctor_id', patientController.getPatientsByDoctor);
router.get('/by-date/:date', patientController.getPatientsByDate);

module.exports = router;
