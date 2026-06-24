import { formatTo2Decimals, formatPercentage2Dec } from './formatting';

/**
 * Calculate tyre diameter from tyre dimensions
 * Formula: diameter = rim_diameter + (2 * width * aspect_ratio / 100) / 25.4
 * All inputs in metric, result in inches (since rim size is in inches)
 * @param {number} width - Tyre width in mm
 * @param {number} aspectRatio - Aspect ratio as percentage (e.g., 55 for 55%)
 * @param {number} rimSize - Rim diameter in inches
 * @returns {number} Tyre diameter in inches
 */
export function calculateTyreDiameter(width, aspectRatio, rimSize) {
  const sidewallHeightMm = (width * aspectRatio) / 100;
  const sidewallHeightInches = sidewallHeightMm / 25.4;
  const diameter = parseFloat(rimSize) + (2 * sidewallHeightInches);
  return formatTo2Decimals(diameter);
}

/**
 * Calculate tyre circumference from diameter
 * @param {number} diameter - Tyre diameter in inches
 * @returns {number} Tyre circumference in inches
 */
export function calculateTyreCircumference(diameter) {
  const circumference = Math.PI * diameter;
  return formatTo2Decimals(circumference);
}

/**
 * Calculate circumference in mm
 * @param {number} circumferenceInches - Circumference in inches
 * @returns {number} Circumference in mm
 */
export function circumferenceToMm(circumferenceInches) {
  return formatTo2Decimals(circumferenceInches * 25.4);
}

/**
 * Calculate the percentage difference between two circumferences
 * @param {number} originalCircumference - Original tyre circumference
 * @param {number} newCircumference - New tyre circumference
 * @returns {number} Percentage difference
 */
export function calculateCircumferenceDifference(originalCircumference, newCircumference) {
  const difference = ((newCircumference - originalCircumference) / originalCircumference) * 100;
  return formatTo2Decimals(difference);
}

/**
 * Calculate actual speed vs speedometer reading
 * @param {number} speedometerSpeed - Speed shown on speedometer (km/h)
 * @param {number} circumferenceDifference - Percentage difference in circumference
 * @returns {number} Actual speed (km/h)
 */
export function calculateActualSpeed(speedometerSpeed, circumferenceDifference) {
  const actualSpeed = speedometerSpeed * (1 + (circumferenceDifference / 100));
  return formatTo2Decimals(actualSpeed);
}

/**
 * Calculate RPM difference at a given speed
 * @param {number} speedKmh - Speed in km/h
 * @param {number} originalCircumferenceMm - Original tyre circumference in mm
 * @param {number} newCircumferenceMm - New tyre circumference in mm
 * @param {number} gearRatio - Gear ratio (default 1.0 for direct drive)
 * @param {number} finalDriveRatio - Final drive ratio (default 3.5)
 * @returns {object} RPM data
 */
export function calculateRPMDifference(speedKmh, originalCircumferenceMm, newCircumferenceMm, gearRatio = 1.0, finalDriveRatio = 3.5) {
  // Convert speed to mm/min
  const speedMmPerMin = (speedKmh * 1000000) / 60;
  
  // Original RPM
  const originalWheelRpm = speedMmPerMin / originalCircumferenceMm;
  const originalEngineRpm = originalWheelRpm * finalDriveRatio * gearRatio;
  
  // New RPM
  const newWheelRpm = speedMmPerMin / newCircumferenceMm;
  const newEngineRpm = newWheelRpm * finalDriveRatio * gearRatio;
  
  const rpmDifference = newEngineRpm - originalEngineRpm;
  const rpmPercentageChange = ((newEngineRpm - originalEngineRpm) / originalEngineRpm) * 100;
  
  return {
    originalRPM: formatTo2Decimals(originalEngineRpm),
    newRPM: formatTo2Decimals(newEngineRpm),
    rpmDifference: formatTo2Decimals(rpmDifference),
    rpmPercentageChange: formatPercentage2Dec(rpmPercentageChange)
  };
}

/**
 * Estimate fuel consumption impact from tyre size changes.
 * This is a practical estimate using gearing change from circumference and
 * rolling resistance proxy from tyre width, anchored to the vehicle's real
 * average consumption when available.
 */
export function calculateFuelConsumptionImpact(originalTyre, newTyre, circumferenceDifference, baselineKmPerLiter = 0) {
  const widthDifferencePercent =
    ((Number(newTyre.width) - Number(originalTyre.width)) / Number(originalTyre.width)) * 100;

  // Larger circumference lowers cruise RPM, while wider tyres usually add rolling resistance.
  const gearingEffectPercent = -circumferenceDifference * 0.3;
  const widthEffectPercent = widthDifferencePercent * 0.2;
  const consumptionChangePercent = Math.max(
    -15,
    Math.min(15, gearingEffectPercent + widthEffectPercent),
  );

  const expectedKmPerLiter =
    baselineKmPerLiter > 0
      ? baselineKmPerLiter / (1 + consumptionChangePercent / 100)
      : 0;

  return {
    baselineKmPerLiter: formatTo2Decimals(baselineKmPerLiter),
    consumptionChangePercent: formatTo2Decimals(consumptionChangePercent),
    consumptionChangeFormatted: formatPercentage2Dec(consumptionChangePercent),
    expectedKmPerLiter: formatTo2Decimals(expectedKmPerLiter),
    expectedKmPer20Liter: formatTo2Decimals(expectedKmPerLiter * 20),
    gearingEffectPercent: formatTo2Decimals(gearingEffectPercent),
    widthEffectPercent: formatTo2Decimals(widthEffectPercent)
  };
}

