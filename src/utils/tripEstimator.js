import { calculateTripMetrics } from './calculations';
import { formatTo2Decimals } from './formatting';

/**
 * Calculate trip cost estimate based on historical fill-up data
 * @param {Array} fillUps - Array of fill-up objects sorted by odometer
 * @param {number} tripDistance - Planned trip distance in km
 * @param {Object} options - Configuration options
 * @returns {Object} Trip estimation result
 */
export function calculateTripEstimate(fillUps, tripDistance, options = {}) {
  const {
    fuelType = null,
    manualConsumption = null,
    manualFuelPrice = null,
    sampleSize = 5,
    excludeOutliers = true
  } = options;

  // Validate input
  if (!tripDistance || tripDistance <= 0) {
    return {
      estimatedCost: 0,
      estimatedLiters: 0,
      consumptionUsed: 0,
      priceUsed: 0,
      sampleSize: 0,
      methodUsed: 'invalid_input',
      confidence: 'none',
      error: 'Invalid trip distance'
    };
  }

  // Filter valid fill-ups with complete data
  const validFillUps = fillUps.filter(fill => {
    const hasValidDistance = fill.odometer > 0;
    const hasValidLiters = fill.liters > 0;
    const hasValidPrice = fill.pricePerLiter > 0;
    const matchesFuelType = !fuelType || fill.fuelType === fuelType;
    
    return hasValidDistance && hasValidLiters && hasValidPrice && matchesFuelType;
  });

  // If no valid data, use manual inputs or return error
  if (validFillUps.length < 2) {
    if (manualConsumption && manualFuelPrice) {
      return calculateFromManualInputs(tripDistance, manualConsumption, manualFuelPrice);
    } else {
      return {
        estimatedCost: 0,
        estimatedLiters: 0,
        consumptionUsed: 0,
        priceUsed: 0,
        sampleSize: 0,
        methodUsed: 'insufficient_data',
        confidence: 'none',
        error: 'Insufficient fill-up history'
      };
    }
  }

  // Calculate trip metrics for all valid fill-ups
  const tripMetricsList = [];
  for (let i = 1; i < validFillUps.length; i++) {
    const metrics = calculateTripMetrics(validFillUps, i);
    if (metrics.distance > 0 && metrics.kmPerLiter > 0) {
      tripMetricsList.push({
        ...metrics,
        pricePerLiter: validFillUps[i].pricePerLiter,
        timestamp: validFillUps[i].timestamp
      });
    }
  }

  // Filter out outliers if enabled
  let filteredMetrics = tripMetricsList;
  if (excludeOutliers && tripMetricsList.length > 3) {
    filteredMetrics = removeOutliers(tripMetricsList, 'kmPerLiter');
  }

  // Take recent samples (if sampleSize is null, use all available data)
  const recentMetrics = filteredMetrics
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, sampleSize || filteredMetrics.length);

  // Calculate weighted average consumption (newer data gets more weight)
  const weightedConsumption = calculateWeightedAverage(recentMetrics, 'kmPerLiter');
  
  // Calculate fuel price (prefer recent, but use average if more stable)
  const fuelPrice = manualFuelPrice || calculateOptimalFuelPrice(recentMetrics);

  // If we have manual consumption override, use it
  const finalConsumption = manualConsumption || weightedConsumption;

  // Calculate estimates
  const estimatedLiters = tripDistance / finalConsumption;
  const estimatedCost = estimatedLiters * fuelPrice;

  // Determine confidence level
  const confidence = getConfidenceLevel(recentMetrics.length, validFillUps.length);

  return {
    estimatedCost: formatTo2Decimals(estimatedCost),
    estimatedLiters: formatTo2Decimals(estimatedLiters),
    consumptionUsed: formatTo2Decimals(finalConsumption),
    priceUsed: formatTo2Decimals(fuelPrice),
    sampleSize: recentMetrics.length,
    methodUsed: manualConsumption ? 'manual_consumption' : 'historical_average',
    confidence,
    rawData: recentMetrics.map(m => ({
      kmPerLiter: formatTo2Decimals(m.kmPerLiter),
      pricePerLiter: m.pricePerLiter,
      date: new Date(m.timestamp).toLocaleDateString()
    }))
  };
}

