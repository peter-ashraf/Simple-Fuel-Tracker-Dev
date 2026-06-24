import { useMemo, useEffect } from 'react';
import { useLocalStorage } from '../useLocalStorage';
import { MAINTENANCE_CATEGORIES } from '../../data/maintenanceCategories';
import { syncLocalChangesInBackground } from './syncAfterMutation';
import { makeMaintenanceTypeKey } from '../../utils/maintenanceTypeKey';

const dateOnly = (value) => {
  if (!value) return new Date().toISOString().substring(0, 10);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString().substring(0, 10)
    : parsed.toISOString().substring(0, 10);
};

const createStableKey = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `m_${Date.now()}_${Math.random().toString(36).slice(2)}`;
};

const DEFAULT_MAINTENANCE_SYSTEMS = [
  { id: 'engine', name: 'Engine', icon: 'Engine', categories: ['oil_change', 'air_filter', 'spark_plugs', 'transmission_service'], color: '#ef4444' },
  { id: 'tires', name: 'Tires', icon: 'Disc', categories: ['tire_rotation', 'tire_replacement'], color: '#3b82f6' },
  { id: 'fluids', name: 'Fluids', icon: 'Drop', categories: ['coolant_flush', 'ac_filter', 'fuel_filter', 'brake_service', 'brake_pads'], color: '#06b6d4' },
  { id: 'safety', name: 'Safety', icon: 'Shield', categories: ['general_inspection'], color: '#f59e0b' },
  { id: 'electrical', name: 'Electrical', icon: 'BatteryCharging', categories: ['battery'], color: '#8b5cf6' },
  { id: 'body', name: 'Body', icon: 'Car', categories: ['custom'], color: '#64748b' }
];

const BUILT_IN_CATEGORY_IDS = new Set(Object.values(MAINTENANCE_CATEGORIES).map((category) => category.id));
const BUILT_IN_SYSTEM_IDS = new Set(DEFAULT_MAINTENANCE_SYSTEMS.map((system) => system.id));
const MAINTENANCE_TAXONOMY_DIRTY_KEY = 'fueltracker-maintenance-taxonomy-dirty';

const markMaintenanceTaxonomyDirty = () => {
  try {
    localStorage.setItem(MAINTENANCE_TAXONOMY_DIRTY_KEY, new Date().toISOString());
  } catch {
    // Ignore storage failures; the actual taxonomy data is still persisted by useLocalStorage.
  }
};

const ensureUniqueKey = (baseKey, usedKeys, fallback) => {
  const fallbackKey = fallback || 'maintenance_item';
  const normalizedBase = makeMaintenanceTypeKey(baseKey) || fallbackKey;
  let key = normalizedBase;
  let suffix = 2;

  while (usedKeys.has(key)) {
    key = `${normalizedBase}_${suffix}`;
    suffix += 1;
  }

  usedKeys.add(key);
  return key;
};

const normalizeCategoryDefinition = (category, usedTypeKeys = new Set()) => {
  const now = new Date().toISOString();
  const typeKey = ensureUniqueKey(
    category.typeKey || category.type_key || category.id || category.name,
    usedTypeKeys,
    'maintenance_item'
  );
  const id = category.id || typeKey;
  const stableKey = category.stableKey || category.stable_key || (BUILT_IN_CATEGORY_IDS.has(id) ? id : createStableKey());
  const createdAt = category.createdAt || category.created_at || now;
  const updatedAt = category.updatedAt || category.updated_at || createdAt;

  return {
    ...category,
    id,
    stableKey,
    stable_key: stableKey,
    typeKey,
    type_key: typeKey,
    isDefault: category.isDefault ?? category.is_default ?? BUILT_IN_CATEGORY_IDS.has(id),
    is_default: category.is_default ?? category.isDefault ?? BUILT_IN_CATEGORY_IDS.has(id),
    createdAt,
    created_at: category.created_at || createdAt,
    updatedAt,
    updated_at: category.updated_at || updatedAt,
    deletedAt: category.deletedAt ?? category.deleted_at ?? null,
    deleted_at: category.deleted_at ?? category.deletedAt ?? null,
    version: category.version ?? 1,
    color: category.color || '#64748b'
  };
};

