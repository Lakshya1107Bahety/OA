const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'oa-sentinel.db');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

function run(sql, params = []) {
  const result = db.prepare(sql).run(params);
  return {
    lastID: Number(result.lastInsertRowid),
    changes: result.changes,
  };
}

function get(sql, params = []) {
  return db.prepare(sql).get(params);
}

function all(sql, params = []) {
  return db.prepare(sql).all(params);
}

function initDb() {
  run(`
    CREATE TABLE IF NOT EXISTS workers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS screenings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_id INTEGER NOT NULL,
      patient_name TEXT NOT NULL,
      patient_age INTEGER NOT NULL,
      patient_gender TEXT NOT NULL,
      patient_contact TEXT NOT NULL,
      height_cm REAL NOT NULL,
      weight_kg REAL NOT NULL,
      bmi REAL NOT NULL,
      pain_scale INTEGER NOT NULL,
      stiffness TEXT NOT NULL,
      pose_metrics TEXT NOT NULL,
      imu_metrics TEXT NOT NULL,
      risk_score REAL,
      risk_breakdown TEXT NOT NULL,
      recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(worker_id) REFERENCES workers(id)
    )
  `);

  const existingWorker = get('SELECT id FROM workers WHERE email = ?', ['healthworker@oa.local']);
  if (!existingWorker) {
    const passwordHash = bcrypt.hashSync('sentinel123', 10);
    run('INSERT INTO workers (email, password_hash) VALUES (?, ?)', ['healthworker@oa.local', passwordHash]);
  }
}

module.exports = {
  db,
  run,
  get,
  all,
  initDb,
};
