const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const { initDb, get, run, all } = require('./src/db');
const { computeRiskScore } = require('./src/riskEngine');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'oa-sentinel-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: 'auto',
      maxAge: 1000 * 60 * 60 * 8,
    },
  }),
);

app.use((req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
});

app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const submittedToken = req.body?._csrf || req.get('x-csrf-token');
    if (!submittedToken || submittedToken !== req.session.csrfToken) {
      return res.status(403).send('Invalid CSRF token.');
    }
  }
  return next();
});

function ensureAuth(req, res, next) {
  if (!req.session.worker) {
    return res.redirect('/login');
  }

  return next();
}

app.get('/', (_req, res) => {
  res.redirect('/sentinel');
});

app.get('/login', (req, res) => {
  if (req.session.worker) {
    return res.redirect('/sentinel');
  }

  return res.render('login', { error: null, csrfToken: req.session.csrfToken });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).render('login', { error: 'Please enter both email and password.', csrfToken: req.session.csrfToken });
  }

  const worker = get('SELECT id, email, password_hash FROM workers WHERE email = ?', [email.trim().toLowerCase()]);
  if (!worker) {
    return res.status(401).render('login', { error: 'Invalid credentials.', csrfToken: req.session.csrfToken });
  }

  const isMatch = bcrypt.compareSync(password, worker.password_hash);
  if (!isMatch) {
    return res.status(401).render('login', { error: 'Invalid credentials.', csrfToken: req.session.csrfToken });
  }

  req.session.worker = {
    id: worker.id,
    email: worker.email,
  };

  return res.redirect('/sentinel');
});

app.post('/logout', ensureAuth, (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.get('/sentinel', ensureAuth, (req, res) => {
  res.render('sentinel', { csrfToken: req.session.csrfToken });
});

app.get('/api/history', ensureAuth, (req, res) => {
  const searchText = (req.query.search || '').toString().trim();
  let rows;

  if (searchText) {
    rows = all(
      `
        SELECT id, patient_name, patient_age, patient_gender, patient_contact, bmi, pain_scale, stiffness, risk_score, recorded_at
        FROM screenings
        WHERE worker_id = ? AND patient_name LIKE ?
        ORDER BY recorded_at DESC
      `,
      [req.session.worker.id, `%${searchText}%`],
    );
  } else {
    rows = all(
      `
        SELECT id, patient_name, patient_age, patient_gender, patient_contact, bmi, pain_scale, stiffness, risk_score, recorded_at
        FROM screenings
        WHERE worker_id = ?
        ORDER BY recorded_at DESC
        LIMIT 50
      `,
      [req.session.worker.id],
    );
  }

  return res.json({ rows });
});

app.post('/api/screenings', ensureAuth, (req, res) => {
  const { patient, medical, movement, imu, derived } = req.body;

  if (!patient || !medical || !movement || !imu || !derived) {
    return res.status(400).json({ error: 'Incomplete screening payload.' });
  }

  const riskInput = {
    age: Number(patient.age ?? 0),
    bmi: Number(derived.bmi ?? 0),
    painScale: Number(medical.painScale ?? 0),
    stiffnessBinary: medical.stiffness === 'yes' ? 1 : 0,
    cadence: Number(imu.cadence ?? 0),
    strideVariability: Number(imu.strideVariability ?? 0),
    kneeRotation: Number(movement.kneeRotationAverage ?? 0),
  };

  const risk = computeRiskScore(riskInput);

  const result = run(
    `
      INSERT INTO screenings (
        worker_id,
        patient_name,
        patient_age,
        patient_gender,
        patient_contact,
        height_cm,
        weight_kg,
        bmi,
        pain_scale,
        stiffness,
        pose_metrics,
        imu_metrics,
        risk_score,
        risk_breakdown
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      req.session.worker.id,
      patient.name,
      Number(patient.age),
      patient.gender,
      patient.contact,
      Number(medical.heightCm),
      Number(medical.weightKg),
      Number(derived.bmi),
      Number(medical.painScale),
      medical.stiffness,
      JSON.stringify(movement),
      JSON.stringify(imu),
      risk.riskPercentage,
      JSON.stringify({
        message: risk.message,
        appliedRules: risk.appliedRules,
      }),
    ],
  );

  return res.status(201).json({
    screeningId: result.lastID,
    riskPercentage: risk.riskPercentage,
    riskMessage: risk.message,
    appliedRules: risk.appliedRules,
  });
});

app.use((error, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error(error);
  res.status(500).send('Something went wrong. Please try again.');
});

try {
  initDb();
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`OA-Sentinel running on http://localhost:${PORT}`);
  });
} catch (error) {
  // eslint-disable-next-line no-console
  console.error('Failed to initialize app:', error);
  process.exit(1);
}
