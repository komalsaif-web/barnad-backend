const db = require('../config/db');
const nodemailer = require('nodemailer');

// 📨 Function to send email
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

// ✅ Add new doctor/admin
exports.addAdmin = async (req, res) => {
  const { name, email, hospital, degree, password, doctor_id } = req.body;

  try {
    // Step 1: Ensure table exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS admin (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        hospital TEXT,
        degree TEXT,
        password TEXT NOT NULL,
        doctor_id TEXT UNIQUE NOT NULL,
        is_first_login BOOLEAN DEFAULT true
      );
    `);

    // Step 2: Check for duplicates
    const emailExists = await db.query('SELECT * FROM admin WHERE email = $1', [email]);
    if (emailExists.rows.length > 0) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const doctorIdExists = await db.query('SELECT * FROM admin WHERE doctor_id = $1', [doctor_id]);
    if (doctorIdExists.rows.length > 0) {
      return res.status(409).json({ error: 'Doctor ID already exists' });
    }

    // Step 3: Insert into DB
    const result = await db.query(
      'INSERT INTO admin (name, email, hospital, degree, password, doctor_id, is_first_login) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [name, email, hospital, degree, password, doctor_id, true]
    );

    // Step 4: Send credentials by email
    await sendDoctorCredentials(email, doctor_id, password);

    res.status(201).json({
      message: 'Admin added and credentials emailed',
      admin: result.rows[0],
    });

  } catch (err) {
    console.error('Add Admin Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 🔐 Doctor Login
exports.loginDoctor = async (req, res) => {
  const { doctor_id, password } = req.body;

  try {
    const result = await db.query('SELECT * FROM admin WHERE doctor_id = $1', [doctor_id]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Doctor ID not found' });
    }

    const doctor = result.rows[0];

    if (doctor.password !== password) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    res.status(200).json({
      message: 'Login successful',
      doctor: {
        id: doctor.id,
        name: doctor.name,
        email: doctor.email,
        hospital: doctor.hospital,
        degree: doctor.degree,
        doctor_id: doctor.doctor_id,
        is_first_login: doctor.is_first_login
      },
    });

  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 🔁 Change Password
exports.changePassword = async (req, res) => {
  const { doctor_id, password, newPassword } = req.body;

  try {
    const result = await db.query('SELECT * FROM admin WHERE doctor_id = $1', [doctor_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Doctor ID not found' });
    }

    const doctor = result.rows[0];

    if (doctor.password !== password) {
      return res.status(401).json({ error: 'Old password is incorrect' });
    }

    await db.query(
      'UPDATE admin SET password = $1, is_first_login = false WHERE doctor_id = $2',
      [newPassword, doctor_id]
    );

    res.status(200).json({ message: 'Password updated successfully' });

  } catch (err) {
    console.error('Change Password Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
