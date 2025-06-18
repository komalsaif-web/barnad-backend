const db = require('../config/db');

// ✅ Ensure patient table and all necessary columns exist
async function ensurePatientTableExists() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS patient (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone_number TEXT,
      address TEXT,
      age INTEGER,
      gender TEXT,
      disease TEXT
    );
  `);

  const columns = [
    { name: 'appointment_date', type: 'DATE' },
    { name: 'appointment_time', type: 'TIME' },
    { name: 'doctor_id', type: 'TEXT REFERENCES admin(doctor_id) ON DELETE SET NULL' },
    { name: 'is_active', type: 'BOOLEAN DEFAULT FALSE' },
    { name: 'initial_complaints', type: 'TEXT' },
    { name: 'medical_history', type: 'TEXT' },
    { name: 'family_history', type: 'TEXT' },
    { name: 'social_history', type: 'TEXT' },
    { name: 'on_medications', type: 'TEXT' },
    { name: 'vitals', type: 'TEXT' },
    { name: 'allergies', type: 'TEXT' },
    { name: 'surgeries', type: 'TEXT' },
    { name: 'location', type: 'TEXT' },
    { name: 'professional', type: 'TEXT' }
  ];

  for (const col of columns) {
    const exists = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'patient' AND column_name = $1
    `, [col.name]);

    if (exists.rows.length === 0) {
      await db.query(`ALTER TABLE patient ADD COLUMN ${col.name} ${col.type}`);
    }
  }
}

// ✅ Create a new patient
exports.createPatient = async (req, res) => {
  const {
    name, phone_number, address, age, gender, disease,
    doctor_id, appointment_date, appointment_time,
    initial_complaints, medical_history, family_history, social_history,
    on_medications, vitals, allergies, surgeries, location, professional
  } = req.body;

  try {
    await ensurePatientTableExists();

    const doctorCheck = await db.query(
      'SELECT * FROM admin WHERE doctor_id = $1',
      [doctor_id]
    );
    if (doctorCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Doctor ID not found' });
    }

    const result = await db.query(`
      INSERT INTO patient (
        name, phone_number, address, age, gender, disease,
        appointment_date, appointment_time, doctor_id, is_active,
        initial_complaints, medical_history, family_history, social_history,
        on_medications, vitals, allergies, surgeries, location, professional
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, FALSE,
        $10, $11, $12, $13,
        $14, $15, $16, $17, $18, $19
      ) RETURNING *
    `, [
      name, phone_number, address, age, gender, disease,
      appointment_date, appointment_time, doctor_id,
      initial_complaints, medical_history, family_history, social_history,
      on_medications, vitals, allergies, surgeries, location, professional
    ]);

    res.status(201).json({ message: 'Patient created successfully', patient: result.rows[0] });
  } catch (err) {
    console.error('Create Patient Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ✅ Get all patients (names only)
exports.getAllPatients = async (req, res) => {
  try {
    await ensurePatientTableExists();
    const result = await db.query('SELECT id, name FROM patient');
    res.status(200).json({ patients: result.rows });
  } catch (err) {
    console.error('Get Patients Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ✅ Get patients by doctor ID
exports.getPatientsByDoctor = async (req, res) => {
  const { doctor_id } = req.params;
  try {
    await ensurePatientTableExists();
    const result = await db.query(`
      SELECT * FROM patient
      WHERE doctor_id = $1
      ORDER BY appointment_date ASC, appointment_time ASC
    `, [doctor_id]);
    res.status(200).json({ patients: result.rows });
  } catch (err) {
    console.error('Get Patients By Doctor Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ✅ Get patients by appointment date
exports.getPatientsByDate = async (req, res) => {
  const { date } = req.params;
  try {
    await ensurePatientTableExists();
    const result = await db.query(`
      SELECT * FROM patient
      WHERE appointment_date = $1
      ORDER BY appointment_time ASC
    `, [date]);
    res.status(200).json({ patients: result.rows });
  } catch (err) {
    console.error('Get Patients By Date Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ✅ Delete a patient appointment by ID
exports.deleteAppointment = async (req, res) => {
  const { id } = req.params;
  try {
    await ensurePatientTableExists();
    const check = await db.query('SELECT * FROM patient WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    await db.query('DELETE FROM patient WHERE id = $1', [id]);
    res.status(200).json({ message: 'Appointment deleted successfully' });
  } catch (err) {
    console.error('Delete Appointment Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ✅ Update is_active status based on appointment time
exports.updateActiveStatus = async (req, res) => {
  try {
    await ensurePatientTableExists();

    await db.query(`
      UPDATE patient
      SET is_active = TRUE
      WHERE appointment_date = CURRENT_DATE
        AND (
          (appointment_date + appointment_time)::timestamp 
          BETWEEN (CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Karachi' - INTERVAL '1 hour')
          AND (CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Karachi')
        )
    `);

    await db.query(`
      UPDATE patient
      SET is_active = FALSE
      WHERE appointment_date IS NULL
         OR appointment_time IS NULL
         OR appointment_date != CURRENT_DATE
         OR NOT (
            (appointment_date + appointment_time)::timestamp 
            BETWEEN (CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Karachi' - INTERVAL '1 hour')
            AND (CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Karachi')
         )
    `);

    const result = await db.query(`
      SELECT 
        name,
        appointment_date,
        appointment_time,
        (appointment_date + appointment_time)::timestamp AS appointment_timestamp,
        TO_CHAR((CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Karachi'), 'YYYY-MM-DD HH24:MI:SS') AS current_time_lahore,
        CASE
          WHEN is_active THEN 'active'
          ELSE 'no active'
        END AS status
      FROM patient
      ORDER BY appointment_date ASC NULLS LAST, appointment_time ASC NULLS LAST
    `);

    res.status(200).json({
      message: 'Patient statuses updated successfully',
      patients: result.rows
    });
  } catch (err) {
    console.error('Update Active Status Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ✅ Update appointment and medical info by patient ID
exports.updateAppointment = async (req, res) => {
  const { id } = req.params;
  const {
    appointment_date, appointment_time,
    initial_complaints, medical_history, family_history, social_history,
    on_medications, vitals, allergies, surgeries, location, professional
  } = req.body;

  try {
    await ensurePatientTableExists();
    const check = await db.query('SELECT * FROM patient WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const result = await db.query(`
      UPDATE patient
      SET appointment_date = $1,
          appointment_time = $2,
          initial_complaints = $3,
          medical_history = $4,
          family_history = $5,
          social_history = $6,
          on_medications = $7,
          vitals = $8,
          allergies = $9,
          surgeries = $10,
          location = $11,
          professional = $12,
          is_active = FALSE
      WHERE id = $13
      RETURNING *
    `, [
      appointment_date, appointment_time,
      initial_complaints, medical_history, family_history, social_history,
      on_medications, vitals, allergies, surgeries, location, professional,
      id
    ]);

    res.status(200).json({
      message: 'Appointment updated successfully',
      updated_patient: result.rows[0]
    });
  } catch (err) {
    console.error('Update Appointment Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ✅ Get single patient by ID
exports.getPatientById = async (req, res) => {
  const { id } = req.params;

  try {
    await ensurePatientTableExists();

    const result = await db.query('SELECT * FROM patient WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    res.status(200).json({ patient: result.rows[0] });
  } catch (err) {
    console.error('Get Patient By ID Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

