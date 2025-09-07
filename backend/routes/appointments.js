import express from 'express';
import { db } from '../db.js';

import verificaToken from '../middleware/auth.js';
import verificaRuolo from '../middleware/verificaRuolo.js';
import { inviaEmail } from "../utils/mailer.js";

import multer from "multer";
import multerS3 from "multer-s3";
import s3 from "../s3.js";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.S3_BUCKET_NAME, 
    acl: "private", 
    key: (req, file, cb) => {
      const userId = req.user.id;
      const timestamp = Date.now();
      const filename = `utente_${userId}/${timestamp}-${file.originalname}`;
      cb(null, filename);
    },
  }),
});

router.get('/tipi', verificaToken, verificaRuolo('admin'), (req, res) => {
  db.query('SELECT * FROM appuntamenti', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

router.post('/book', verificaToken, (req, res) => {
  const { slot_id } = req.body;
  const user_id = req.user.id;
  const nome_cliente = req.user.nome;

  const insert = 'INSERT INTO prenotazioni (slot_id, nome_cliente) VALUES (?, ?)';
  const update = 'UPDATE slot_appuntamenti SET disponibile = FALSE WHERE id = ?';

  db.query(insert, [slot_id, nome_cliente], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });

    db.query(update, [slot_id], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ message: 'Prenotazione avvenuta con successo!' });
    });
  });
});

router.post('/add', (req, res) => {
  const { tipo } = req.body;
  const query = 'INSERT INTO appuntamenti (nome) VALUES (?)';
  db.query(query, [tipo], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Tipo appuntamento aggiunto!', id: result.insertId });
  });
});

router.get('/available-slots', (req, res) => {
  const query = `
    SELECT s.id, t.nome AS tipo, s.data, s.orario
    FROM slot_appuntamenti s
    JOIN appuntamenti t ON s.tipo_id = t.id
    WHERE s.disponibile = TRUE
    ORDER BY s.data, s.orario
  `;
  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

//CLIENT ROUTE
// tutti gli slot disponibili
router.get('/slots', verificaToken, (req, res) => {
  const query = `
    SELECT slot_appuntamenti.id, appuntamenti.nome AS tipo_nome, slot_appuntamenti.data, slot_appuntamenti.orario, slot_appuntamenti.disponibile
    FROM slot_appuntamenti
    JOIN appuntamenti ON slot_appuntamenti.tipo_id = appuntamenti.id

  `;
  //WHERE slot_appuntamenti.disponibile > 0
  db.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({ error: 'Errore recuperando gli slot disponibile.' });
    }
    res.json(results);
  });
});



// Prenota uno slot
router.post('/prenota', verificaToken, (req, res) => {
  const userId = req.user.id;
  const { slot_id, tipo_nome, data  } = req.body;

  if (!slot_id) return res.status(400).json({ error: 'Slot mancante.' });

  db.query('SELECT disponibile,tipo_id FROM slot_appuntamenti WHERE id = ?', [slot_id], (err, results) => {
    if (err || results.length === 0) {
      return res.status(404).json({ error: 'Slot non trovato.' });
    }
    //console.log(results);
    const disponibile = results[0].disponibile;
    const tipo_id = results[0].tipo_id
    const soloData = new Date(data).toISOString().split('T')[0];
    if (disponibile <= 0) {
     //return res.status(400).json({ error: 'Nessuna disponibilità per questo slot.' });
      db.query(
        'SELECT * FROM lista_attesa WHERE utente_id = ? AND tipo_id = ? AND data = ?',
        [userId, tipo_id, soloData],
        (err, results) => {
          if (err) return res.status(500).json({ error: err.message });
          console.log(results);
          if (results.length > 0) {
            return res.status(409).json({ error: 'Sei già in lista d’attesa per questo giorno e tipo.' });
          }

          db.query(
            'INSERT INTO lista_attesa (utente_id, tipo_id, data, data_iscrizione) VALUES (?, ?, ?, NOW())',
            [userId, tipo_id, data],
            (err) => {
              if (err) return res.status(500).json({ error: err.message });
              res.json({ message: 'Sei stato inserito in lista d’attesa.' });
            }
          );
        }
      );
        return;
    }

    db.query(
      'INSERT INTO prenotazioni (nome_cliente, slot_id) VALUES (?, ?)',
      [userId, slot_id],
      (err2) => {
        if (err2) {
          return res.status(500).json({ error: 'Errore nella prenotazione.' });
        }

        db.query(
          'UPDATE slot_appuntamenti SET disponibile = disponibile - 1 WHERE id = ?',
          [slot_id],
          (err3) => {
            if (err3) {
              return res.status(500).json({ error: 'Errore aggiornando disponibilità.' });
            }

            res.json({ message: 'Prenotazione effettuata con successo!' });
          }
        );
      }
    );
  });
});

