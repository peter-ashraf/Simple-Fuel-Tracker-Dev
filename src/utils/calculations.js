import { formatTo2Decimals } from './formatting';

const DAY_MS = 24 * 60 * 60 * 1000;

export function calculateTripMetrics(fillUps, index) {
  const current = fillUps[index];
  const previous = index > 0 ? fillUps[index - 1] : null;

  const distance = previous ? current.odometer - previous.odometer : 0;
  let fuelConsumed = current.liters;
  let isEstimated = false;

  if (current.tankCapacityLiters > 0) {
    const prevLevel = previous?.tankLevelAfter !== undefined ? previous.tankLevelAfter : 100;
    const currLevel = current.tankLevelAfter !== undefined ? current.tankLevelAfter : 100;
    
    if (prevLevel < 100 || currLevel < 100) {
       fuelConsumed = (prevLevel / 100 * current.tankCapacityLiters) + current.liters - (currLevel / 100 * current.tankCapacityLiters);
       isEstimated = true;
    }
  }

  // Ensure fuelConsumed doesn't go below 0 due to gauge inaccuracy
  if (fuelConsumed <= 0 && current.liters > 0 && distance > 0) {
    fuelConsumed = current.liters; // fallback
  }

  const kmPerLiter = distance > 0 && fuelConsumed > 0 ? distance / fuelConsumed : 0;
  const litersPer100km = distance > 0 && fuelConsumed > 0 ? (fuelConsumed / distance) * 100 : 0;
  const tripCost = current.liters * current.pricePerLiter;

  return {
    distance: formatTo2Decimals(distance),
    fuelConsumed: formatTo2Decimals(fuelConsumed),
    kmPerLiter: formatTo2Decimals(kmPerLiter),
    litersPer100km: formatTo2Decimals(litersPer100km),
    tripCost: formatTo2Decimals(tripCost),
    isEstimated
  };
}

/**
 * Calculate average daily driving distance from all valid fill-up intervals.
 * @param {Array} fillUps - Array of fill-up objects with date/timestamp and odometer
 * @returns {number} Average daily distance in km, or 0 if insufficient data
 */
export function calculateAverageDailyDistance(fillUps) {
  if (!fillUps || fillUps.length < 2) return 0;

  const sorted = fillUps
    .map((fillUp) => {
      const rawDate = fillUp.date || fillUp.timestamp || fillUp.createdAt;
      const date = rawDate ? new Date(rawDate) : null;
      const odometer = Number(fillUp.odometer);

      return {
        date,
        odometer,
      };
    })
    .filter(
      (fillUp) =>
        fillUp.date &&
        !Number.isNaN(fillUp.date.getTime()) &&
        Number.isFinite(fillUp.odometer),
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const intervals = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const distance = current.odometer - previous.odometer;
    const days = (current.date.getTime() - previous.date.getTime()) / DAY_MS;

    if (distance <= 0 || days <= 0) continue;

    intervals.push({
      distance,
      days,
      endDate: current.date,
    });
  }

  if (intervals.length === 0) return 0;

  const totalDistance = intervals.reduce(
    (total, interval) => total + interval.distance,
    0,
  );
  const totalDays = intervals.reduce(
    (total, interval) => total + interval.days,
    0,
  );

  if (totalDays <= 0) return 0;

  return formatTo2Decimals(totalDistance / totalDays);
}

/**
 * Predict when maintenance will be due based on driving patterns
 * @param {Object} reminder - Maintenance reminder with nextDueODO
 * @param {number} currentOdometer - Current odometer reading
 * @param {number} avgDailyDistance - Average daily driving distance
 * @returns {Object|null} Prediction with days remaining and projected date, or null if can't predict
 */
export function predictMaintenanceDueDate(reminder, currentOdometer, avgDailyDistance) {
  // Only predict for odometer-based reminders
  if (!reminder.nextDueODO || !avgDailyDistance || avgDailyDistance <= 0) {
    return null;
  }
  
  const kmRemaining = reminder.nextDueODO - currentOdometer;
  
  if (kmRemaining <= 0) {
    // Already due
    return {
      daysRemaining: 0,
      projectedDate: new Date(),
      isOverdue: true,
      kmRemaining: 0
    };
  }
  
  const daysRemaining = Math.ceil(kmRemaining / avgDailyDistance);
  const projectedDate = new Date();
  projectedDate.setDate(projectedDate.getDate() + daysRemaining);
  
  return {
    daysRemaining,
    projectedDate,
    isOverdue: false,
    kmRemaining: formatTo2Decimals(kmRemaining)
  };
}

/**
 * Format prediction for display
 * @param {Object} prediction - Prediction object from predictMaintenanceDueDate
 * @returns {string} Human-readable prediction text
 */
export function formatPrediction(prediction) {
  if (!prediction) return null;
  
  if (prediction.isOverdue) {
    return 'Due now';
  }
  
  const { daysRemaining, projectedDate } = prediction;
  const dateStr = projectedDate.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric' 
  });
  
  if (daysRemaining <= 1) {
    return `Due tomorrow (${dateStr})`;
  } else if (daysRemaining <= 7) {
    return `Due in ${daysRemaining} days (${dateStr})`;
  } else if (daysRemaining <= 30) {
    const weeks = Math.ceil(daysRemaining / 7);
    return `Due in ~${weeks} weeks (${dateStr})`;
  } else {
    const months = Math.ceil(daysRemaining / 30);
    return `Due in ~${months} months (${dateStr})`;
  }
}
