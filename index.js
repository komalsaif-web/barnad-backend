const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();

// ✅ Import your routes
const adminRoutes = require('./routes/adiminRoutes'); // ensure correct filename

// ✅ Middleware
app.use(cors());
app.use(express.json());

// ✅ Routes
app.use('/api/admin', adminRoutes);

// ✅ Root route to fix "Cannot GET /"
app.get('/', (req, res) => {
  res.send('🚀 Backend is working! Welcome to the VRX API.');
});

// ✅ Server listen (for local dev; ignored by Vercel)
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

// ✅ Export app for Vercel deployment
module.exports = app;