// API per vedere le proprie prenotazioni
router.get('/mie-prenotazioni', verificaToken, (req, res) => {
  const userId = req.user.id;
  const query = `
    SELECT prenotazioni.id, appuntamenti.nome AS tipo_nome, slot_appuntamenti.data
    FROM prenotazioni
    JOIN slot_appuntamenti ON prenotazioni.slot_id = slot_appuntamenti.id
    JOIN appuntamenti ON slot_appuntamenti.tipo_id = appuntamenti.id
    WHERE prenotazioni.nome_cliente = ?
  `;
  
  db.query(query, [userId], (err, results) => {
    if (err) return res.status(500).json({ error: 'Errore caricando prenotazioni.' });
    res.json(results);
  });
});

//api per cancellare un appuntamento e mettersi in lsita
router.delete('/cancella/:id', verificaToken, (req, res) => {
  const prenotazioneId = req.params.id;
  const userId = req.user.id;

  db.query(
    'SELECT slot_id FROM prenotazioni WHERE id = ? AND nome_cliente = ?',
    [prenotazioneId, userId],
    (err, results) => {
      if (err || results.length === 0) {
        return res.status(404).json({ error: 'Prenotazione non trovata.' });
      }

      const slotId = results[0].slot_id;

      // Cancella la prenotazione
      db.query('DELETE FROM prenotazioni WHERE id = ?', [prenotazioneId], (err2) => {
        if (err2) {
          return res.status(500).json({ error: 'Errore cancellando la prenotazione.' });
        }

        db.query('UPDATE slot_appuntamenti SET disponibile = disponibile + 1 WHERE id = ?', [slotId], (err3) => {
          if (err3) {
            return res.status(500).json({ error: 'Errore aggiornando disponibilità.' });
          }

          db.query('SELECT tipo_id, data FROM slot_appuntamenti WHERE id = ?', [slotId], (err4, results2) => {
            if (err4 || results2.length === 0) {
              return res.json({ message: 'Prenotazione cancellata. Nessuno in lista d’attesa.' });
            }

            const { tipo_id, data } = results2[0];

            db.query(
              'SELECT * FROM lista_attesa WHERE tipo_id = ? AND data = ? ORDER BY data_iscrizione ASC LIMIT 1',
              [tipo_id, data],
              (err5, attesaResults) => {
                if (err5 || attesaResults.length === 0) {
                  return res.json({ message: 'Prenotazione cancellata. Nessuno in lista d’attesa.' });
                }

                const utenteAttesa = attesaResults[0];
                console.log("Utente in lista d'attesa:", utenteAttesa);
                // Recuperare email utente
                db.query('SELECT email FROM utenti WHERE id = ?', [utenteAttesa.utente_id], (err6, userRes) => {
                  if (err6 || userRes.length === 0) {
                    return res.status(500).json({ error: 'Errore recupero email.' });
                  }

                  const emailUtente = userRes[0].email;
                  //console.log(emailUtente); // 
                  db.query(
                    'INSERT INTO prenotazioni (nome_cliente, slot_id) VALUES (?, ?)',
                    [utenteAttesa.utente_id, slotId],
                    (err7) => {
                      if (err7) return res.status(500).json({ error: 'Errore prenotando per utente in lista.' });

                      db.query('UPDATE slot_appuntamenti SET disponibile = disponibile - 1 WHERE id = ?', [slotId]);

                      db.query('DELETE FROM lista_attesa WHERE id = ?', [utenteAttesa.id]);

                      // Invi0 email
                     console.log(emailUtente);
                      inviaEmail(
                        emailUtente,
                        "Prenotazione confermata automaticamente",
                        `Ciao! Uno slot si è liberato per il giorno e ti è stato automaticamente assegnato.`
                      ).catch(console.error);
                      res.json({ message: 'Prenotazione cancellata. Utente in lista notificato e prenotato automaticamente.' });
                    }
                  );
                });
              }
            );
          });
        });
      });
    }
  );
});


