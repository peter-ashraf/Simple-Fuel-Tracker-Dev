/**
 * Backup Service for Simple Fuel Tracker
 * Handles exporting localStorage data to JSON and importing/merging backups.
 */

import { v4 as uuidv4 } from 'uuid';

const APP_KEYS = [
  'fueltracker-vehicles-v2',
  'fueltracker-active-vehicle-v2',
  'fueltracker-prices-v2',
  'fueltracker-fillups-v2',
  'fueltracker-theme',
  'fueltracker-user-stations',
  'fueltracker-trip-estimates-v2',
  'fueltracker-tyre-comparisons-v2',
  'fueltracker-maintenance-entries-v3',
  'fueltracker-maintenance-logs-v2',
  'fueltracker-maintenance-categories-v1',
  'fueltracker-maintenance-systems-v1',
  'fueltracker-maintenance-settings-v2',
  'fueltracker-notifications-enabled',
  'fueltracker-trip-sample-size',
  'fueltracker-maintenance-reminders-v2',
  'fueltracker-remember-me',
  'i18nextLng'
];

const BACKUP_SCHEMA_VERSION = '2.0';

const dateOnly = (value) => {
  if (!value) return new Date().toISOString().substring(0, 10);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString().substring(0, 10)
    : parsed.toISOString().substring(0, 10);
};

const parseMaintenanceDescription = (description) => {
  if (!description || typeof description !== 'string') return {};
  try {
    const parsed = JSON.parse(description);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return { notes: description };
  }
};

