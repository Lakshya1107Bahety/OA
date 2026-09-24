function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveAgeKey(baseline = []) {
  const sample = baseline.find((entry) => entry && typeof entry === 'object');
  if (!sample) {
    return null;
  }

  return Object.keys(sample).find((key) => /^age$/i.test(key) || /age/i.test(key)) || null;
}

function resolveMetricKey(baseline = [], patterns = []) {
  const sample = baseline.find((entry) => entry && typeof entry === 'object');
  if (!sample) {
    return null;
  }

  const keys = Object.keys(sample);
  for (const pattern of patterns) {
    const matched = keys.find((key) => pattern.test(key));
    if (matched) {
      return matched;
    }
  }

  return null;
}

function getAgeMatchedParticipants(userAge, baseline) {
  const targetAge = toNumber(userAge);
  if (targetAge === null || !Array.isArray(baseline)) {
    return [];
  }

  const ageKey = resolveAgeKey(baseline);
  if (!ageKey) {
    return [];
  }

  return baseline.filter((participant) => {
    const age = toNumber(participant?.[ageKey]);
    return age !== null && Math.abs(age - targetAge) <= 10;
  });
}

function averageMetric(participants, metricKey) {
  if (!metricKey || !participants.length) {
    return null;
  }

  const values = participants
    .map((participant) => toNumber(participant?.[metricKey]))
    .filter((value) => value !== null);

  if (!values.length) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function compareKneeROM(liveAvgAngle, userAge, baseline) {
  const live = toNumber(liveAvgAngle);
  if (live === null) {
    return null;
  }

  const participants = getAgeMatchedParticipants(userAge, baseline);
  const kneeKey = resolveMetricKey(participants, [
    /knee.*(flex|rom|angle)/i,
    /(flex|rom|angle).*knee/i,
  ]);
  const baselineAverage = averageMetric(participants, kneeKey);

  if (baselineAverage === null) {
    return null;
  }

  return Math.abs(live - baselineAverage);
}

function compareGaitSpeed(liveCadence, userAge, baseline) {
  const live = toNumber(liveCadence);
  if (live === null) {
    return null;
  }

  const participants = getAgeMatchedParticipants(userAge, baseline);
  const cadenceKey = resolveMetricKey(participants, [
    /cadence/i,
    /gait.*speed/i,
    /speed/i,
    /^IAD$/i,
  ]);
  const baselineAverage = averageMetric(participants, cadenceKey);

  if (baselineAverage === null) {
    return null;
  }

  return Math.abs(live - baselineAverage);
}

module.exports = {
  compareKneeROM,
  compareGaitSpeed,
  getAgeMatchedParticipants,
};
