import mysql from 'mysql2';
import dotenv from "dotenv";

dotenv.config();

export const db = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  timezone: 'Z',
  dateStrings: true
});

db.connect(err => {
  if (err) throw err;
  console.log('Connessione al database RDS riuscita!');
});