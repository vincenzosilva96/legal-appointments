import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import appointmentsRoute from './routes/appointments.js';
import authRoutes from './routes/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use('/uploads', express.static('uploads'));

app.use(cors());
app.use(express.json());

app.use('/api/appointments', appointmentsRoute);
app.use('/api/auth', authRoutes);

app.use(express.static(path.join(__dirname, '../frontend')));

// Fallback 
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/homepage.html'));
});

app.listen(3000, () => {
  console.log(' Server avviato su http://localhost:3000');
});
