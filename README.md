# OA-Sentinel

OA-Sentinel is a **rule-based OA screening web app** for health workers.

## Features implemented

- Health worker email/password login with session-based auth.
- Guided screening flow:
  - Landing page + Start Screening
  - Patient registration
  - Medical information (BMI auto-calculated, pain slider, stiffness yes/no)
  - Movement tests (squat, bend, walk) with MediaPipe Pose overlay + BLE IMU capture scaffolding
  - Results charts (knee angle line chart + IMU metrics radar chart)
  - OA risk output from a configurable rule function
  - Awareness/education section
  - Patient history view tied to logged-in worker
- SQLite database persistence for all screening records.

## Run locally

```bash
npm install
npm start
```

Open: `http://localhost:3000`

## Demo login

- Email: `healthworker@oa.local`
- Password: `sentinel123`

## BLE UUID setup

Update placeholder UUIDs in `/public/app.js`:

- `BLE_CONFIG.serviceUuid`
- `BLE_CONFIG.characteristicUuid`

## Risk logic setup

`/config/risk-rules.json` is a scaffold. Add your clinician-approved rule weights/logic there.

No ML training claims are used in this app; risk is explicitly shown as rule-based.