const normalizeSystemDefinition = (system, index, usedTypeKeys = new Set()) => {
  const now = new Date().toISOString();
  const id = system.id || system.typeKey || system.type_key || `system_${Date.now()}_${index}`;
  const sourceKey = system.typeKey || system.type_key || (BUILT_IN_SYSTEM_IDS.has(id) ? id : system.name || id);
  const typeKey = ensureUniqueKey(sourceKey, usedTypeKeys, 'maintenance_system');
  const stableKey = system.stableKey || system.stable_key || (BUILT_IN_SYSTEM_IDS.has(id) ? id : id || createStableKey());
  const createdAt = system.createdAt || system.created_at || now;
  const updatedAt = system.updatedAt || system.updated_at || createdAt;

  return {
    ...system,
    id,
    stableKey,
    stable_key: stableKey,
    typeKey,
    type_key: typeKey,
    categories: Array.from(new Set(system.categories || [])),
    isDefault: system.isDefault ?? system.is_default ?? BUILT_IN_SYSTEM_IDS.has(id),
    is_default: system.is_default ?? system.isDefault ?? BUILT_IN_SYSTEM_IDS.has(id),
    sortOrder: system.sortOrder ?? system.sort_order ?? index,
    sort_order: system.sort_order ?? system.sortOrder ?? index,
    createdAt,
    created_at: system.created_at || createdAt,
    updatedAt,
    updated_at: system.updated_at || updatedAt,
    deletedAt: system.deletedAt ?? system.deleted_at ?? null,
    deleted_at: system.deleted_at ?? system.deletedAt ?? null,
    version: system.version ?? 1,
    color: system.color || '#64748b'
  };
};