//LISTA D'ATTESA
router.post('/lista-attesa', verificaToken, (req, res) => {
  const utente_id = req.user.id;
  const { tipo_id, data } = req.body;

  db.query(
    'SELECT * FROM lista_attesa WHERE utente_id = ? AND tipo_id = ? AND data = ?',
    [utente_id, tipo_id, data],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length > 0) {
        return res.status(409).json({ error: 'Sei già in lista d’attesa per questo giorno e tipo.' });
      }

      db.query(
        'INSERT INTO lista_attesa (utente_id, tipo_id, data, data_iscrizione) VALUES (?, ?, ?, NOW())',
        [utente_id, tipo_id, data],
        (err) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ message: 'Sei stato inserito in lista d’attesa.' });
        }
      );
    }
  );
});


router.get('/mia-lista-attesa', verificaToken, (req, res) => {
  const utente_id = req.user.id;

  db.query(
    `SELECT la.id, la.data, a.tipo 
     FROM lista_attesa la 
     JOIN appuntamenti a ON la.tipo_id = a.id 
     WHERE la.utente_id = ?`,
    [utente_id],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
    }
  );
});

router.post('/upload-documento/:id', verificaToken, upload.array('documenti', 5), (req, res) => {
  const prenotazioneId = req.params.id;
  const userId = req.user.id;
  const files = req.files;

  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'Nessun file ricevuto.' });
  }

  // Gli URL degli oggetti caricati su S3
  const urls = files.map(f => f.location).join(';');

  db.query(
    'SELECT * FROM prenotazioni WHERE id = ? AND nome_cliente = ?',
    [prenotazioneId, userId],
    (err, results) => {
      if (err) return res.status(500).json({ error: 'Errore nella verifica prenotazione.' });
      if (results.length === 0) {
        return res.status(404).json({ error: 'Prenotazione non trovata o non autorizzato.' });
      }

      db.query(
        'UPDATE prenotazioni SET documenti = ? WHERE id = ?',
        [urls, prenotazioneId],
        (err2) => {
          if (err2) return res.status(500).json({ error: 'Errore nel salvataggio del documento.' });
          res.json({ message: 'Documenti caricati con successo.', urls });
        }
      );
    }
  );
});

// Appuntamenti per una data specifica (per calendario)
router.get('/day/:data', verificaToken, verificaRuolo('admin'), (req, res) => {
  const { data } = req.params;
  //onsole.log("Data richiesta:", data);  // DEBUG

  const query = `
    SELECT 
      s.id AS slot_id,
      u.nome AS utente_nome,
      a.nome AS tipo_nome,
      s.data,
      s.orario
    FROM slot_appuntamenti s
    LEFT JOIN prenotazioni p ON p.slot_id = s.id
    LEFT JOIN utenti u ON p.nome_cliente = u.id
    JOIN appuntamenti a ON s.tipo_id = a.id
    WHERE DATE(s.data) = ?
    ORDER BY s.orario ASC;

  `;

  db.query(query, [data], (err, results) => {
    if (err) return res.status(500).json({ error: 'Errore recuperando gli appuntamenti giornalieri.' });
    //console.log("Appuntamenti trovati:", results);  
    res.json(results);
  });
});


// API per creare direttamente un appuntamento (admin)
// Aggiunge un nuovo slot di appuntamento
router.post('/add-slot', verificaToken, verificaRuolo('admin'), (req, res) => {
  const { tipo_id, data,  orario } = req.body;

  if (!tipo_id || !data || !orario) {
    return res.status(400).json({ error: 'tipo_id, data e orario sono obbligatori.' });
  }

  const query = `
    INSERT INTO slot_appuntamenti (tipo_id, data, orario, disponibile)
    VALUES (?, ?, ?, 1)
  `;

  db.query(query, [tipo_id, data, orario], (err, result) => {
    if (err) return res.status(500).json({ error: 'Errore durante l’inserimento dello slot.' });

    res.json({
      message: 'Appuntamento aggiunto con successo.',
      slot_id: result.insertId,
      data,
      orario,
      tipo_id
    });
  });
});

