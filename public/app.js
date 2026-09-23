const steps = Array.from(document.querySelectorAll('.card'));
const bmiValue = document.getElementById('bmiValue');
const painScale = document.getElementById('painScale');
const painScaleValue = document.getElementById('painScaleValue');
const heightCmInput = document.getElementById('heightCm');
const weightKgInput = document.getElementById('weightKg');
const testStatus = document.getElementById('testStatus');
const bleStatus = document.getElementById('bleStatus');
const historyBody = document.getElementById('historyBody');
const riskOutput = document.getElementById('riskOutput');
const riskMessage = document.getElementById('riskMessage');
const saveStatus = document.getElementById('saveStatus');

const hiddenVideo = document.getElementById('hiddenVideo');
const poseCanvas = document.getElementById('poseCanvas');
const poseCtx = poseCanvas.getContext('2d');

const BLE_CONFIG = {
  // Replace these with provided custom UUIDs.
  serviceUuid: '00000000-0000-0000-0000-000000000000',
  characteristicUuid: '00000000-0000-0000-0000-000000000000',
};

const state = {
  currentStep: 'landing',
  activeTest: null,
  tests: {
    squat: { pose: [], imu: [] },
    bend: { pose: [], imu: [] },
    walk: { pose: [], imu: [] },
  },
  charts: {
    knee: null,
    imuRadar: null,
  },
  ble: {
    characteristic: null,
    connected: false,
  },
  latestRisk: null,
};

function showStep(stepName) {
  for (const step of steps) {
    step.classList.toggle('active-step', step.dataset.step === stepName);
  }
  state.currentStep = stepName;
  if (stepName === 'results') {
    renderCharts();
  }
  if (stepName === 'history') {
    loadHistory();
  }
}

document.querySelectorAll('[data-next]').forEach((button) => {
  button.addEventListener('click', () => {
    const next = button.dataset.next;
    if (next === 'patient-age' && !document.getElementById('patientName').value.trim()) return;
    if (next === 'patient-gender' && !document.getElementById('patientAge').value.trim()) return;
    if (next === 'patient-contact' && !document.getElementById('patientGender').value) return;
    if (next === 'medical-height' && !document.getElementById('patientContact').value.trim()) return;
    if (next === 'medical-pain' && !heightCmInput.value.trim()) return;
    if (next === 'medical-pain' && !weightKgInput.value.trim()) return;
    showStep(next);
  });
});

document.querySelectorAll('[data-prev]').forEach((button) => {
  button.addEventListener('click', () => {
    showStep(button.dataset.prev);
  });
});

function computeBmi() {
  const heightM = Number(heightCmInput.value) / 100;
  const weightKg = Number(weightKgInput.value);
  if (!heightM || !weightKg) {
    bmiValue.textContent = '--';
    return null;
  }
  const bmi = weightKg / (heightM * heightM);
  bmiValue.textContent = bmi.toFixed(1);
  return bmi;
}

heightCmInput.addEventListener('input', computeBmi);
weightKgInput.addEventListener('input', computeBmi);

painScale.addEventListener('input', () => {
  painScaleValue.textContent = painScale.value;
});

function parseImuPacket(dataView) {
  if (dataView.byteLength < 12) {
    return null;
  }

  const ax = dataView.getInt16(0, true);
  const ay = dataView.getInt16(2, true);
  const az = dataView.getInt16(4, true);
  const gx = dataView.getInt16(6, true);
  const gy = dataView.getInt16(8, true);
  const gz = dataView.getInt16(10, true);

  return {
    ax,
    ay,
    az,
    gx,
    gy,
    gz,
    magnitude: Math.sqrt(ax ** 2 + ay ** 2 + az ** 2),
    timestamp: Date.now(),
  };
}

async function connectBle() {
  try {
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [BLE_CONFIG.serviceUuid],
    });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(BLE_CONFIG.serviceUuid);
    const characteristic = await service.getCharacteristic(BLE_CONFIG.characteristicUuid);

    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', (event) => {
      if (!state.activeTest) {
        return;
      }
      const packet = parseImuPacket(event.target.value);
      if (packet) {
        state.tests[state.activeTest].imu.push(packet);
      }
    });

    state.ble.characteristic = characteristic;
    state.ble.connected = true;
    bleStatus.textContent = 'IMU connected. Notifications active.';
  } catch (error) {
    bleStatus.textContent = `IMU connection failed: ${error.message}`;
  }
}

document.getElementById('connectBleBtn').addEventListener('click', async () => {
  if (!navigator.bluetooth) {
    bleStatus.textContent = 'Web Bluetooth is not supported in this browser.';
    return;
  }
  await connectBle();
});

