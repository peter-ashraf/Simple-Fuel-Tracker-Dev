// Keys mapped to sheets
const SHEET_MAPPING = {
  'fueltracker-vehicles-v2': 'Vehicles',
  'fueltracker-prices-v2': 'Prices',
  'fueltracker-active-vehicle-v2': 'Active Vehicle',
  'fueltracker-fillups-v2': 'Fill-ups',
  'fueltracker-maintenance-entries-v3': 'Maintenance Logs',
  'fueltracker-maintenance-logs-v2': 'Legacy Maintenance',
  'fueltracker-user-stations': 'Stations',
  'fueltracker-maintenance-reminders-v2': 'Reminders',
  'fueltracker-maintenance-categories-v1': 'Categories',
  'fueltracker-maintenance-systems-v1': 'Maintenance Systems',
  'fueltracker-maintenance-settings-v2': 'Maintenance Settings',
  'fueltracker-trip-estimates-v2': 'Trip Estimates',
  'fueltracker-theme': 'Theme',
  'fueltracker-notifications-enabled': 'Notifications',
  'fueltracker-trip-sample-size': 'Trip Settings',
  'fueltracker-tyre-comparisons-v2': 'Tyre Comparisons',
  'fueltracker-remember-me': 'Remember Me',
  'i18nextLng': 'Language'
};

const mergeUniqueRecords = (...groups) => {
  const merged = [];
  const seen = new Set();
  groups.flat().forEach((record) => {
    if (!record) return;
    const key = record.stableKey || record.stable_key || record.id || JSON.stringify(record);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(record);
  });
  return merged;
};

