const db = require('../config/db');

// 🧠 Ensure patient table and all columns exist
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

  // 👇 Check + Add all required columns
  const columns = [
    { name: 'appointment_date', type: 'DATE' },
    { name: 'appointment_time', type: 'TIME' },
    { name: 'doctor_id', type: 'TEXT REFERENCES admin(doctor_id) ON DELETE SET NULL' },
    { name: 'is_active', type: 'BOOLEAN DEFAULT FALSE' }
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
    name,
    phone_number,
    address,
    age,
    gender,
    disease,
    doctor_id,
    appointment_date, // format: YYYY-MM-DD
    appointment_time  // format: HH:mm:ss
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
        name, phone_number, address, age, gender, disease,
        appointment_date, appointment_time, doctor_id, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE) RETURNING *`,
      [
        name,
        phone_number,
        address,
        age,
        gender,
        disease,
        appointment_date,
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
      `SELECT id, name, appointment_date, appointment_time, disease, age, gender, phone_number, is_active
       FROM patient
       WHERE doctor_id = $1
       ORDER BY appointment_date ASC, appointment_time ASC`,
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
       WHERE appointment_date = $1
       ORDER BY appointment_time ASC`,
      [date]
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

// ✅ Update is_active status (active = current date and time within 1 hour)
exports.updateActiveStatus = async (req, res) => {
  try {
    await ensurePatientTableExists();

    // 🕒 Get current PKT time from DB (not JS)
    const currentTimeRes = await db.query(`SELECT CURRENT_DATE AT TIME ZONE 'Asia/Karachi' AS current_date, CURRENT_TIME AT TIME ZONE 'Asia/Karachi' AS current_time`);
    const { current_date, current_time } = currentTimeRes.rows[0];

    console.log("📅 Current Date (PKT):", current_date);
    console.log("⏰ Current Time (PKT):", current_time);

    // ✅ Set is_active = TRUE if current PKT date and time match criteria
    await db.query(`
      UPDATE patient
      SET is_active = TRUE
      WHERE appointment_date = CURRENT_DATE
        AND appointment_time <= CURRENT_TIME AT TIME ZONE 'Asia/Karachi'
        AND CURRENT_TIME AT TIME ZONE 'Asia/Karachi' < appointment_time + INTERVAL '1 hour'
    `);

    // ✅ Set is_active = FALSE for others
    await db.query(`
      UPDATE patient
      SET is_active = FALSE
      WHERE appointment_date != CURRENT_DATE
         OR CURRENT_TIME AT TIME ZONE 'Asia/Karachi' < appointment_time
         OR CURRENT_TIME AT TIME ZONE 'Asia/Karachi' >= appointment_time + INTERVAL '1 hour'
    `);

    // ✅ Fetch patient statuses with date + time
    const result = await db.query(`
      SELECT 
        name,
        appointment_date,
        appointment_time,
        CASE
          WHEN is_active THEN 'active'
          ELSE 'no active'
        END AS status
      FROM patient
      ORDER BY appointment_date ASC, appointment_time ASC
    `);

    res.status(200).json({
      message: 'Patient statuses updated successfully',
      patients: result.rows,
    });
  } catch (err) {
    console.error('Update Active Status Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