const pose = new Pose({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
});

pose.setOptions({
  modelComplexity: 1,
  smoothLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
});

function getAngle(a, b, c) {
  if (!a || !b || !c) {
    return null;
  }
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const mag = Math.sqrt(ab.x ** 2 + ab.y ** 2) * Math.sqrt(cb.x ** 2 + cb.y ** 2);
  if (!mag) {
    return null;
  }
  const value = Math.max(-1, Math.min(1, dot / mag));
  return (Math.acos(value) * 180) / Math.PI;
}

pose.onResults((results) => {
  poseCtx.save();
  poseCtx.clearRect(0, 0, poseCanvas.width, poseCanvas.height);
  poseCtx.drawImage(results.image, 0, 0, poseCanvas.width, poseCanvas.height);

  if (results.poseLandmarks) {
    drawConnectors(poseCtx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#7fd6c8', lineWidth: 2 });
    drawLandmarks(poseCtx, results.poseLandmarks, { color: '#f9fffe', radius: 2 });

    if (state.activeTest) {
      const hip = results.poseLandmarks[24];
      const knee = results.poseLandmarks[26];
      const ankle = results.poseLandmarks[28];
      const kneeAngle = getAngle(hip, knee, ankle);
      if (kneeAngle !== null) {
        state.tests[state.activeTest].pose.push({
          kneeAngle,
          timestamp: Date.now(),
        });
      }
    }
  }

  poseCtx.restore();
});

const camera = new Camera(hiddenVideo, {
  onFrame: async () => {
    await pose.send({ image: hiddenVideo });
  },
  width: 640,
  height: 400,
});
camera.start();

function resetTestBuffers(testType) {
  state.tests[testType] = { pose: [], imu: [] };
}

document.getElementById('startTestBtn').addEventListener('click', () => {
  const testType = document.getElementById('testType').value;
  resetTestBuffers(testType);
  state.activeTest = testType;
  testStatus.textContent = `${testType.toUpperCase()} test running... This helps us understand movement better.`;

  window.setTimeout(() => {
    state.activeTest = null;
    const posePoints = state.tests[testType].pose.length;
    const imuPoints = state.tests[testType].imu.length;
    testStatus.textContent = `${testType.toUpperCase()} captured (${posePoints} pose frames, ${imuPoints} IMU samples).`;
  }, 12000);
});

function seriesFromAllTests(type) {
  return ['squat', 'bend', 'walk'].flatMap((t) => state.tests[t][type]);
}

function summarizeImu() {
  const imu = seriesFromAllTests('imu');
  if (imu.length === 0) {
    return { strideVariability: 0, cadence: 0, gyroStability: 0 };
  }

  const magnitudes = imu.map((point) => point.magnitude);
  const mean = magnitudes.reduce((sum, value) => sum + value, 0) / magnitudes.length;
  const std = Math.sqrt(
    magnitudes.reduce((sum, value) => sum + (value - mean) ** 2, 0) / magnitudes.length,
  );

  const peakIndices = [];
  for (let i = 1; i < magnitudes.length - 1; i += 1) {
    if (magnitudes[i] > magnitudes[i - 1] && magnitudes[i] > magnitudes[i + 1] && magnitudes[i] > mean + std * 0.3) {
      peakIndices.push(i);
    }
  }

  const intervals = [];
  for (let i = 1; i < peakIndices.length; i += 1) {
    intervals.push(imu[peakIndices[i]].timestamp - imu[peakIndices[i - 1]].timestamp);
  }

  const cadence = intervals.length > 0 ? (60000 / (intervals.reduce((s, v) => s + v, 0) / intervals.length)) : 0;
  const strideVariability = intervals.length > 0 ? Math.sqrt(intervals.reduce((s, v) => s + (v - (60000 / (cadence || 1))) ** 2, 0) / intervals.length) : 0;

  const gyro = imu.map((point) => Math.sqrt(point.gx ** 2 + point.gy ** 2 + point.gz ** 2));
  const gyroStability = gyro.reduce((sum, value) => sum + value, 0) / gyro.length;

  return {
    strideVariability: Number(strideVariability.toFixed(2)),
    cadence: Number(cadence.toFixed(2)),
    gyroStability: Number(gyroStability.toFixed(2)),
  };
}

function summarizePose() {
  const poseSeries = seriesFromAllTests('pose');
  if (poseSeries.length === 0) {
    return { kneeRotationAverage: 0, timeline: [] };
  }

  const kneeRotationAverage = poseSeries.reduce((sum, point) => sum + point.kneeAngle, 0) / poseSeries.length;
  return {
    kneeRotationAverage: Number(kneeRotationAverage.toFixed(2)),
    timeline: poseSeries.map((point, index) => ({
      frame: index + 1,
      kneeAngle: Number(point.kneeAngle.toFixed(2)),
    })),
  };
}

function renderCharts() {
  const poseSummary = summarizePose();
  const imuSummary = summarizeImu();

  const kneeCtx = document.getElementById('kneeChart').getContext('2d');
  if (state.charts.knee) {
    state.charts.knee.destroy();
  }
  state.charts.knee = new Chart(kneeCtx, {
    type: 'line',
    data: {
      labels: poseSummary.timeline.map((point) => point.frame),
      datasets: [
        {
          label: 'Knee rotation angle',
          data: poseSummary.timeline.map((point) => point.kneeAngle),
          borderColor: '#2f8f83',
          backgroundColor: 'rgba(47, 143, 131, 0.15)',
          fill: true,
          tension: 0.25,
        },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false },
  });

  const radarCtx = document.getElementById('imuRadarChart').getContext('2d');
  if (state.charts.imuRadar) {
    state.charts.imuRadar.destroy();
  }
  state.charts.imuRadar = new Chart(radarCtx, {
    type: 'radar',
    data: {
      labels: ['Stride variability', 'Cadence', 'Gyro stability'],
      datasets: [
        {
          label: 'IMU-derived metrics',
          data: [imuSummary.strideVariability, imuSummary.cadence, imuSummary.gyroStability],
          borderColor: '#6a77d8',
          backgroundColor: 'rgba(106, 119, 216, 0.2)',
        },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false },
  });
}

function collectPayload() {
  const bmi = computeBmi();
  const poseSummary = summarizePose();
  const imuSummary = summarizeImu();

  return {
    patient: {
      name: document.getElementById('patientName').value.trim(),
      age: Number(document.getElementById('patientAge').value),
      gender: document.getElementById('patientGender').value,
      contact: document.getElementById('patientContact').value.trim(),
    },
    medical: {
      heightCm: Number(heightCmInput.value),
      weightKg: Number(weightKgInput.value),
      painScale: Number(painScale.value),
      stiffness: document.querySelector('input[name="stiffness"]:checked')?.value || 'no',
    },
    movement: poseSummary,
    imu: imuSummary,
    derived: {
      bmi: bmi ? Number(bmi.toFixed(2)) : 0,
    },
  };
}

async function saveRecord() {
  saveStatus.textContent = 'Saving...';
  const payload = collectPayload();

  const response = await fetch('/api/screenings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    saveStatus.textContent = body.error || 'Unable to save screening.';
    return;
  }

  const body = await response.json();
  state.latestRisk = body;

  if (body.riskPercentage === null) {
    riskOutput.textContent = 'Risk: pending configured clinical weights';
  } else {
    riskOutput.textContent = `Risk: ${body.riskPercentage.toFixed(1)}%`;
  }

  riskMessage.textContent = body.riskMessage;
  saveStatus.textContent = `Record saved (ID: ${body.screeningId}).`;
}

document.getElementById('saveRecordBtn').addEventListener('click', () => {
  saveRecord().catch((error) => {
    saveStatus.textContent = `Save failed: ${error.message}`;
  });
});

async function loadHistory() {
  const query = document.getElementById('historySearch').value.trim();
  const response = await fetch(`/api/history${query ? `?search=${encodeURIComponent(query)}` : ''}`);
  if (!response.ok) {
    historyBody.innerHTML = '<tr><td colspan="9">Unable to load history.</td></tr>';
    return;
  }

  const body = await response.json();
  if (!body.rows.length) {
    historyBody.innerHTML = '<tr><td colspan="9">No records found yet.</td></tr>';
    return;
  }

  historyBody.innerHTML = body.rows
    .map(
      (row) => `
      <tr>
        <td>${new Date(row.recorded_at).toLocaleString()}</td>
        <td>${row.patient_name}</td>
        <td>${row.patient_age}</td>
        <td>${row.patient_gender}</td>
        <td>${row.patient_contact}</td>
        <td>${Number(row.bmi).toFixed(1)}</td>
        <td>${row.pain_scale}</td>
        <td>${row.stiffness}</td>
        <td>${row.risk_score === null ? 'Pending rules' : Number(row.risk_score).toFixed(1)}</td>
      </tr>
    `,
    )
    .join('');
}

document.getElementById('historySearchBtn').addEventListener('click', () => {
  loadHistory();
});
