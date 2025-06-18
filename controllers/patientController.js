const db = require('../config/db');

// 🧠 Ensure patient table and columns exist
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

  const appointmentTimeCheck = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'patient' AND column_name = 'appointment_time'
  `);
  if (appointmentTimeCheck.rows.length === 0) {
    await db.query(`ALTER TABLE patient ADD COLUMN appointment_time TIMESTAMP`);
  }

  const doctorIdCheck = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'patient' AND column_name = 'doctor_id'
  `);
  if (doctorIdCheck.rows.length === 0) {
    await db.query(`
      ALTER TABLE patient ADD COLUMN doctor_id TEXT REFERENCES admin(doctor_id) ON DELETE SET NULL
    `);
  }

  const isActiveCheck = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'patient' AND column_name = 'is_active'
  `);
  if (isActiveCheck.rows.length === 0) {
    await db.query(`ALTER TABLE patient ADD COLUMN is_active BOOLEAN DEFAULT FALSE`);
  }
}

// ✅ Create a new patient
exports.createPatient = async (req, res) => {
  const {
    name,
    phone_number,
    address,
    age,
    gender,
    disease,
    doctor_id,
    appointment_time,
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

    const result = await db.query(
      `INSERT INTO patient (
        name, phone_number, address, age, gender, disease, appointment_time, doctor_id, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE) RETURNING *`,
      [
        name,
        phone_number,
        address,
        age,
        gender,
        disease,
        appointment_time,
        doctor_id,
      ]
    );

    res.status(201).json({
      message: 'Patient created successfully',
      patient: result.rows[0],
    });
  } catch (err) {
    console.error('Create Patient Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ✅ Get all patient names
exports.getAllPatients = async (req, res) => {
  try {
    await ensurePatientTableExists();

    const result = await db.query('SELECT id, name FROM patient');

    res.status(200).json({
      patients: result.rows,
    });
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

    const result = await db.query(
      `SELECT id, name, appointment_time, disease, age, gender, phone_number, is_active
       FROM patient
       WHERE doctor_id = $1
       ORDER BY appointment_time ASC`,
      [doctor_id]
    );

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

    const result = await db.query(
      `SELECT id, name, appointment_time, disease, age, gender, phone_number, doctor_id, is_active
       FROM patient
       WHERE DATE(appointment_time) = $1
       ORDER BY appointment_time ASC`,
      [date] // format: 'YYYY-MM-DD'
    );

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

    const check = await db.query(`SELECT * FROM patient WHERE id = $1`, [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    await db.query(`DELETE FROM patient WHERE id = $1`, [id]);

    res.status(200).json({ message: 'Appointment deleted successfully' });
  } catch (err) {
    console.error('Delete Appointment Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ✅ Update is_active status and return name with status
exports.updateActiveStatus = async (req, res) => {
  try {
    await ensurePatientTableExists();

    // ✅ 1. Set is_active = true if appointment time is now ±1 hour
    await db.query(`
      UPDATE patient
      SET is_active = TRUE
      WHERE appointment_time <= NOW()
        AND NOW() < appointment_time + INTERVAL '1 hour'
    `);

    // ✅ 2. Set is_active = false otherwise
    await db.query(`
      UPDATE patient
      SET is_active = FALSE
      WHERE appointment_time + INTERVAL '1 hour' <= NOW()
         OR NOW() < appointment_time
    `);

    // ✅ 3. Fetch names with status
    const result = await db.query(`
      SELECT name, 
        CASE 
          WHEN is_active THEN 'active' 
          ELSE 'no active' 
        END AS status
      FROM patient
      ORDER BY appointment_time ASC
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
