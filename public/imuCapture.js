const OA_SENTINEL_BLE = {
  serviceUuid: '00000000-0000-0000-0000-000000000000',
  characteristicUuid: '00000000-0000-0000-0000-000000000000',
};

function parsePacket(value) {
  const payload = value instanceof DataView ? new TextDecoder().decode(value.buffer) : String(value || '');
  const trimmed = payload.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        return {
          timestamp: Number(parsed.timestamp ?? Date.now()),
          ax: Number(parsed.ax ?? 0),
          ay: Number(parsed.ay ?? 0),
          az: Number(parsed.az ?? 0),
          gx: Number(parsed.gx ?? 0),
          gy: Number(parsed.gy ?? 0),
          gz: Number(parsed.gz ?? 0),
        };
      }
    } catch (_error) {
      return null;
    }
  }

  const parts = trimmed.split(',').map((part) => part.trim());
  if (parts.length < 7) {
    return null;
  }

  return {
    timestamp: Number(parts[0]) || Date.now(),
    ax: Number(parts[1]) || 0,
    ay: Number(parts[2]) || 0,
    az: Number(parts[3]) || 0,
    gx: Number(parts[4]) || 0,
    gy: Number(parts[5]) || 0,
    gz: Number(parts[6]) || 0,
  };
}

async function connectIMU(uuids = OA_SENTINEL_BLE) {
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [uuids.serviceUuid],
  });
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(uuids.serviceUuid);
  return service.getCharacteristic(uuids.characteristicUuid);
}

async function startCapture(characteristic, durationMs) {
  const readings = [];
  const onChange = (event) => {
    const packet = parsePacket(event?.target?.value);
    if (packet) {
      readings.push(packet);
    }
  };

  await characteristic.startNotifications();
  characteristic.addEventListener('characteristicvaluechanged', onChange);

  await new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, Number(durationMs) || 0));
  });

  characteristic.removeEventListener('characteristicvaluechanged', onChange);
  await characteristic.stopNotifications();
  return readings;
}

function computeAverageKneeAngle(readings = []) {
  const values = readings
    .map((reading) => {
      const ay = Number(reading?.ay);
      const az = Number(reading?.az);
      if (!Number.isFinite(ay) || !Number.isFinite(az)) {
        return null;
      }
      return (Math.atan2(ay, az) * 180) / Math.PI;
    })
    .filter((value) => value !== null);

  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeCadence(readings = []) {
  if (readings.length < 3) {
    return 0;
  }

  const magnitudes = readings.map((reading) => {
    const ax = Number(reading?.ax) || 0;
    const ay = Number(reading?.ay) || 0;
    const az = Number(reading?.az) || 0;
    return Math.sqrt((ax ** 2) + (ay ** 2) + (az ** 2));
  });

  const mean = magnitudes.reduce((sum, value) => sum + value, 0) / magnitudes.length;
  const variance = magnitudes.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / magnitudes.length;
  const threshold = mean + Math.sqrt(variance) * 0.25;

  let steps = 0;
  for (let i = 1; i < magnitudes.length - 1; i += 1) {
    if (magnitudes[i] > magnitudes[i - 1] && magnitudes[i] > magnitudes[i + 1] && magnitudes[i] > threshold) {
      steps += 1;
    }
  }

  const start = Number(readings[0]?.timestamp) || Date.now();
  const end = Number(readings[readings.length - 1]?.timestamp) || start;
  const durationMinutes = Math.max((end - start) / 60000, 1 / 60000);
  return steps / durationMinutes;
}

const exported = {
  connectIMU,
  startCapture,
  computeAverageKneeAngle,
  computeCadence,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
}

if (typeof window !== 'undefined') {
  window.imuCapture = exported;
}
