const db = require('../config/db');
const nodemailer = require('nodemailer');

// Email bhejne ka function
async function sendDoctorCredentials(toEmail, doctorId, password) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: `VRX System <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Your Doctor Credentials',
    text: `Doctor ID: ${doctorId}\nPassword: ${password}`,
  };

  await transporter.sendMail(mailOptions);
}

// Main Controller
exports.addAdmin = async (req, res) => {
  const { name, email, hospital, degree, password, doctor_id } = req.body;

  try {
    // ✅ Step 1: Create table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS admin (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        hospital TEXT,
        degree TEXT,
        password TEXT NOT NULL,
        doctor_id TEXT UNIQUE NOT NULL
      );
    `);

    // ✅ Step 2: Check for duplicate email or doctor_id
    const checkEmail = await db.query('SELECT * FROM admin WHERE email = $1', [email]);
    if (checkEmail.rows.length > 0) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const checkDoctorId = await db.query('SELECT * FROM admin WHERE doctor_id = $1', [doctor_id]);
    if (checkDoctorId.rows.length > 0) {
      return res.status(409).json({ error: 'Doctor ID already exists' });
    }

    // ✅ Step 3: Insert into DB
    const result = await db.query(
      'INSERT INTO admin (name, email, hospital, degree, password, doctor_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, email, hospital, degree, password, doctor_id]
    );

    // ✅ Step 4: Send Email to user
    await sendDoctorCredentials(email, doctor_id, password);

    res.status(201).json({
      message: 'Admin added and credentials emailed',
      admin: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
