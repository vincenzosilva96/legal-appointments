import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import {db} from '../db.js';

import dotenv from 'dotenv';

dotenv.config();



const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// REGISTRAZIONE
router.post('/register', async (req, res) => {
  const { nome, cognome, numeroT, email, password } = req.body;

  if (!nome || !cognome || !numeroT || !email || !password) {
    return res.status(400).json({ error: 'Tutti i campi sono obbligatori.' });
  }

  db.query('SELECT * FROM utenti WHERE email = ?', [email], async (err, results) => {
    if (err) return res.status(500).json({ error: 'Errore interno del server' });
    if (results.length > 0) return res.status(400).json({ error: 'Email già registrata' });

    try {
      const hashedPassword = await bcrypt.hash(password, 10);

      //default
      const ruolo = 'cliente';

      db.query(
        'INSERT INTO utenti (nome, cognome, numeroT, email, password, ruolo) VALUES (?, ?, ?, ?, ?, ?)',
        [nome, cognome, numeroT, email, hashedPassword, ruolo],
        (err, result) => {
          if (err) return res.status(500).json({ error: 'Errore durante la registrazione' });
          res.json({ message: 'Registrazione avvenuta con successo!' });
        }
      );
    } catch (error) {
      res.status(500).json({ error: 'Errore durante la registrazione' });
    }
  });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;

  db.query('SELECT * FROM utenti WHERE email = ?', [email], async (err, results) => {
    if (err || results.length === 0) return res.status(401).json({ error: 'Email non trovata' });

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) return res.status(401).json({ error: 'Password errata' });

    const token = jwt.sign({id: user.id, nome: user.nome, cognome: user.cognome, numeroT: user.numeroT, ruolo: user.ruolo},JWT_SECRET,{ expiresIn: '2h' });

    res.json({ message: 'Login riuscito!', token });
  });
});

export default router;
