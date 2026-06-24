import { calculateTripMetrics } from "./calculations";
import { formatTo2Decimals } from "./formatting";

export const MIN_EFFICIENCY_SAMPLE_SIZE = 5;

const quantile = (sortedValues, percentile) => {
  if (!sortedValues.length) return 0;
  const position = (sortedValues.length - 1) * percentile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;

  if (upper === lower) return sortedValues[lower];
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
};

export const getEfficiencySamples = (fillUps = []) => {
  return fillUps
    .map((_, index) => calculateTripMetrics(fillUps, index))
    .filter(
      (metrics) =>
        metrics.distance > 0 &&
        metrics.fuelConsumed > 0 &&
        metrics.kmPerLiter > 0,
    )
    .map((metrics) => metrics.kmPerLiter);
};

export const calculateEfficiencyThresholds = (fillUps = []) => {
  const samples = getEfficiencySamples(fillUps);
  const sorted = [...samples].sort((a, b) => a - b);

  if (sorted.length < MIN_EFFICIENCY_SAMPLE_SIZE) {
    return {
      ready: false,
      sampleCount: sorted.length,
      minSampleSize: MIN_EFFICIENCY_SAMPLE_SIZE,
      low: 0,
      baseline: 0,
      high: 0,
    };
  }

  const low = formatTo2Decimals(quantile(sorted, 0.25));
  const baseline = formatTo2Decimals(quantile(sorted, 0.5));
  const high = formatTo2Decimals(quantile(sorted, 0.75));

  return {
    ready: low < high,
    sampleCount: sorted.length,
    minSampleSize: MIN_EFFICIENCY_SAMPLE_SIZE,
    low,
    baseline,
    high,
  };
};

export const getEfficiencyStatus = (kmPerLiter, thresholds) => {
  if (!kmPerLiter || Number.isNaN(Number(kmPerLiter))) return "neutral";
  if (!thresholds?.ready) return "neutral";
  if (kmPerLiter < thresholds.low) return "low";
  if (kmPerLiter >= thresholds.high) return "efficient";
  return "normal";
};

export const getEfficiencyTextClass = (kmPerLiter, thresholds) => {
  const status = getEfficiencyStatus(kmPerLiter, thresholds);
  if (status === "efficient") return "text-emerald-600 dark:text-emerald-400";
  if (status === "normal") return "text-amber-600 dark:text-amber-400";
  if (status === "low") return "text-red-600 dark:text-red-400";
  return "text-slate-900 dark:text-white";
};

export const getEfficiencyBarClass = (kmPerLiter, thresholds) => {
  const status = getEfficiencyStatus(kmPerLiter, thresholds);
  if (status === "efficient") return "bg-emerald-500";
  if (status === "normal") return "bg-amber-500";
  if (status === "low") return "bg-red-500";
  return "bg-slate-500";
};
