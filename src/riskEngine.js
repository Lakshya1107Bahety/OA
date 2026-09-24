const fs = require('fs');
const path = require('path');
const { compareKneeROM, compareGaitSpeed, getAgeMatchedParticipants } = require('./baselineCompare');

const rulesPath = path.join(__dirname, '..', 'config', 'risk-rules.json');

function loadRules() {
  if (!fs.existsSync(rulesPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(rulesPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}

function computeRiskScore(input) {
  const rules = loadRules();
  const hasWeights = Boolean(rules && Array.isArray(rules.weights) && rules.weights.length > 0);

  let weightedSum = 0;
  let maxPossible = 0;
  const appliedRules = [];

  if (hasWeights) {
    for (const weightRule of rules.weights) {
      if (!weightRule || typeof weightRule.key !== 'string') {
        continue;
      }

      const value = Number(input[weightRule.key] ?? 0);
      const weight = Number(weightRule.weight ?? 0);
      const cap = Number(weightRule.cap ?? 1);

      const boundedValue = Math.max(0, Math.min(value, cap));

      weightedSum += boundedValue * weight;
      maxPossible += cap * weight;

      appliedRules.push({
        key: weightRule.key,
        value: boundedValue,
        weight,
        contribution: boundedValue * weight,
      });
    }
  }

  const baseline = Array.isArray(input.baseline) ? input.baseline : [];
  const matchedParticipants = getAgeMatchedParticipants(input.userAge, baseline);
  const matchedCount = matchedParticipants.length;
  const age = Number(input.userAge ?? 0);
  const ageRange = Number.isFinite(age) ? `${age - 10}-${age + 10}` : null;

  const kneeRomDeviation = compareKneeROM(input.liveAvgAngle, input.userAge, baseline);
  let kneeRomPoints = 0;
  if (kneeRomDeviation !== null && kneeRomDeviation > 10) {
    kneeRomPoints += 20;
    if (kneeRomDeviation > 20) {
      kneeRomPoints += 10;
    }
  }

  const gaitCadenceDeviation = compareGaitSpeed(input.liveCadence, input.userAge, baseline);
  let gaitPoints = 0;
  if (gaitCadenceDeviation !== null && gaitCadenceDeviation > 15) {
    gaitPoints += 10;
  }

  const baselinePoints = kneeRomPoints + gaitPoints;
  const baseRisk = maxPossible > 0 ? (weightedSum / maxPossible) * 100 : null;
  const riskPercentage = baseRisk === null ? null : Math.max(0, Math.min(100, baseRisk + baselinePoints));

  appliedRules.push({
    key: 'baselineKneeROMDeviation',
    deviation: kneeRomDeviation,
    matchedParticipants: matchedCount,
    matchedAgeRange: ageRange,
    contribution: kneeRomPoints,
  });

  appliedRules.push({
    key: 'baselineCadenceDeviation',
    deviation: gaitCadenceDeviation,
    matchedParticipants: matchedCount,
    matchedAgeRange: ageRange,
    contribution: gaitPoints,
  });

  return {
    riskPercentage,
    message: hasWeights
      ? 'Rule-based estimate generated.'
      : 'Rule configuration pending. Add weights/logic in config/risk-rules.json.',
    appliedRules,
  };
}

module.exports = {
  computeRiskScore,
};