const normalizeMaintenanceRecord = (record) => {
  const now = new Date().toISOString();
  const metadata = parseMaintenanceDescription(record.description);
  const odometer = Number(record.odometer ?? record.performedAtODO ?? 0) || 0;
  const intervalKm = Number(record.intervalKm ?? record.distance ?? metadata.distance ?? 0) || 0;
  const safety = Number(record.safetyMarginKm ?? record.safety ?? metadata.safety ?? 2000) || 0;
  const nextDue = Number(record.nextDueODO ?? record.nextDueOdometer ?? record.next_due_odometer ?? (intervalKm ? odometer + intervalKm : 0)) || 0;
  const stableKey = record.stableKey ?? record.stable_key ?? uuidv4();
  const date = dateOnly(record.date ?? record.timestamp ?? record.createdAt ?? record.created_at);
  const notes = record.notes ?? metadata.notes ?? '';

  return {
    ...record,
    id: record.id ?? `m_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    stableKey,
    stable_key: stableKey,
    date,
    timestamp: date,
    type: record.type || 'custom',
    odometer,
    performedAtODO: odometer,
    distance: intervalKm,
    intervalKm,
    safety,
    safetyMarginKm: safety,
    nextDueODO: nextDue,
    nextDueOdometer: nextDue,
    next_due_odometer: nextDue,
    notes,
    description: JSON.stringify({ distance: intervalKm, safety, notes }),
    cost: record.cost !== undefined && record.cost !== null && record.cost !== '' ? Number(record.cost) : null,
    createdAt: record.createdAt ?? record.created_at ?? now,
    updatedAt: record.updatedAt ?? record.updated_at ?? now,
    deletedAt: record.deletedAt ?? record.deleted_at ?? null,
    pendingDelete: false,
    pendingDeleteRequestedAt: null,
    lastAction: record.deletedAt || record.deleted_at ? 'DELETE' : 'UPDATE',
    tombstoneVerifiedAt: record.tombstoneVerifiedAt ?? null
  };
};

export const backupService = {
  /**
   * Export all app data as a JSON file
   */
  exportData() {
    const payload = {};
    APP_KEYS.forEach(key => {
      const value = localStorage.getItem(key);
      if (value !== null) {
        try {
          let data = JSON.parse(value);
          
          // Enrich fill-up data with trip distance
          if (key === 'fueltracker-fillups-v2' && Array.isArray(data)) {
             const vehiclesStr = localStorage.getItem('fueltracker-vehicles-v2');
             if (vehiclesStr) {
                const vehicles = JSON.parse(vehiclesStr);
                const enriched = [];
                vehicles.forEach(v => {
                   const vFills = data.filter(f => f.vehicleId === v.id).sort((a,b) => a.odometer - b.odometer);
                   vFills.forEach((f, i) => {
                      enriched.push({
                         ...f,
                         tripDistance: i > 0 ? f.odometer - vFills[i-1].odometer : 0
                      });
                   });
                });
                data = enriched;
             }
          }
          
          // Ensure vehicles have stable_key for identity preservation
          if (key === 'fueltracker-vehicles-v2' && Array.isArray(data)) {
            data = data.map(vehicle => {
              if (!vehicle.stableKey) {
                // Generate stable key for vehicles without one
                vehicle.stableKey = crypto.randomUUID ? crypto.randomUUID() : uuidv4();
              }
              return vehicle;
            });
          }
          
          payload[key] = data;
        } catch {
          payload[key] = value; // Fallback for non-JSON strings like theme
        }
      }
    });

    const exportObj = {
      metadata: {
        version: BACKUP_SCHEMA_VERSION,
        schemaVersion: BACKUP_SCHEMA_VERSION,
        exportDate: new Date().toISOString(),
        app: "Simple Fuel Tracker",
        includedKeys: Object.keys(payload),
        includes: {
          vehicles: Array.isArray(payload['fueltracker-vehicles-v2']) ? payload['fueltracker-vehicles-v2'].length : 0,
          fillups: Array.isArray(payload['fueltracker-fillups-v2']) ? payload['fueltracker-fillups-v2'].length : 0,
          maintenanceEntries: Array.isArray(payload['fueltracker-maintenance-entries-v3']) ? payload['fueltracker-maintenance-entries-v3'].length : 0,
          maintenanceSystems: Array.isArray(payload['fueltracker-maintenance-systems-v1']) ? payload['fueltracker-maintenance-systems-v1'].length : 0,
          maintenanceCategories: Array.isArray(payload['fueltracker-maintenance-categories-v1']) ? payload['fueltracker-maintenance-categories-v1'].length : 0,
          appSettings: APP_KEYS.filter((key) => payload[key] !== undefined && !Array.isArray(payload[key]) && typeof payload[key] !== 'object').length
        }
      },
      payload
    };

    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fuel-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Analyze imported data and identify conflicts
   * @param {File} file 
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeImport(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const importObj = JSON.parse(e.target.result);
          if (!importObj.payload || !importObj.metadata) {
            throw new Error("Invalid backup file format");
          }

          const analysis = {
            conflicts: [],
            newRecords: [],
            identical: 0,
            payload: importObj.payload
          };

          // Analyze Fill-ups (the most critical part)
          const backupFillups = importObj.payload['fueltracker-fillups-v2'] || [];
          const localFillups = JSON.parse(localStorage.getItem('fueltracker-fillups-v2') || '[]');

          backupFillups.forEach(backupFill => {
            const localFill = localFillups.find(lf => lf.id === backupFill.id);
            if (!localFill) {
              analysis.newRecords.push({ type: 'fillup', data: backupFill });
            } else if (JSON.stringify(localFill) !== JSON.stringify(backupFill)) {
              analysis.conflicts.push({
                type: 'fillup',
                id: backupFill.id,
                label: `Fill-up on ${new Date(backupFill.timestamp).toLocaleDateString()}`,
                local: localFill,
                backup: backupFill
              });
            } else {
              analysis.identical++;
            }
          });

          // Analyze Vehicles (match by stable_key for identity preservation)
          const backupVehicles = importObj.payload['fueltracker-vehicles-v2'] || [];
          const localVehicles = JSON.parse(localStorage.getItem('fueltracker-vehicles-v2') || '[]');

          backupVehicles.forEach(backupVeh => {
            // First try to match by stable_key
            const localVeh = localVehicles.find(lv => lv.stableKey && backupVeh.stableKey && lv.stableKey === backupVeh.stableKey);
            
            if (!localVeh) {
              // Fallback to ID match for legacy backups
              const legacyMatch = localVehicles.find(lv => lv.id === backupVeh.id);
              if (legacyMatch) {
                // Legacy match found - preserve stable_key from backup if it exists
                if (backupVeh.stableKey && !legacyMatch.stableKey) {
                  analysis.newRecords.push({ type: 'vehicle', data: { ...legacyMatch, stableKey: backupVeh.stableKey } });
                } else if (JSON.stringify(legacyMatch) !== JSON.stringify(backupVeh)) {
                  analysis.conflicts.push({
                    type: 'vehicle',
                    id: backupVeh.id,
                    label: `Vehicle: ${backupVeh.name}`,
                    local: legacyMatch,
                    backup: backupVeh
                  });
                } else {
                  analysis.identical++;
                }
              } else {
                // No match at all - new vehicle
                analysis.newRecords.push({ type: 'vehicle', data: backupVeh });
              }
            } else if (JSON.stringify(localVeh) !== JSON.stringify(backupVeh)) {
              analysis.conflicts.push({
                type: 'vehicle',
                id: backupVeh.id,
                label: `Vehicle: ${backupVeh.name}`,
                local: localVeh,
                backup: backupVeh
              });
            } else {
              analysis.identical++;
            }
          });

          // Analyze Maintenance Logs (Count as new records for simplicity)
          const backupMaint = importObj.payload['fueltracker-maintenance-entries-v3'] || [];
          const localMaint = JSON.parse(localStorage.getItem('fueltracker-maintenance-entries-v3') || '[]');
          backupMaint.forEach(bm => {
            if (!localMaint.find(lm => lm.id === bm.id)) {
              analysis.newRecords.push({ type: 'maintenance', data: bm });
            }
          });

          // Analyze Maintenance Reminders (Count as new records for simplicity)
          const backupReminders = importObj.payload['fueltracker-maintenance-reminders-v2'] || [];
          const localReminders = JSON.parse(localStorage.getItem('fueltracker-maintenance-reminders-v2') || '[]');
          backupReminders.forEach(br => {
            if (!localReminders.find(lr => lr.id === br.id)) {
              analysis.newRecords.push({ type: 'maintenance-reminder', data: br });
            }
          });

          // Analyze Trip Estimates (Count as new records for simplicity)
          const backupTrips = importObj.payload['fueltracker-trip-estimates-v2'] || [];
          const localTrips = JSON.parse(localStorage.getItem('fueltracker-trip-estimates-v2') || '[]');
          backupTrips.forEach(bt => {
            if (!localTrips.find(lt => lt.id === bt.id)) {
              analysis.newRecords.push({ type: 'trip-estimate', data: bt });
            }
          });

          // Analyze Tyre Comparisons (Count as new records for simplicity)
          const backupTyres = importObj.payload['fueltracker-tyre-comparisons-v2'] || [];
          const localTyres = JSON.parse(localStorage.getItem('fueltracker-tyre-comparisons-v2') || '[]');
          backupTyres.forEach(bt => {
            if (!localTyres.find(lt => lt.id === bt.id)) {
              analysis.newRecords.push({ type: 'tyre-comparison', data: bt });
            }
          });

          // Analyze Prices (Simple merge - count as new if local is empty)
          const backupPrices = importObj.payload['fueltracker-prices-v2'] || {};
          const localPrices = JSON.parse(localStorage.getItem('fueltracker-prices-v2') || '{}');
          Object.keys(backupPrices).forEach(key => {
            if (!localPrices[key]) {
              analysis.newRecords.push({ type: 'price', data: { key, value: backupPrices[key] } });
            }
          });



          resolve(analysis);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  },

  /**
   * Apply resolved data to localStorage
   * @param {Object} payload The full payload from backup
   * @param {Array} resolvedConflicts User-resolved conflicts
   * @param {Array} newRecords Records to add
   */
  applyImport(payload, resolvedConflicts, newRecords) {
    // 1. Get current data
    const localFillups = JSON.parse(localStorage.getItem('fueltracker-fillups-v2') || '[]');
    const localVehicles = JSON.parse(localStorage.getItem('fueltracker-vehicles-v2') || '[]');
    const localStations = JSON.parse(localStorage.getItem('fueltracker-user-stations') || '[]');
    const localPrices = JSON.parse(localStorage.getItem('fueltracker-prices-v2') || '{}');
    const localMaint = JSON.parse(localStorage.getItem('fueltracker-maintenance-entries-v3') || '[]');
    const localLegacyMaint = JSON.parse(localStorage.getItem('fueltracker-maintenance-logs-v2') || '[]');
    const localReminders = JSON.parse(localStorage.getItem('fueltracker-maintenance-reminders-v2') || '[]');
    const localTrips = JSON.parse(localStorage.getItem('fueltracker-trip-estimates-v2') || '[]');
    const localTyres = JSON.parse(localStorage.getItem('fueltracker-tyre-comparisons-v2') || '[]');
    const localCategories = JSON.parse(localStorage.getItem('fueltracker-maintenance-categories-v1') || '[]');
    const localSystems = JSON.parse(localStorage.getItem('fueltracker-maintenance-systems-v1') || '[]');
    const mergeByIdentity = (localRecords, backupRecords = []) => {
      const merged = [...localRecords];
      backupRecords.forEach((record) => {
        const key = record.stableKey || record.stable_key || record.id;
        const index = merged.findIndex((item) =>
          item.id === record.id ||
          (key && (item.stableKey === key || item.stable_key === key))
        );
        if (index >= 0) merged[index] = { ...merged[index], ...record };
        else merged.push(record);
      });
      return merged;
    };

    // 2. Process Conflicts
    resolvedConflicts.forEach(resolution => {
      if (resolution.action === 'backup') {
        if (resolution.type === 'fillup') {
          const idx = localFillups.findIndex(f => f.id === resolution.id);
          if (idx !== -1) localFillups[idx] = resolution.data;
        } else if (resolution.type === 'vehicle') {
          const idx = localVehicles.findIndex(v => v.id === resolution.id);
          if (idx !== -1) localVehicles[idx] = resolution.data;
        }
      } else if (resolution.action === 'remove_both') {
        if (resolution.type === 'fillup') {
          const idx = localFillups.findIndex(f => f.id === resolution.id);
          if (idx !== -1) localFillups.splice(idx, 1);
        } else if (resolution.type === 'vehicle') {
          const idx = localVehicles.findIndex(v => v.id === resolution.id);
          if (idx !== -1) localVehicles.splice(idx, 1);
        }
      }
      // If action is 'current', do nothing (keep existing)
    });

    // 3. Process New Records
    newRecords.forEach(record => {
      if (record.action === 'add') {
        if (record.type === 'fillup') {
          localFillups.push(record.data);
        } else if (record.type === 'vehicle') {
          localVehicles.push(record.data);
        } else if (record.type === 'maintenance') {
          localMaint.push(normalizeMaintenanceRecord(record.data));
        } else if (record.type === 'maintenance-reminder') {
          localReminders.push(record.data);
        } else if (record.type === 'trip-estimate') {
          localTrips.push(record.data);
        } else if (record.type === 'tyre-comparison') {
          localTyres.push(record.data);
        } else if (record.type === 'price') {
          localPrices[record.data.key] = record.data.value;
        }
      }
    });

    // 4. Merge non-conflicting simple data (Prices, Stations)
    // For simplicity, we merge prices by taking the one in the backup if current is empty, or vice versa
    const backupPrices = payload['fueltracker-prices-v2'] || {};
    Object.keys(backupPrices).forEach(key => {
      if (!localPrices[key]) localPrices[key] = backupPrices[key];
    });

    const backupStations = payload['fueltracker-user-stations'] || [];
    backupStations.forEach(bs => {
      if (!localStations.find(ls => ls.id === bs.id)) {
        localStations.push(bs);
      }
    });

    // 5. Merge Maintenance Logs and Reminders
    // Note: Maintenance entries already handled in newRecords section to avoid duplication
    const backupReminders = payload['fueltracker-maintenance-reminders-v2'] || [];
    backupReminders.forEach(br => {
      if (!localReminders.find(lr => lr.id === br.id)) {
        localReminders.push(br);
      }
    });

    // 6. Merge Trip Estimates
    const backupTrips = payload['fueltracker-trip-estimates-v2'] || [];
    backupTrips.forEach(bt => {
      if (!localTrips.find(lt => lt.id === bt.id)) {
        localTrips.push(bt);
      }
    });

    // 7. Merge Tyre Comparisons
    const backupTyres = payload['fueltracker-tyre-comparisons-v2'] || [];
    backupTyres.forEach(bt => {
      if (!localTyres.find(lt => lt.id === bt.id)) {
        localTyres.push(bt);
      }
    });
    const mergedCategories = mergeByIdentity(localCategories, payload['fueltracker-maintenance-categories-v1'] || []);
    const mergedSystems = mergeByIdentity(localSystems, payload['fueltracker-maintenance-systems-v1'] || []);
    const mergedLegacyMaint = mergeByIdentity(localLegacyMaint, payload['fueltracker-maintenance-logs-v2'] || []);

    // 8. Save back to localStorage
    localStorage.setItem('fueltracker-fillups-v2', JSON.stringify(localFillups));
    localStorage.setItem('fueltracker-vehicles-v2', JSON.stringify(localVehicles));
    localStorage.setItem('fueltracker-user-stations', JSON.stringify(localStations));
    localStorage.setItem('fueltracker-prices-v2', JSON.stringify(localPrices));
    localStorage.setItem('fueltracker-maintenance-entries-v3', JSON.stringify(localMaint));
    localStorage.setItem('fueltracker-maintenance-logs-v2', JSON.stringify(mergedLegacyMaint));
    localStorage.setItem('fueltracker-maintenance-reminders-v2', JSON.stringify(localReminders));
    localStorage.setItem('fueltracker-trip-estimates-v2', JSON.stringify(localTrips));
    localStorage.setItem('fueltracker-tyre-comparisons-v2', JSON.stringify(localTyres));
    localStorage.setItem('fueltracker-maintenance-categories-v1', JSON.stringify(mergedCategories));
    localStorage.setItem('fueltracker-maintenance-systems-v1', JSON.stringify(mergedSystems));
    [
      'fueltracker-maintenance-settings-v2',
      'fueltracker-theme',
      'fueltracker-notifications-enabled',
      'fueltracker-trip-sample-size',
      'fueltracker-active-vehicle-v2',
      'fueltracker-remember-me',
      'i18nextLng'
    ].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        localStorage.setItem(key, JSON.stringify(payload[key]));
      }
    });

    // 7. Clear migration flags to force re-evaluation on next app load
    console.log('[Import][localStorage] Clearing migration flags before reload');
    localStorage.removeItem('fueltracker-migration-decision');
    localStorage.removeItem('fueltracker-migration-complete');
    localStorage.removeItem('fueltracker-cloud-synced-timestamp');
    console.log('[Import][localStorage] Migration flags cleared, reloading app');

    // Reload the app
    window.location.reload();
  }
};

