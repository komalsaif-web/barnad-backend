const db = require('../config/db');

// 🧠 Auto-create patient table if it doesn't exist
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
}

// ✅ Create a new patient
exports.createPatient = async (req, res) => {
  const { name, phone_number, address, age, gender, disease } = req.body;

  try {
    await ensurePatientTableExists();

    const result = await db.query(
      `INSERT INTO patient (name, phone_number, address, age, gender, disease)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, phone_number, address, age, gender, disease]
    );

    res.status(201).json({
      message: 'Patient created successfully',
      patient: result.rows[0],
    });
  } catch (err) {
    console.error('Create Patient Error:', err);
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
    console.error('Get Patients Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