const sameRecords = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const parseMaintenanceDescription = (description) => {
  if (!description || typeof description !== 'string') return {};
  try {
    const parsed = JSON.parse(description);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export function useMaintenanceState(selectedVehicleId) {
  const [maintenanceLogs, setMaintenanceLogs] = useLocalStorage('fueltracker-maintenance-logs-v2', []);
  const [maintenanceReminders, setMaintenanceReminders] = useLocalStorage('fueltracker-maintenance-reminders-v2', []);
  const [maintenanceEntries, setMaintenanceEntries] = useLocalStorage('fueltracker-maintenance-entries-v3', []);
  const [categories, setCategories] = useLocalStorage('fueltracker-maintenance-categories-v1', Object.values(MAINTENANCE_CATEGORIES));

  const [maintenanceSystems, setMaintenanceSystems] = useLocalStorage('fueltracker-maintenance-systems-v1', DEFAULT_MAINTENANCE_SYSTEMS);

  const [maintenanceSettings, setMaintenanceSettings] = useLocalStorage('fueltracker-maintenance-settings-v2', {
    defaultSafetyMarginKm: 2000,
    categorySettings: {}
  });

  useEffect(() => {
    const usedTypeKeys = new Set();
    const normalizedCategories = categories.map((category) => normalizeCategoryDefinition(category, usedTypeKeys));

    if (!sameRecords(categories, normalizedCategories)) {
      setCategories(normalizedCategories);
    }
  }, [categories, setCategories]);

  useEffect(() => {
    const usedTypeKeys = new Set();
    const legacyMap = { Zap: 'Lightning', Droplet: 'Drop', Battery: 'BatteryCharging' };
    const migratedSystems = maintenanceSystems.map((system, index) => {
      const normalizedSystem = normalizeSystemDefinition(system, index, usedTypeKeys);
      let nextCategories = system.categories || [];
      if (system.id === 'fluids') {
        const missingBrakeCategories = ['brake_service', 'brake_pads'].filter((id) => !nextCategories.includes(id));
        if (missingBrakeCategories.length > 0) {
          nextCategories = [...nextCategories, ...missingBrakeCategories];
        }
      }

      if (system.id === 'engine' && (system.icon === 'Zap' || system.icon === 'Lightning')) {
        return { ...normalizedSystem, icon: 'Engine', categories: nextCategories };
      }
      if (legacyMap[system.icon]) {
        return { ...normalizedSystem, icon: legacyMap[system.icon], categories: nextCategories };
      }
      return { ...normalizedSystem, categories: nextCategories };
    });
    if (!sameRecords(maintenanceSystems, migratedSystems)) setMaintenanceSystems(migratedSystems);
  }, [maintenanceSystems, setMaintenanceSystems]);

  const getCategoryById = (id) => {
    const activeCategories = categories.filter((cat) => !cat.deletedAt && !cat.deleted_at);
    const activeCategory = activeCategories.find((cat) => cat.id === id);
    if (activeCategory) return activeCategory;
    if (id && categories.some((cat) => cat.id === id)) return undefined;
    return activeCategories.find((cat) => cat.id === 'custom') || activeCategories[0];
  };

  const normalizeMaintenanceEntry = (entry, existing = {}) => {
    const now = new Date().toISOString();
    const type = entry.type || existing.type || 'custom';
    const catDef = getCategoryById(type);
    const catSettings = maintenanceSettings?.categorySettings?.[type] || {};
    const metadata = parseMaintenanceDescription(entry.description ?? existing.description);

    const odometer = Number(entry.odometer ?? entry.performedAtODO ?? existing.odometer ?? existing.performedAtODO ?? 0) || 0;
    const intervalKm = Number(
      entry.intervalKm ??
      entry.distance ??
      metadata.distance ??
      existing.intervalKm ??
      existing.distance ??
      catSettings.intervalKm ??
      catDef.defaultInterval?.value ??
      0
    ) || 0;
    const safetyMargin = Number(
      entry.safetyMarginKm ??
      entry.safety ??
      metadata.safety ??
      existing.safetyMarginKm ??
      existing.safety ??
      catSettings.safetyMarginKm ??
      catDef.defaultSafetyMarginKm ??
      maintenanceSettings.defaultSafetyMarginKm ??
      2000
    ) || 0;
    const nextDue = intervalKm > 0
      ? odometer + intervalKm
      : Number(entry.nextDueODO ?? entry.next_due_odometer ?? existing.nextDueODO ?? existing.next_due_odometer ?? 0) || 0;
    const alertODO = nextDue > 0 ? nextDue - safetyMargin : null;
    const date = dateOnly(entry.date ?? entry.maintenanceDate ?? entry.timestamp ?? existing.date ?? existing.timestamp ?? now);
    const notes = entry.notes ?? metadata.notes ?? existing.notes ?? '';
    const rawCost = entry.cost !== undefined && entry.cost !== '' ? entry.cost : existing.cost;
    const cost = rawCost !== undefined && rawCost !== null && rawCost !== '' ? Number(rawCost) : null;
    const stableKey = entry.stableKey ?? entry.stable_key ?? existing.stableKey ?? existing.stable_key ?? createStableKey();

    return {
      ...existing,
      ...entry,
      id: entry.id ?? existing.id ?? `m_${Date.now()}`,
      stableKey,
      stable_key: stableKey,
      vehicleId: entry.vehicleId ?? existing.vehicleId ?? selectedVehicleId,
      type,
      date,
      timestamp: date,
      odometer,
      performedAtODO: odometer,
      distance: intervalKm,
      intervalKm,
      safety: safetyMargin,
      safetyMarginKm: safetyMargin,
      next_due_odometer: nextDue,
      nextDueOdometer: nextDue,
      nextDueODO: nextDue,
      alertODO,
      description: JSON.stringify({ distance: intervalKm, safety: safetyMargin, notes }),
      notes,
      cost: Number.isNaN(cost) ? null : cost,
      createdAt: entry.createdAt ?? entry.created_at ?? existing.createdAt ?? existing.created_at ?? now,
      updatedAt: now,
      deletedAt: entry.deletedAt ?? entry.deleted_at ?? existing.deletedAt ?? null,
      pendingDelete: entry.pendingDelete ?? existing.pendingDelete ?? false,
      pendingDeleteRequestedAt: entry.pendingDeleteRequestedAt ?? existing.pendingDeleteRequestedAt ?? null,
      lastAction: entry.lastAction ?? existing.lastAction ?? 'UPDATE',
      tombstoneVerifiedAt: entry.tombstoneVerifiedAt ?? existing.tombstoneVerifiedAt ?? null
    };
  };

  const addMaintenanceLog = async (log) => {
    setMaintenanceLogs((prev) => [...prev, { ...log, id: Date.now(), vehicleId: selectedVehicleId, timestamp: new Date().toISOString() }]);
    syncLocalChangesInBackground();
  };

  const updateMaintenanceLog = async (id, updatedData) => {
    setMaintenanceLogs((prev) => prev.map((log) => log.id === id ? { ...log, ...updatedData } : log));
    syncLocalChangesInBackground();
  };

  const deleteMaintenanceLog = async (id) => {
    setMaintenanceLogs((prev) => prev.filter((log) => log.id !== id));
    syncLocalChangesInBackground();
  };

  const addMaintenanceReminder = async (reminder) => {
    const safetyMargin = reminder.safetyMarginKm ?? maintenanceSettings.defaultSafetyMarginKm ?? 2000;
    const baseODO = reminder.performedAtOdometer ?? reminder.odometerThreshold ?? 0;
    const interval = reminder.odometerInterval ?? 0;
    const nextDueODO = baseODO > 0 && interval > 0 ? baseODO + interval : null;
    const alertODO = nextDueODO ? nextDueODO - safetyMargin : null;
    setMaintenanceReminders((prev) => [...prev, {
      ...reminder,
      id: Date.now(),
      vehicleId: selectedVehicleId,
      createdAt: new Date().toISOString(),
      nextDueODO,
      alertODO,
      safetyMarginKm: safetyMargin
    }]);
    syncLocalChangesInBackground();
  };

  const updateMaintenanceReminder = async (id, updatedData) => {
    setMaintenanceReminders((prev) => prev.map((reminder) => {
      if (reminder.id !== id) return reminder;
      const updated = { ...reminder, ...updatedData };
      const safetyMargin = updated.safetyMarginKm ?? maintenanceSettings.defaultSafetyMarginKm ?? 2000;
      const baseODO = updated.performedAtOdometer ?? updated.odometerThreshold ?? 0;
      const interval = updated.odometerInterval ?? 0;
      if (baseODO > 0 && interval > 0) {
        updated.nextDueODO = baseODO + interval;
        updated.alertODO = updated.nextDueODO - safetyMargin;
      }
      return updated;
    }));
    syncLocalChangesInBackground();
  };

  const deleteMaintenanceReminder = async (id) => {
    setMaintenanceReminders((prev) => prev.filter((reminder) => reminder.id !== id));
    syncLocalChangesInBackground();
  };

  const addMaintenanceEntry = async (entry) => {
    setMaintenanceEntries((prev) => [...prev, normalizeMaintenanceEntry(entry)]);
    syncLocalChangesInBackground();
  };

  const updateMaintenanceEntry = async (id, updatedData) => {
    setMaintenanceEntries((prev) => prev.map((entry) => {
      if (entry.id !== id) return entry;
      return normalizeMaintenanceEntry(updatedData, entry);
    }));
    syncLocalChangesInBackground();
  };

  const requestMaintenanceEntryDelete = async (id) => {
    setMaintenanceEntries((prev) => prev.map((entry) => entry.id === id
      ? { ...entry, pendingDelete: true, pendingDeleteRequestedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      : entry
    ));
  };

  const undoMaintenanceEntryDelete = async (id) => {
    setMaintenanceEntries((prev) => prev.map((entry) => entry.id === id
      ? { ...entry, pendingDelete: false, pendingDeleteRequestedAt: null, updatedAt: new Date().toISOString() }
      : entry
    ));
  };

  const deleteMaintenanceEntry = async (id) => {
    const deletedAt = new Date().toISOString();
    setMaintenanceEntries((prev) => prev.map((entry) => entry.id === id
      ? {
          ...entry,
          pendingDelete: false,
          pendingDeleteRequestedAt: null,
          deletedAt,
          deleted_at: deletedAt,
          lastAction: 'DELETE',
          updatedAt: deletedAt,
          tombstoneVerifiedAt: null
        }
      : entry
    ));
    syncLocalChangesInBackground();
  };

  const deleteMultipleMaintenanceEntries = async (ids) => {
    const idsSet = new Set(ids);
    const deletedAt = new Date().toISOString();
    setMaintenanceEntries((prev) => prev.map((entry) => idsSet.has(entry.id)
      ? { ...entry, deletedAt, deleted_at: deletedAt, lastAction: 'DELETE', updatedAt: deletedAt, tombstoneVerifiedAt: null }
      : entry
    ));
    syncLocalChangesInBackground();
  };

  const addMaintenanceCategory = async (category) => {
    const sourceKey = category.id && !/^custom_\d+$/.test(category.id)
      ? category.id
      : category.name;
    const baseId = makeMaintenanceTypeKey(sourceKey) || 'maintenance_item';
    const existingIds = new Set(categories.map((cat) => cat.id));
    let id = baseId;
    let suffix = 2;

    while (existingIds.has(id)) {
      id = `${baseId}_${suffix}`;
      suffix += 1;
    }

    const newCategory = normalizeCategoryDefinition({
      ...category,
      id,
      typeKey: id,
      type_key: id,
      color: category.color || '#64748b'
    }, new Set(categories.map((cat) => cat.typeKey || cat.type_key).filter(Boolean)));
    markMaintenanceTaxonomyDirty();
    setCategories((prev) => [...prev, newCategory]);
    syncLocalChangesInBackground();
    return newCategory;
  };

  const updateMaintenanceCategory = async (id, updates) => {
    const updatedAt = new Date().toISOString();
    setCategories((prev) => prev.map((cat) => cat.id === id ? {
      ...cat,
      ...updates,
      typeKey: cat.typeKey || cat.type_key || id,
      type_key: cat.type_key || cat.typeKey || id,
      updatedAt,
      updated_at: updatedAt,
      version: Number(cat.version || 1) + 1
    } : cat));
    markMaintenanceTaxonomyDirty();
    syncLocalChangesInBackground();
  };

  const deleteMaintenanceCategory = async (id) => {
    markMaintenanceTaxonomyDirty();
    setCategories((prev) => prev.filter((cat) => cat.id !== id));
    syncLocalChangesInBackground();
  };

  const updateMaintenanceSettings = (updates) => {
    markMaintenanceTaxonomyDirty();
    setMaintenanceSettings((prev) => ({ ...prev, ...updates }));
    syncLocalChangesInBackground();
  };

  const updateCategorySettings = (categoryId, settings) => {
    markMaintenanceTaxonomyDirty();
    setMaintenanceSettings((prev) => ({
      ...prev,
      categorySettings: {
        ...prev.categorySettings,
        [categoryId]: { ...prev.categorySettings[categoryId], ...settings }
      }
    }));
    syncLocalChangesInBackground();
  };

  const activeVehicleMaintenanceLogs = useMemo(() =>
    maintenanceLogs.filter((log) => log.vehicleId === selectedVehicleId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [maintenanceLogs, selectedVehicleId]
  );

  const activeVehicleMaintenanceReminders = useMemo(() =>
    maintenanceReminders.filter((r) => r.vehicleId === selectedVehicleId)
      .sort((a, b) => {
        const aDue = new Date(a.nextDueDate || a.dueDate || '9999-12-31').getTime();
        const bDue = new Date(b.nextDueDate || b.dueDate || '9999-12-31').getTime();
        return aDue - bDue;
      }),
    [maintenanceReminders, selectedVehicleId]
  );

  const activeVehicleMaintenanceEntries = useMemo(() =>
    maintenanceEntries.filter((e) => e.vehicleId === selectedVehicleId && !e.deletedAt && !e.deleted_at && !e.pendingDelete)
      .sort((a, b) => new Date(b.timestamp || b.date || 0).getTime() - new Date(a.timestamp || a.date || 0).getTime()),
    [maintenanceEntries, selectedVehicleId]
  );

  return {
    maintenanceLogs, setMaintenanceLogs,
    maintenanceReminders, setMaintenanceReminders,
    maintenanceEntries: activeVehicleMaintenanceEntries,
    allMaintenanceEntries: maintenanceEntries,
    setMaintenanceEntries,
    categories, setCategories,
    maintenanceSystems, setMaintenanceSystems,
    maintenanceSettings, setMaintenanceSettings,
    getCategoryById,
    addMaintenanceLog, updateMaintenanceLog, deleteMaintenanceLog,
    addMaintenanceReminder, updateMaintenanceReminder, deleteMaintenanceReminder,
    addMaintenanceEntry, updateMaintenanceEntry, requestMaintenanceEntryDelete, undoMaintenanceEntryDelete, deleteMaintenanceEntry, deleteMultipleMaintenanceEntries,
    addMaintenanceCategory, updateMaintenanceCategory, deleteMaintenanceCategory,
    updateMaintenanceSettings, updateCategorySettings,
    activeVehicleMaintenanceLogs,
    activeVehicleMaintenanceReminders,
    activeVehicleMaintenanceEntries
  };
}