/**
 * Complete tyre size comparison calculation
 * @param {object} originalTyre - { width, aspectRatio, rimSize }
 * @param {object} newTyre - { width, aspectRatio, rimSize }
 * @param {object} options - { speedKmh, gearRatio, finalDriveRatio }
 * @returns {object} Complete comparison data
 */
export function compareTyreSizes(originalTyre, newTyre, options = {}) {
  const { speedKmh = 100, gearRatio = 1.0, finalDriveRatio = 3.5, baselineKmPerLiter = 0 } = options;
  
  // Calculate original tyre specs
  const originalDiameter = calculateTyreDiameter(originalTyre.width, originalTyre.aspectRatio, originalTyre.rimSize);
  const originalCircumference = calculateTyreCircumference(originalDiameter);
  const originalCircumferenceMm = circumferenceToMm(originalCircumference);
  
  // Calculate new tyre specs
  const newDiameter = calculateTyreDiameter(newTyre.width, newTyre.aspectRatio, newTyre.rimSize);
  const newCircumference = calculateTyreCircumference(newDiameter);
  const newCircumferenceMm = circumferenceToMm(newCircumference);
  
  // Calculate differences
  const diameterDifference = formatTo2Decimals(newDiameter - originalDiameter);
  const circumferenceDifference = calculateCircumferenceDifference(originalCircumference, newCircumference);
  
  // Calculate speed impact at given speed
  const actualSpeed = calculateActualSpeed(speedKmh, circumferenceDifference);
  const speedDifference = formatTo2Decimals(actualSpeed - speedKmh);
  const speedPercentageChange = formatPercentage2Dec(circumferenceDifference);
  
  // Calculate RPM impact
  const rpmData = calculateRPMDifference(speedKmh, originalCircumferenceMm, newCircumferenceMm, gearRatio, finalDriveRatio);
  const fuelImpact = calculateFuelConsumptionImpact(
    originalTyre,
    newTyre,
    circumferenceDifference,
    baselineKmPerLiter,
  );
  
  // Sidewall heights
  const originalSidewallMm = formatTo2Decimals((originalTyre.width * originalTyre.aspectRatio) / 100);
  const newSidewallMm = formatTo2Decimals((newTyre.width * newTyre.aspectRatio) / 100);
  
  return {
    original: {
      width: originalTyre.width,
      aspectRatio: originalTyre.aspectRatio,
      rimSize: originalTyre.rimSize,
      diameter: originalDiameter,
      circumference: originalCircumference,
      circumferenceMm: originalCircumferenceMm,
      sidewallMm: originalSidewallMm
    },
    new: {
      width: newTyre.width,
      aspectRatio: newTyre.aspectRatio,
      rimSize: newTyre.rimSize,
      diameter: newDiameter,
      circumference: newCircumference,
      circumferenceMm: newCircumferenceMm,
      sidewallMm: newSidewallMm
    },
    differences: {
      diameterDifference,
      circumferenceDifference: formatPercentage2Dec(circumferenceDifference),
      speedDifference,
      speedPercentageChange,
      rpmDifference: rpmData.rpmDifference,
      rpmPercentageChange: rpmData.rpmPercentageChange
    },
    speedImpact: {
      speedometerSpeed: speedKmh,
      actualSpeed,
      speedDifference,
      speedPercentageChange
    },
    rpmImpact: rpmData,
    fuelImpact,
    timestamp: new Date().toISOString()
  };
}

/**
 * Validate tyre dimensions
 * @param {object} tyre - { width, aspectRatio, rimSize }
 * @returns {object} Validation result
 */
export function validateTyreDimensions(tyre) {
  const errors = [];
  
  if (!tyre.width || tyre.width < 100 || tyre.width > 400) {
    errors.push('Width must be between 100-400mm');
  }
  
  if (!tyre.aspectRatio || tyre.aspectRatio < 20 || tyre.aspectRatio > 85) {
    errors.push('Aspect ratio must be between 20-85%');
  }
  
  if (!tyre.rimSize || tyre.rimSize < 10 || tyre.rimSize > 24) {
    errors.push('Rim size must be between 10-24 inches');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Common tyre sizes database
 */
export const commonTyreSizes = [
  { width: 195, aspectRatio: 65, rimSize: 15, label: '195/65 R15' },
  { width: 205, aspectRatio: 55, rimSize: 16, label: '205/55 R16' },
  { width: 215, aspectRatio: 60, rimSize: 16, label: '215/60 R16' },
  { width: 225, aspectRatio: 45, rimSize: 17, label: '225/45 R17' },
  { width: 235, aspectRatio: 55, rimSize: 17, label: '235/55 R17' },
  { width: 245, aspectRatio: 40, rimSize: 18, label: '245/40 R18' },
  { width: 255, aspectRatio: 35, rimSize: 19, label: '255/35 R19' },
  { width: 265, aspectRatio: 30, rimSize: 20, label: '265/30 R20' },
  { width: 185, aspectRatio: 65, rimSize: 14, label: '185/65 R14' },
  { width: 175, aspectRatio: 70, rimSize: 13, label: '175/70 R13' }
];

/**
 * Format tyre size string
 * @param {object} tyre - { width, aspectRatio, rimSize }
 * @returns {string} Formatted tyre size
 */
export function formatTyreSize(tyre) {
  return `${tyre.width}/${tyre.aspectRatio} R${tyre.rimSize}`;
}