export const excelService = {
  async exportData() {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();

    // Loop through the relevant keys and create a sheet for each
    Object.entries(SHEET_MAPPING).forEach(([storageKey, sheetName]) => {
      const dataStr = localStorage.getItem(storageKey);
      if (!dataStr) return;

      try {
        const data = JSON.parse(dataStr);
        let sheetData = [];

        if (Array.isArray(data)) {
          // It's an array of objects
          if (data.length > 0) {
             sheetData = data;
          }
        } else if (typeof data === 'object' && data !== null) {
          // It's an object (like prices: { 92: 22, 95: 25 })
          sheetData = Object.entries(data).map(([key, value]) => ({
            Item: key,
            Value: value && typeof value === 'object' ? JSON.stringify(value) : value
          }));
        } else if (data !== null) {
          // It's a single value (like active vehicle ID)
          sheetData = [{ Item: "Value", Value: data }];
        }

        if (sheetData.length > 0) {
          // Flatten complex objects for Excel
          const flattenedData = sheetData.map(item => {
             const flat = { ...item };
             // Special flattening for nested objects like tyreSize
             if (flat.tyreSize) {
                flat.tyreWidth = flat.tyreSize.width;
                flat.tyreAspect = flat.tyreSize.aspectRatio;
                flat.tyreRim = flat.tyreSize.rimSize;
                delete flat.tyreSize;
             }
             return flat;
          });

          const worksheet = XLSX.utils.json_to_sheet(flattenedData);
          XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        }
      } catch (e) {
        console.error(`Error parsing data for ${storageKey}`, e);
      }
    });

    // Handle car-specific fill-up sheets
    const fillupsStr = localStorage.getItem('fueltracker-fillups-v2');
    const vehiclesStr = localStorage.getItem('fueltracker-vehicles-v2');
    if (fillupsStr && vehiclesStr) {
      try {
        const fillups = JSON.parse(fillupsStr);
        const vehicles = JSON.parse(vehiclesStr);
        vehicles.forEach(v => {
           const vFills = fillups.filter(f => f.vehicleId === v.id).sort((a,b) => a.odometer - b.odometer);
           if (vFills.length > 0) {
              const enriched = vFills.map((f, i) => ({
                 ...f,
                 tripDistance: i > 0 ? f.odometer - vFills[i-1].odometer : 0
              }));
              const worksheet = XLSX.utils.json_to_sheet(enriched);
              const sheetName = `Fills - ${v.name}`.substring(0, 31);
              XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
           }
        });
      } catch (e) {
        console.error("Error creating per-car fill-up sheets", e);
      }
    }

    // Handle car-specific maintenance sheets
    const maintenanceStr = localStorage.getItem('fueltracker-maintenance-entries-v3');
    if (maintenanceStr && vehiclesStr) {
      try {
        const logs = JSON.parse(maintenanceStr);
        const vehicles = JSON.parse(vehiclesStr);
        vehicles.forEach(v => {
           const vLogs = logs.filter(l => l.vehicleId === v.id).sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
           if (vLogs.length > 0) {
              const worksheet = XLSX.utils.json_to_sheet(vLogs);
              const sheetName = `Maint - ${v.name}`.substring(0, 31);
              XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
           }
        });
      } catch (e) {
        console.error("Error creating per-car maintenance sheets", e);
      }
    }

    // Add a metadata sheet
    const metaSheet = XLSX.utils.json_to_sheet([
      { Key: "App", Value: "Simple Fuel Tracker" },
      { Key: "Version", Value: "2.0" },
      { Key: "SchemaVersion", Value: "2.0" },
      { Key: "ExportDate", Value: new Date().toISOString() },
      { Key: "Includes", Value: "vehicles, fill-ups, maintenance entries, maintenance systems, maintenance categories, maintenance settings, app preferences, trips, tire comparisons, stations" }
    ]);
    XLSX.utils.book_append_sheet(workbook, metaSheet, "Metadata");
 
    // Add a Statistics sheet for quick analysis/charting
    const vehiclesDataStr = localStorage.getItem('fueltracker-vehicles-v2');
    const fillupsDataStr = localStorage.getItem('fueltracker-fillups-v2');
    
    if (vehiclesDataStr && fillupsDataStr) {
       try {
          const vehicles = JSON.parse(vehiclesDataStr);
          const fillups = JSON.parse(fillupsDataStr);
          
          const stats = vehicles.map(v => {
             const vFillups = fillups.filter(f => f.vehicleId === v.id).sort((a,b) => a.odometer - b.odometer);
             if (vFillups.length === 0) return { Vehicle: v.name, Status: "No Data" };
             
             const totalLiters = vFillups.reduce((sum, f) => sum + f.liters, 0);
             const totalSpent = vFillups.reduce((sum, f) => sum + (f.liters * (f.pricePerLiter || 0)), 0);
             const firstOdo = vFillups[0].odometer;
             const lastOdo = vFillups[vFillups.length - 1].odometer;
             const distance = lastOdo - firstOdo;
             
             // Total fuel consumed is actually the sum of liters of all except the first fillup 
             // IF we assume "distance" is covered by the liters added.
             // For simplicity in statistics, we'll use total liters added.
             const avgEff = distance > 0 ? distance / totalLiters : 0;
             
             return {
                Vehicle: v.name,
                "Total Distance (km)": distance,
                "Total Fuel Added (L)": Number(totalLiters.toFixed(2)),
                "Total Spent (EGP)": Number(totalSpent.toFixed(2)),
                "Avg Efficiency (km/L)": Number(avgEff.toFixed(2)),
                "Fill-up Entries": vFillups.length
             };
          });
          
          const statsWorksheet = XLSX.utils.json_to_sheet(stats);
          XLSX.utils.book_append_sheet(workbook, statsWorksheet, "Statistics");
       } catch (e) {
          console.error("Error generating stats sheet", e);
       }
    }

    // Write file
    XLSX.writeFile(workbook, `fuel-tracker-backup-${new Date().toISOString().split('T')[0]}.xlsx`);
  },

  async analyzeImport(file) {
     const XLSX = await import('xlsx');
     return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
           try {
              const data = new Uint8Array(e.target.result);
              const workbook = XLSX.read(data, { type: 'array' });
              
              const payload = {};
              const fillupsFromSheets = [];
              
              // Unmap sheets to payload
              workbook.SheetNames.forEach(sheetName => {
                 const worksheet = workbook.Sheets[sheetName];
                 if (!worksheet) return;
                 const rawData = XLSX.utils.sheet_to_json(worksheet);
                 
                 // Handle car-specific fill-up sheets
                 if (sheetName.startsWith('Fills - ')) {
                    fillupsFromSheets.push(...rawData);
                    return;
                 }

                 // Handle car-specific maintenance sheets
                 if (sheetName.startsWith('Maint - ')) {
                    if (!payload['fueltracker-maintenance-entries-v3']) {
                       payload['fueltracker-maintenance-entries-v3'] = [];
                    }
                    payload['fueltracker-maintenance-entries-v3'].push(...rawData);
                    return;
                 }
                 
                 // Handle standard sheets
                 const storageKey = Object.keys(SHEET_MAPPING).find(key => SHEET_MAPPING[key] === sheetName);
                 if (storageKey) {
                    if (storageKey === 'fueltracker-prices-v2' || storageKey === 'fueltracker-maintenance-settings-v2') {
                       const objectValue = {};
                       rawData.forEach(row => {
                          const rawValue = row.Value;
                          if (typeof rawValue === 'string' && /^[[{]/.test(rawValue.trim())) {
                             try {
                                objectValue[row.Item] = JSON.parse(rawValue);
                                return;
                             } catch {
                                // Keep the original value below.
                             }
                          }
                          objectValue[row.Item] = rawValue;
                       });
                       payload[storageKey] = objectValue;
                    } else if (
                       storageKey === 'fueltracker-active-vehicle-v2' ||
                       storageKey === 'fueltracker-theme' ||
                       storageKey === 'fueltracker-notifications-enabled' ||
                       storageKey === 'fueltracker-trip-sample-size' ||
                       storageKey === 'fueltracker-remember-me' ||
                       storageKey === 'i18nextLng'
                    ) {
                       payload[storageKey] = rawData[0]?.Value || 'default';
                    } else {
                       // Reconstruct array and unflatten tyre size if needed
                       const unflattened = rawData.map(row => {
                          const item = { ...row };
                          if (item.tyreWidth && item.tyreAspect && item.tyreRim) {
                             item.tyreSize = {
                                width: item.tyreWidth,
                                aspectRatio: item.tyreAspect,
                                rimSize: item.tyreRim
                             };
                             delete item.tyreWidth;
                             delete item.tyreAspect;
                             delete item.tyreRim;
                          }
                          return item;
                       });
                       payload[storageKey] = unflattened;
                    }
                 }
              });

              if (fillupsFromSheets.length > 0) {
                 payload['fueltracker-fillups-v2'] = mergeUniqueRecords(
                    payload['fueltracker-fillups-v2'] || [],
                    fillupsFromSheets
                 );
              }

              if (payload['fueltracker-maintenance-entries-v3']) {
                 payload['fueltracker-maintenance-entries-v3'] = mergeUniqueRecords(payload['fueltracker-maintenance-entries-v3']);
              }

              if (Object.keys(payload).length === 0) {
                 throw new Error("No valid data found in Excel file");
              }

              // Reuse the JSON analysis structure
              const analysis = {
                 conflicts: [],
                 newRecords: [],
                 identical: 0,
                 payload: payload
              };

              // Analyze Fill-ups
              const backupFillups = payload['fueltracker-fillups-v2'] || [];
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

              // Analyze Vehicles
              const backupVehicles = payload['fueltracker-vehicles-v2'] || [];
              const localVehicles = JSON.parse(localStorage.getItem('fueltracker-vehicles-v2') || '[]');

              backupVehicles.forEach(backupVeh => {
                 const localVeh = localVehicles.find(lv => lv.id === backupVeh.id);
                 if (!localVeh) {
                    analysis.newRecords.push({ type: 'vehicle', data: backupVeh });
                 } else if (JSON.stringify(localVeh) !== JSON.stringify(backupVeh)) {
                    analysis.conflicts.push({
                       type: 'vehicle',
                       id: backupVeh.id,
                       label: `Vehicle: ${backupVeh.name}`,
                       local: localVeh,
                       backup: backupVeh
                    });
                 }
              });

              resolve(analysis);
           } catch (err) {
              reject(err);
           }
        };
        reader.onerror = () => reject(new Error("Failed to read Excel file"));
        reader.readAsArrayBuffer(file);
     });
  }
};