/**
 * Calculate estimate from manual inputs
 */
function calculateFromManualInputs(tripDistance, consumption, fuelPrice) {
  const estimatedLiters = tripDistance / consumption;
  const estimatedCost = estimatedLiters * fuelPrice;

  return {
    estimatedCost: formatTo2Decimals(estimatedCost),
    estimatedLiters: formatTo2Decimals(estimatedLiters),
    consumptionUsed: consumption,
    priceUsed: fuelPrice,
    sampleSize: 0,
    methodUsed: 'manual_inputs',
    confidence: 'low'
  };
}

/**
 * Remove outliers using IQR method
 */
function removeOutliers(data, field) {
  if (data.length <= 3) return data;

  const values = data.map(item => item[field]).sort((a, b) => a - b);
  const q1Index = Math.floor(values.length * 0.25);
  const q3Index = Math.floor(values.length * 0.75);
  const q1 = values[q1Index];
  const q3 = values[q3Index];
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  return data.filter(item => item[field] >= lowerBound && item[field] <= upperBound);
}

/**
 * Calculate weighted average favoring newer data
 */
function calculateWeightedAverage(data, field) {
  if (data.length === 0) return 0;
  if (data.length === 1) return data[0][field];

  // Weight: newest gets weight = length, oldest gets weight = 1
  let weightedSum = 0;
  let totalWeight = 0;

  data.forEach((item, index) => {
    const weight = data.length - index; // Newer items get higher weight
    weightedSum += item[field] * weight;
    totalWeight += weight;
  });

  return weightedSum / totalWeight;
}

/**
 * Calculate optimal fuel price (prefer latest but check for stability)
 */
function calculateOptimalFuelPrice(data) {
  if (data.length === 0) return 0;
  if (data.length === 1) return data[0].pricePerLiter;

  // Sort by timestamp (newest first)
  const sortedData = [...data].sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // Get latest price
  const latestPrice = sortedData[0].pricePerLiter;

  // Calculate average of recent prices
  const recentPrices = sortedData.slice(0, Math.min(3, sortedData.length));
  const avgRecentPrice = recentPrices.reduce((sum, item) => sum + item.pricePerLiter, 0) / recentPrices.length;

  // If latest price is within 10% of recent average, use latest
  // Otherwise use average for stability
  const priceVariation = Math.abs(latestPrice - avgRecentPrice) / avgRecentPrice;
  return priceVariation <= 0.1 ? latestPrice : avgRecentPrice;
}

/**
 * Determine confidence level based on sample size
 */
function getConfidenceLevel(sampleSize, totalFillUps) {
  if (sampleSize >= 5 && totalFillUps >= 10) return 'high';
  if (sampleSize >= 3 && totalFillUps >= 5) return 'medium';
  if (sampleSize >= 1) return 'low';
  return 'none';
}

/**
 * Convert between consumption units
 */
export function convertConsumptionUnits(value, fromUnit, toUnit) {
  if (fromUnit === toUnit) return value;

  if (fromUnit === 'kmPerLiter' && toUnit === 'litersPer100km') {
    return value > 0 ? (100 / value) : 0;
  }
  
  if (fromUnit === 'litersPer100km' && toUnit === 'kmPerLiter') {
    return value > 0 ? (100 / value) : 0;
  }

  return value;
}

/**
 * Convert distance units
 */
export function convertDistance(value, fromUnit, toUnit) {
  if (fromUnit === toUnit) return value;
  
  if (fromUnit === 'km' && toUnit === 'miles') {
    return value * 0.621371;
  }
  
  if (fromUnit === 'miles' && toUnit === 'km') {
    return value * 1.60934;
  }

  return value;
}
