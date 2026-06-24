/**
 * Utility functions for consistent number formatting across the app
 */

/**
 * Format number to exactly 2 decimal places
 * @param {number} value - The number to format
 * @returns {number} Number rounded to 2 decimal places
 */
export function formatTo2Decimals(value) {
  if (typeof value !== 'number' || isNaN(value)) return 0;
  return Math.round(value * 100) / 100;
}

/**
 * Format currency to 2 decimal places
 * @param {number} value - The currency value
 * @param {string} currency - Currency symbol (default: 'L.E')
 * @returns {string} Formatted currency string
 */
export function formatCurrency2Dec(value, currency = 'L.E') {
  const formatted = formatTo2Decimals(value);
  return `${currency} ${formatted.toFixed(2)}`;
}

/**
 * Format efficiency to 2 decimal places
 * @param {number} value - The efficiency value
 * @param {string} unit - Unit to display
 * @returns {string} Formatted efficiency string
 */
export function formatEfficiency2Dec(value, unit = 'km/L') {
  if (value === null || value === undefined || isNaN(value)) return '-';
  const formatted = formatTo2Decimals(value);
  return `${formatted.toFixed(2)} ${unit}`;
}

/**
 * Format volume to 2 decimal places
 * @param {number} value - The volume value
 * @param {string} unit - Unit to display
 * @returns {string} Formatted volume string
 */
export function formatVolume2Dec(value, unit = 'L') {
  if (value === null || value === undefined || isNaN(value)) return '-';
  const formatted = formatTo2Decimals(value);
  return `${formatted.toFixed(2)} ${unit}`;
}

/**
 * Format distance to 2 decimal places
 * @param {number} value - The distance value
 * @param {string} unit - Unit to display
 * @returns {string} Formatted distance string
 */
export function formatDistance2Dec(value, unit = 'km') {
  if (value === null || value === undefined || isNaN(value)) return '-';
  const formatted = formatTo2Decimals(value);
  return `${formatted.toFixed(2)} ${unit}`;
}

/**
 * Format percentage to 2 decimal places
 * @param {number} value - The percentage value (0-100)
 * @returns {string} Formatted percentage string
 */
export function formatPercentage2Dec(value) {
  if (value === null || value === undefined || isNaN(value)) return '-';
  const formatted = formatTo2Decimals(value);
  return `${formatted.toFixed(2)}%`;
}

/**
 * Format RPM to 2 decimal places
 * @param {number} value - The RPM value
 * @returns {string} Formatted RPM string
 */
export function formatRPM2Dec(value) {
  if (value === null || value === undefined || isNaN(value)) return '-';
  const formatted = formatTo2Decimals(value);
  return `${formatted.toFixed(2)} RPM`;
}

/**
 * Format speed to 2 decimal places
 * @param {number} value - The speed value
 * @param {string} unit - Unit to display
 * @returns {string} Formatted speed string
 */
export function formatSpeed2Dec(value, unit = 'km/h') {
  if (value === null || value === undefined || isNaN(value)) return '-';
  const formatted = formatTo2Decimals(value);
  return `${formatted.toFixed(2)} ${unit}`;
}
