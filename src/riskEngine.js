const fs = require('fs');
const path = require('path');

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

  if (!rules || !Array.isArray(rules.weights) || rules.weights.length === 0) {
    return {
      riskPercentage: null,
      message: 'Rule configuration pending. Add weights/logic in config/risk-rules.json.',
      appliedRules: [],
    };
  }

  let weightedSum = 0;
  let maxPossible = 0;
  const appliedRules = [];

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

  const riskPercentage = maxPossible > 0 ? Math.max(0, Math.min(100, (weightedSum / maxPossible) * 100)) : null;

  return {
    riskPercentage,
    message: riskPercentage === null ? 'Unable to compute risk percentage.' : 'Rule-based estimate generated.',
    appliedRules,
  };
}

module.exports = {
  computeRiskScore,
};