router.delete('/delete/:id', verificaToken, verificaRuolo('admin'), (req, res) => {
  const idSlot = req.params.id;

  // Recupera tutte le prenotazioni per questo slot
  db.query(
    `SELECT p.id AS prenotazione_id, u.email, u.nome 
     FROM prenotazioni p
     JOIN utenti u ON p.nome_cliente = u.id
     WHERE p.slot_id = ?`,
    [idSlot],
    (err, prenotazioni) => {
      if (err) return res.status(500).json({ error: err.message });

      // Cancelliamo prima lo slot
      db.query('DELETE FROM slot_appuntamenti WHERE id = ?', [idSlot], (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });

        // Cancella anche le prenotazioni associate
        db.query('DELETE FROM prenotazioni WHERE slot_id = ?', [idSlot], (err3) => {
          if (err3) console.error('Errore cancellando prenotazioni associate:', err3);

          // Invia email a ciascun utente prenotato
          prenotazioni.forEach(p => {
            const emailBody = `
              Ciao ${p.nome},

              Ti informiamo che il tuo appuntamento prenotato per questo slot è stato cancellato dall'amministrazione.
              Ci scusiamo per il disagio.

              Cordiali saluti,
              Studio Legale Dott. Difesa Rossi
            `;

            inviaEmail(p.email, 'Cancellazione Appuntamento', emailBody)
              .catch(err => console.error('Errore invio email:', err));
          });

          res.json({ message: 'Slot e prenotazioni cancellate con successo. Se prenotato l Utente verrà notificato via email.' });
        });
      });
    }
  );
});

router.get('/utente/documenti', verificaToken, (req, res) => {
  const userId = req.user.id;

  const query = `
    SELECT p.id AS prenotazione_id, p.documenti, s.data, s.orario
    FROM prenotazioni p
    LEFT JOIN slot_appuntamenti s ON p.slot_id = s.id
    WHERE p.nome_cliente = ? AND p.documenti IS NOT NULL
  `;

  db.query(query, [userId], async (err, results) => {
    if (err) return res.status(500).json({ error: 'Errore caricando documenti.' });

    try {
      const docs = await Promise.all(results.map(async (row) => {
        const urls = row.documenti.split(';'); 
        const signedUrls = await Promise.all(urls.map(async (key) => {
          const command = new GetObjectCommand({ 
            Bucket: 'legal-appointments-docs', 
            Key: key.replace(/^.*?\/utente_\d+\//, `utente_${userId}/`) 
          });
          return getSignedUrl(s3, command, { expiresIn: 60 * 5 }); // URL valido 5 minuti
        }));
        return {
          data: row.data,       
          orario: row.orario,    
          documenti: signedUrls
        };
      }));

      res.json(docs);
    } catch (error) {
      console.error('Errore generando URL firmati:', error);
      res.status(500).json({ error: 'Errore generando URL firmati.' });
    }
  });
});

// PUT /api/utente/aggiorna-password
router.put('/aggiorna-password', verificaToken, async (req, res) => {
  const userId = req.user.id;
  const { password } = req.body;

  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'La password deve essere lunga almeno 6 caratteri.' });
  }

  try {

    const bcrypt = await import('bcrypt');
    const hashedPassword = await bcrypt.hash(password, 10);

    db.query(
      'UPDATE utenti SET password = ? WHERE id = ?',
      [hashedPassword, userId],
      async (err, result) => {
        if (err) return res.status(500).json({ error: 'Errore aggiornando la password.' });

        db.query('SELECT email, nome FROM utenti WHERE id = ?', [userId], async (err2, rows) => {
          if (err2 || rows.length === 0) return res.status(500).json({ error: 'Password aggiornata, ma impossibile recuperare email.' });

          const user = rows[0];
          
          try {
            await inviaEmail(
              user.email,
              "Password modificata",
              `Ciao ${user.nome},\n\nLa tua password è stata modificata correttamente.\n\nSe non sei stato tu, contatta subito il nostro supporto.`
            );
            res.json({ message: 'Password aggiornata correttamente e email inviata.' });
          } catch (emailErr) {
            console.error('Errore invio email:', emailErr);
            res.json({ message: 'Password aggiornata, ma errore invio email.' });
          }
        });
      }
    );
  } catch (err) {
    console.error('Errore server aggiornamento password:', err);
    res.status(500).json({ error: 'Errore server durante l\'aggiornamento della password.' });
  }
});



export default router;
