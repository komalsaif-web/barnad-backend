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
    // Step 1: Ensure table exists (without is_first_login)
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
      'INSERT INTO admin (name, email, hospital, degree, password, doctor_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, email, hospital, degree, password, doctor_id]
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
      },
    });

  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 🔑 Change Password 
exports.changePassword = async (req, res) => {
  const { doctor_id, password, newPassword, confirmPassword } = req.body;

  try {
    // 1. Find doctor by ID
    const result = await db.query('SELECT * FROM admin WHERE doctor_id = $1', [doctor_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Doctor ID not found' });
    }

    const doctor = result.rows[0];

    // 2. Check current password
    if (doctor.password !== password) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // 3. Check if new and confirm password match
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New password and confirm password do not match' });
    }

    // 4. Update password
    await db.query(
      'UPDATE admin SET password = $1 WHERE doctor_id = $2',
      [newPassword, doctor_id]
    );

    res.status(200).json({ message: 'Password updated successfully' });

  } catch (err) {
    console.error('Change Password Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 📋 Get all doctor names
exports.getAllDoctorNames = async (req, res) => {
  try {
    const result = await db.query('SELECT name FROM admin ORDER BY name ASC');
    const doctorNames = result.rows.map(row => row.name);

    res.status(200).json({ doctors: doctorNames });
  } catch (err) {
    console.error('Get All Doctor Names Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
