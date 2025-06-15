const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();

const adminRoutes = require('./routes/adiminRoutes');

app.use(cors());
app.use(express.json());

app.use('/api/admin', adminRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
