/**
 * Helper functions for sync result classification
 */

/**
 * Determines if a sync result represents a no-op (nothing was uploaded)
 * @param {Object} result - The sync result object
 * @returns {boolean} - True if this is a no-op sync
 */
export const isNoOpSync = (result) => {
  // Must have a successful result
  if (!result?.success) {
    return false;
  }

  // Check explicit metadata first (most reliable)
  if (result.totalUploaded === 0) {
    return true;
  }

  // Check message for explicit no-op indicator
  if (result.message?.includes('Nothing to upload')) {
    return true;
  }

  // Check if all counts are zero (only if counts exist)
  const hasZeroCounts =
    !!result.counts &&
    result.counts.vehicles === 0 &&
    result.counts.fillups === 0 &&
    result.counts.maintenance === 0 &&
    result.counts.tripEstimates === 0;

  if (hasZeroCounts) {
    return true;
  }

  return false;
};

/**
 * Gets the user-friendly title for a sync result based on the action performed
 * @param {Object} result - The sync result object
 * @returns {string} - User-friendly title
 */
export const getResultTitle = (result) => {
  if (!result) {
    return 'Processing';
  }

  if (!result.success) {
    return 'Error';
  }

  // Match title to the actual action performed
  switch (result.action) {
    case 'keep-local':
      return 'Setup Complete';
    case 'download':
      return 'Download Complete';
    case 'upload':
      if (isNoOpSync(result)) {
        return 'Already Up to Date';
      }
      return 'Upload Successful';
    case 'merge':
      if (isNoOpSync(result)) {
        return 'Already Up to Date';
      }
      return 'Sync Complete';
    default:
      if (isNoOpSync(result)) {
        return 'Already Up to Date';
      }
      return 'Upload Successful';
  }
};

/**
 * Gets the user-friendly message for a sync result based on the action performed
 * @param {Object} result - The sync result object
 * @returns {string} - User-friendly message
 */
export const getResultMessage = (result) => {
  if (!result) {
    return '';
  }

  if (!result.success) {
    // For errors, show a generic user-friendly message
    // Technical details remain in console logs via result.message
    return 'Sync failed. Please try again or check your connection.';
  }

  // Match message to the actual action performed
  switch (result.action) {
    case 'keep-local':
      return 'Using local data only. Cloud sync was not performed.';
    case 'download':
      return 'Your cloud data has been downloaded to this device.';
    case 'upload':
      if (isNoOpSync(result)) {
        return 'Your cloud data already matches your current records.';
      }
      return 'Your data was uploaded successfully.';
    case 'merge':
      if (isNoOpSync(result)) {
        return 'Your cloud data already matches your current records.';
      }
      return 'Your local and cloud data have been synced.';
    default:
      if (isNoOpSync(result)) {
        return 'Your cloud data already matches your current records.';
      }
      return 'Your data was uploaded successfully.';
  }
};
