const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patientController');

router.post('/create', patientController.createPatient);
router.get('/all', patientController.getAllPatients);
router.get('/by-doctor/:doctor_id', patientController.getPatientsByDoctor);
router.get('/by-date/:date', patientController.getPatientsByDate);
router.delete('/delete/:id', patientController.deleteAppointment);
router.get('/update-status', patientController.updateActiveStatus);
router.put('/patients/:id', patientController.updateAppointment);
router.get('/patient/:id', patientController.getPatientById);


module.exports = router;
