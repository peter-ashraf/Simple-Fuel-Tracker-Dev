import { supabase } from '../lib/supabaseClient';
import { v4 as uuidv4 } from 'uuid';
import { makeMaintenanceTypeKey } from '../utils/maintenanceTypeKey';
import { MAINTENANCE_CATEGORIES } from '../data/maintenanceCategories';

const LOCALSTORAGE_KEYS = [
  'fueltracker-vehicles-v2',
  'fueltracker-active-vehicle-v2',
  'fueltracker-prices-v2',
  'fueltracker-fillups-v2',
  'fueltracker-theme',
  'fueltracker-user-stations',
  'fueltracker-trip-estimates-v2',
  'fueltracker-tyre-comparisons-v2',
  'fueltracker-maintenance-entries-v3',
  'fueltracker-maintenance-categories-v1',
  'fueltracker-maintenance-systems-v1',
  'fueltracker-maintenance-settings-v2',
  'fueltracker-maintenance-reminders-v2'
];

const SYNC_QUEUE_KEY = 'fueltracker-sync-queue';
const MIGRATION_FLAG_KEY = 'fueltracker-migration-complete';
const MIGRATION_DECISION_KEY = 'fueltracker-migration-decision';
const CLOUD_SYNCED_FLAG_KEY = 'fueltracker-cloud-synced-timestamp';
const BACKGROUND_SYNC_LOCK_KEY = 'fueltracker-background-sync-lock';
const COUNTS_MATCHED_NO_CONFLICT_KEY = 'fueltracker-counts-matched-no-conflict';
const PENDING_SYNC_STATUS_KEY = 'fueltracker-pending-sync-status';
const MAINTENANCE_CATEGORIES_KEY = 'fueltracker-maintenance-categories-v1';
const MAINTENANCE_SYSTEMS_KEY = 'fueltracker-maintenance-systems-v1';
const MAINTENANCE_SETTINGS_KEY = 'fueltracker-maintenance-settings-v2';
const MAINTENANCE_TAXONOMY_DIRTY_KEY = 'fueltracker-maintenance-taxonomy-dirty';
const APP_SETTINGS_KEYS = [
  'fueltracker-active-vehicle-v2',
  'fueltracker-prices-v2',
  'fueltracker-theme',
  'fueltracker-user-stations',
  'fueltracker-maintenance-categories-v1',
  'fueltracker-maintenance-systems-v1',
  'fueltracker-maintenance-settings-v2',
  'fueltracker-maintenance-reminders-v2',
  'fueltracker-notifications-enabled',
  'fueltracker-trip-sample-size',
  'fueltracker-tyre-comparisons-v2',
  'fueltracker-remember-me',
  'i18nextLng'
];

const DEFAULT_MAINTENANCE_SYSTEMS = [
  { id: 'engine', name: 'Engine', icon: 'Engine', categories: ['oil_change', 'air_filter', 'spark_plugs', 'transmission_service'], color: '#ef4444' },
  { id: 'tires', name: 'Tires', icon: 'Disc', categories: ['tire_rotation', 'tire_replacement'], color: '#3b82f6' },
  { id: 'fluids', name: 'Fluids', icon: 'Drop', categories: ['coolant_flush', 'ac_filter', 'fuel_filter', 'brake_service', 'brake_pads'], color: '#06b6d4' },
  { id: 'safety', name: 'Safety', icon: 'Shield', categories: ['general_inspection'], color: '#f59e0b' },
  { id: 'electrical', name: 'Electrical', icon: 'BatteryCharging', categories: ['battery'], color: '#8b5cf6' },
  { id: 'body', name: 'Body', icon: 'Car', categories: ['custom'], color: '#64748b' }
];

const DEFAULT_SYSTEM_BY_ID = new Map(DEFAULT_MAINTENANCE_SYSTEMS.map((system) => [system.id, system]));
const DEFAULT_CATEGORY_BY_ID = new Map(Object.values(MAINTENANCE_CATEGORIES).map((category) => [category.id, category]));
const DEFAULT_SYSTEM_BY_CATEGORY_ID = new Map();
DEFAULT_MAINTENANCE_SYSTEMS.forEach((system) => {
  system.categories.forEach((categoryId) => DEFAULT_SYSTEM_BY_CATEGORY_ID.set(categoryId, system.id));
});

// Store online listener reference to prevent duplicates
let onlineListener = null;

// Background sync state
let backgroundSyncInProgress = false;
let backgroundSyncPromise = null;

// Initialization state
let initializationInProgress = false;
let initializationPromise = null;
let latestInitializationId = 0;

// Pending migration state (in-memory cache)
let pendingSyncStatus = null;

/**
 * Validate if a string is a valid UUID (any version)
 * PostgreSQL uuid columns accept UUIDs from any version or origin, not just v4.
 * Using a v4-only validator could incorrectly treat valid non-v4 UUIDs as invalid
 * and cause unnecessary ID remapping during migration, which is unsafe.
 * @param {string} value - Value to validate
 * @returns {boolean} True if valid UUID (any version)
 */
function isValidUuid(value) {
  if (typeof value !== 'string') return false;
  const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  return UUID_REGEX.test(value.trim());
}

/**
 * Generate a stable key for a vehicle
 * Uses UUID v4 for new vehicles, or deterministic hash for legacy vehicles
 * @param {Object} vehicle - Vehicle object
 * @returns {string} Stable key
 */
function generateStableKey(vehicle) {
  // If vehicle already has a stable key, return it
  if (vehicle.stableKey && isValidUuid(vehicle.stableKey)) {
    return vehicle.stableKey;
  }
  
  // For legacy vehicles without stable key, generate a UUID
  // This will be stable across future exports/imports
  return uuidv4();
}

/**
 * Backfill stable keys for legacy vehicles
 * @param {Array} vehicles - Vehicle records
 * @returns {Array} Vehicles with backfilled stable keys
 */
function backfillStableKeys(vehicles) {
  const updatedVehicles = vehicles.map(vehicle => {
    if (vehicle.stableKey && isValidUuid(vehicle.stableKey)) {
      return vehicle;
    }
    
    const stableKey = generateStableKey(vehicle);
    return { ...vehicle, stableKey };
  });
  
  localStorage.setItem('fueltracker-vehicles-v2', JSON.stringify(updatedVehicles));
  
  return updatedVehicles;
}

/**
 * Backfill stable keys for legacy fillups and persist to localStorage
 * @param {Array} fillups - Fillup records
 * @returns {Array} Fillups with stable keys
 */
function backfillStableKeysForFillups(fillups) {
  const updatedFillups = fillups.map(fillup => {
    if (fillup.stableKey && isValidUuid(fillup.stableKey)) {
      return fillup;
    }
    
    const stableKey = generateStableKey(fillup);
    return { ...fillup, stableKey };
  });
  
  localStorage.setItem('fueltracker-fillups-v2', JSON.stringify(updatedFillups));
  
  return updatedFillups;
}

/**
 * Backfill stable keys for legacy maintenance and persist to localStorage
 * @param {Array} maintenance - Maintenance records
 * @returns {Array} Maintenance with stable keys
 */
function backfillStableKeysForMaintenance(maintenance) {
  const updatedMaintenance = maintenance.map(entry => {
    if (entry.stableKey && isValidUuid(entry.stableKey)) {
      return entry;
    }
    
    const stableKey = generateStableKey(entry);
    return { ...entry, stableKey };
  });
  
  localStorage.setItem('fueltracker-maintenance-entries-v3', JSON.stringify(updatedMaintenance));
  
  return updatedMaintenance;
}

function isMissingTaxonomyTableError(error) {
  if (!error) return false;
  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase();
  return error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.code === 'PGRST204' ||
    message.includes('maintenance_systems') && message.includes('not found') ||
    message.includes('maintenance_subcategories') && message.includes('not found') ||
    message.includes('does not exist');
}

function getIsoNow() {
  return new Date().toISOString();
}

function getTaxonomyStableKey(record, fallbackPrefix) {
  return record.stableKey ||
    record.stable_key ||
    record.id ||
    `${fallbackPrefix}_${uuidv4()}`;
}

function getTaxonomyTypeKey(record, fallback) {
  return record.typeKey ||
    record.type_key ||
    makeMaintenanceTypeKey(record.id || record.name || fallback) ||
    fallback;
}

function loadLocalMaintenanceTaxonomy() {
  const systems = JSON.parse(localStorage.getItem(MAINTENANCE_SYSTEMS_KEY) || '[]');
  const categories = JSON.parse(localStorage.getItem(MAINTENANCE_CATEGORIES_KEY) || '[]');
  const settings = JSON.parse(localStorage.getItem(MAINTENANCE_SETTINGS_KEY) || '{"categorySettings":{}}');
  return { systems, categories, settings };
}

function hasDirtyMaintenanceTaxonomy() {
  return Boolean(localStorage.getItem(MAINTENANCE_TAXONOMY_DIRTY_KEY));
}

function clearDirtyMaintenanceTaxonomy() {
  localStorage.removeItem(MAINTENANCE_TAXONOMY_DIRTY_KEY);
}

function collectAppSettingsForCloud() {
  const settings = {};
  APP_SETTINGS_KEYS.forEach(key => {
    const value = localStorage.getItem(key);
    if (value !== null) {
      try {
        settings[key] = JSON.parse(value);
      } catch {
        settings[key] = value;
      }
    }
  });
  return settings;
}

function getSelectedVehicleLocalId() {
  const selectedVehicleId = JSON.parse(localStorage.getItem('fueltracker-active-vehicle-v2') || 'null');
  const vehicles = JSON.parse(localStorage.getItem('fueltracker-vehicles-v2') || '[]');
  if (selectedVehicleId && vehicles.some((vehicle) => vehicle.id === selectedVehicleId && !vehicle.deletedAt && !vehicle.deleted_at)) {
    return selectedVehicleId;
  }
  return vehicles.find((vehicle) => !vehicle.deletedAt && !vehicle.deleted_at)?.id || null;
}

function isHollowMaintenanceRecord(record) {
  if (!record || record.deletedAt || record.deleted_at || record.lastAction === 'DELETE') return false;
  const hasTypeAndDate = Boolean(record.type) && Boolean(record.date || record.timestamp || record.createdAt || record.created_at);
  const hasOdometer = record.odometer !== null && record.odometer !== undefined && record.odometer !== '';
  const hasInterval = record.distance !== null && record.distance !== undefined && record.distance !== '' ||
    record.intervalKm !== null && record.intervalKm !== undefined && record.intervalKm !== '';
  const hasNextDue = record.nextDueOdometer !== null && record.nextDueOdometer !== undefined && record.nextDueOdometer !== '' ||
    record.nextDueODO !== null && record.nextDueODO !== undefined && record.nextDueODO !== '' ||
    record.next_due_odometer !== null && record.next_due_odometer !== undefined && record.next_due_odometer !== '';
  const hasDescription = Boolean(record.description && String(record.description).trim());
  const hasNotes = Boolean(record.notes && String(record.notes).trim());
  const hasCost = record.cost !== null && record.cost !== undefined && record.cost !== '';

  return hasTypeAndDate && !hasOdometer && !hasInterval && !hasNextDue && !hasDescription && !hasNotes && !hasCost;
}

function filterUsableMaintenanceRecords(records) {
  return (records || []).filter((record) => !isHollowMaintenanceRecord(record));
}

function normalizeNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? null : numberValue;
}

function normalizeNullableText(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function normalizeMaintenanceDescription(value) {
  if (value === null || value === undefined || value === '') {
    return JSON.stringify({ distance: null, safety: null, notes: '' });
  }

  if (typeof value !== 'string') {
    return JSON.stringify(value);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return JSON.stringify({ distance: null, safety: null, notes: '' });
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return JSON.stringify({
        distance: normalizeNullableNumber(parsed.distance),
        safety: normalizeNullableNumber(parsed.safety),
        notes: parsed.notes || ''
      });
    }
  } catch {
    // Plain-text legacy descriptions are compared as text below.
  }

  return trimmed;
}

function maintenancePayloadMatchesCloud(payload, cloudRecord) {
  if (!cloudRecord) return false;
  return payload.vehicle_id === cloudRecord.vehicle_id &&
    payload.date === cloudRecord.date &&
    normalizeNullableText(payload.type) === normalizeNullableText(cloudRecord.type) &&
    normalizeMaintenanceDescription(payload.description) === normalizeMaintenanceDescription(cloudRecord.description) &&
    normalizeNullableNumber(payload.cost) === normalizeNullableNumber(cloudRecord.cost) &&
    normalizeNullableNumber(payload.odometer) === normalizeNullableNumber(cloudRecord.odometer) &&
    normalizeNullableText(payload.next_due_date) === normalizeNullableText(cloudRecord.next_due_date) &&
    normalizeNullableNumber(payload.next_due_odometer) === normalizeNullableNumber(cloudRecord.next_due_odometer) &&
    normalizeNullableText(payload.stable_key) === normalizeNullableText(cloudRecord.stable_key) &&
    normalizeNullableText(payload.deleted_at) === normalizeNullableText(cloudRecord.deleted_at) &&
    normalizeNullableText(payload.subcategory_stable_key) === normalizeNullableText(cloudRecord.subcategory_stable_key) &&
    normalizeNullableText(payload.subcategory_type_key) === normalizeNullableText(cloudRecord.subcategory_type_key) &&
    normalizeNullableText(payload.system_stable_key) === normalizeNullableText(cloudRecord.system_stable_key) &&
    normalizeNullableText(payload.subcategory_name_snapshot) === normalizeNullableText(cloudRecord.subcategory_name_snapshot);
}

function taxonomyPayloadMatchesCloud(payload, cloudRecord) {
  if (!cloudRecord) return false;
  return payload.user_id === cloudRecord.user_id &&
    payload.vehicle_id === cloudRecord.vehicle_id &&
    normalizeNullableText(payload.stable_key) === normalizeNullableText(cloudRecord.stable_key) &&
    normalizeNullableText(payload.type_key) === normalizeNullableText(cloudRecord.type_key) &&
    normalizeNullableText(payload.name) === normalizeNullableText(cloudRecord.name) &&
    normalizeNullableText(payload.icon) === normalizeNullableText(cloudRecord.icon) &&
    normalizeNullableText(payload.color) === normalizeNullableText(cloudRecord.color) &&
    normalizeNullableNumber(payload.sort_order) === normalizeNullableNumber(cloudRecord.sort_order) &&
    Boolean(payload.is_default) === Boolean(cloudRecord.is_default) &&
    normalizeNullableText(payload.deleted_at) === normalizeNullableText(cloudRecord.deleted_at) &&
    (payload.system_stable_key === undefined || normalizeNullableText(payload.system_stable_key) === normalizeNullableText(cloudRecord.system_stable_key)) &&
    (payload.default_distance === undefined || normalizeNullableNumber(payload.default_distance) === normalizeNullableNumber(cloudRecord.default_distance)) &&
    (payload.default_safety === undefined || normalizeNullableNumber(payload.default_safety) === normalizeNullableNumber(cloudRecord.default_safety)) &&
    (payload.default_notes === undefined || normalizeNullableText(payload.default_notes) === normalizeNullableText(cloudRecord.default_notes));
}

function sameStringSet(a = [], b = []) {
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every((value) => bSet.has(value));
}

function isSystemCustomized(system) {
  const id = system.id || system.typeKey || system.type_key || system.stableKey || system.stable_key;
  const defaultSystem = DEFAULT_SYSTEM_BY_ID.get(id);
  if (!defaultSystem) return true;
  return normalizeNullableText(system.name) !== defaultSystem.name ||
    normalizeNullableText(system.icon) !== defaultSystem.icon ||
    normalizeNullableText(system.color) !== defaultSystem.color ||
    !sameStringSet(system.categories || [], defaultSystem.categories || []) ||
    Boolean(system.deletedAt || system.deleted_at);
}

function getCategorySystemId(categoryId, systems) {
  return systems.find((system) => (system.categories || []).includes(categoryId))?.id || null;
}

function isCategoryCustomized(category, systems, settings = {}) {
  const id = category.id || category.typeKey || category.type_key || category.stableKey || category.stable_key;
  const defaultCategory = DEFAULT_CATEGORY_BY_ID.get(id);
  const categorySettings = settings?.categorySettings?.[id] || {};
  if (!defaultCategory) return true;

  const defaultSystemId = DEFAULT_SYSTEM_BY_CATEGORY_ID.get(id) || null;
  const currentSystemId = getCategorySystemId(id, systems);
  const interval = categorySettings.intervalKm ??
    category.defaultInterval?.value ??
    category.defaultDistance ??
    category.default_distance ??
    null;
  const safety = categorySettings.safetyMarginKm ??
    category.defaultSafetyMarginKm ??
    category.default_safety ??
    null;

  return normalizeNullableText(category.name) !== defaultCategory.name ||
    normalizeNullableText(category.icon) !== defaultCategory.icon ||
    normalizeNullableText(category.color) !== defaultCategory.color ||
    normalizeNullableNumber(interval) !== normalizeNullableNumber(defaultCategory.defaultInterval?.value) ||
    normalizeNullableNumber(safety) !== normalizeNullableNumber(defaultCategory.defaultSafetyMarginKm) ||
    categorySettings.enabled === false ||
    currentSystemId !== defaultSystemId ||
    Boolean(category.deletedAt || category.deleted_at);
}

function getCustomizedMaintenanceTaxonomy(systems, categories, settings) {
  const customizedSystems = systems.filter(isSystemCustomized);
  const customizedCategories = categories.filter((category) => isCategoryCustomized(category, systems, settings));

  return {
    systems: customizedSystems,
    categories: customizedCategories,
    hasCustomizations: customizedSystems.length > 0 || customizedCategories.length > 0
  };
}

function getMaintenanceTaxonomyMetadata(entry, systems, categories) {
  const category = categories.find((cat) =>
    cat.id === entry.type ||
    cat.typeKey === entry.type ||
    cat.type_key === entry.type ||
    cat.stableKey === entry.subcategoryStableKey ||
    cat.stable_key === entry.subcategory_stable_key
  );
  const system = category
    ? systems.find((candidate) => (candidate.categories || []).includes(category.id))
    : null;

  return {
    category,
    system,
    subcategoryStableKey: category ? getTaxonomyStableKey(category, 'category') : entry.subcategoryStableKey || entry.subcategory_stable_key || null,
    subcategoryTypeKey: category ? getTaxonomyTypeKey(category, category.id || entry.type) : entry.subcategoryTypeKey || entry.subcategory_type_key || entry.type || null,
    subcategoryNameSnapshot: category?.name || entry.subcategoryNameSnapshot || entry.subcategory_name_snapshot || entry.type || null,
    systemStableKey: system ? getTaxonomyStableKey(system, 'system') : entry.systemStableKey || entry.system_stable_key || null
  };
}

function getMaintenanceTaxonomyForSync(systems, categories, settings, vehicleId) {
  const customized = getCustomizedMaintenanceTaxonomy(systems, categories, settings);
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const systemByCategory = new Map();
  systems.forEach((system) => {
    (system.categories || []).forEach((categoryId) => {
      if (!systemByCategory.has(categoryId)) systemByCategory.set(categoryId, system);
    });
  });

  const systemMap = new Map(customized.systems.map((system) => [system.id, system]));
  const categoryMap = new Map(customized.categories.map((category) => [category.id, category]));
  const maintenanceEntries = JSON.parse(localStorage.getItem('fueltracker-maintenance-entries-v3') || '[]');

  maintenanceEntries
    .filter((entry) =>
      !entry.deletedAt &&
      !entry.deleted_at &&
      entry.lastAction !== 'DELETE' &&
      (!vehicleId || entry.vehicleId === vehicleId || entry.vehicle_id === vehicleId)
    )
    .forEach((entry) => {
      const category = categoryById.get(entry.type);
      if (!category) return;
      categoryMap.set(category.id, category);
      const system = systemByCategory.get(category.id);
      if (system) systemMap.set(system.id, system);
    });

  return {
    systems: Array.from(systemMap.values()),
    categories: Array.from(categoryMap.values()),
    hasCustomizations: systemMap.size > 0 || categoryMap.size > 0,
    systemByCategory
  };
}

function splitHollowMaintenanceRecords(records) {
  const usable = [];
  const hollow = [];

  records.forEach((record) => {
    if (isHollowMaintenanceRecord(record)) hollow.push(record);
    else usable.push(record);
  });

  return { usable, hollow };
}

function tombstoneLocalMaintenanceRecords(records) {
  if (!records.length) return [];
  const deletedAt = getIsoNow();
  const hollowKeys = new Set(records.map((record) => record.stableKey || record.stable_key || record.id).filter(Boolean));
  const allMaintenance = JSON.parse(localStorage.getItem('fueltracker-maintenance-entries-v3') || '[]');
  const updatedMaintenance = allMaintenance.map((entry) => {
    const key = entry.stableKey || entry.stable_key || entry.id;
    if (!hollowKeys.has(key)) return entry;
    return {
      ...entry,
      deletedAt,
      deleted_at: deletedAt,
      updatedAt: deletedAt,
      updated_at: deletedAt,
      lastAction: 'DELETE',
      pendingDelete: false,
      pendingDeleteRequestedAt: null,
      tombstoneVerifiedAt: null
    };
  });
  localStorage.setItem('fueltracker-maintenance-entries-v3', JSON.stringify(updatedMaintenance));
  return updatedMaintenance;
}

function mapLocalSystemToCloud(system, userId, vehicleId, sortOrder = 0) {
  const now = getIsoNow();
  const stableKey = getTaxonomyStableKey(system, 'system');
  const typeKey = getTaxonomyTypeKey(system, 'maintenance_system');

  return {
    user_id: userId,
    vehicle_id: vehicleId,
    stable_key: stableKey,
    type_key: typeKey,
    name: system.name || typeKey,
    icon: system.icon || null,
    color: system.color || null,
    sort_order: Number(system.sortOrder ?? system.sort_order ?? sortOrder) || 0,
    is_default: Boolean(system.isDefault ?? system.is_default ?? false),
    version: Number(system.version || 1),
    created_at: system.createdAt || system.created_at || now,
    updated_at: system.updatedAt || system.updated_at || now,
    deleted_at: system.deletedAt || system.deleted_at || null
  };
}

function mapLocalCategoryToCloud(category, system, userId, vehicleId, cloudSystemId = null, sortOrder = 0, categorySettings = {}) {
  const now = getIsoNow();
  const stableKey = getTaxonomyStableKey(category, 'category');
  const typeKey = getTaxonomyTypeKey(category, 'maintenance_item');
  const defaultDistance = categorySettings.intervalKm ??
    category.defaultDistance ??
    category.default_distance ??
    category.defaultInterval?.value ??
    null;
  const defaultSafety = categorySettings.safetyMarginKm ??
    category.defaultSafetyMarginKm ??
    category.default_safety ??
    null;

  return {
    user_id: userId,
    vehicle_id: vehicleId,
    system_id: cloudSystemId,
    system_stable_key: system ? getTaxonomyStableKey(system, 'system') : null,
    stable_key: stableKey,
    type_key: typeKey,
    name: category.name || typeKey,
    icon: category.icon || null,
    color: category.color || null,
    default_distance: defaultDistance !== null ? Number(defaultDistance) : null,
    default_safety: defaultSafety !== null ? Number(defaultSafety) : null,
    default_notes: category.defaultNotes || category.default_notes || null,
    sort_order: Number(category.sortOrder ?? category.sort_order ?? sortOrder) || 0,
    is_default: Boolean(category.isDefault ?? category.is_default ?? false),
    version: Number(category.version || 1),
    created_at: category.createdAt || category.created_at || now,
    updated_at: category.updatedAt || category.updated_at || now,
    deleted_at: category.deletedAt || category.deleted_at || null
  };
}

function mapCloudSystemToLocal(system) {
  return {
    id: system.type_key || system.stable_key,
    stableKey: system.stable_key,
    stable_key: system.stable_key,
    typeKey: system.type_key,
    type_key: system.type_key,
    name: system.name,
    icon: system.icon || 'Wrench',
    color: system.color || '#64748b',
    categories: [],
    sortOrder: system.sort_order ?? 0,
    sort_order: system.sort_order ?? 0,
    isDefault: system.is_default ?? false,
    is_default: system.is_default ?? false,
    createdAt: system.created_at,
    created_at: system.created_at,
    updatedAt: system.updated_at,
    updated_at: system.updated_at,
    deletedAt: system.deleted_at,
    deleted_at: system.deleted_at,
    version: system.version ?? 1
  };
}

function mapCloudCategoryToLocal(category) {
  return {
    id: category.type_key || category.stable_key,
    stableKey: category.stable_key,
    stable_key: category.stable_key,
    typeKey: category.type_key,
    type_key: category.type_key,
    name: category.name,
    icon: category.icon || 'custom',
    color: category.color || '#64748b',
    defaultInterval: {
      type: 'distance',
      value: Number(category.default_distance || 0)
    },
    defaultSafetyMarginKm: Number(category.default_safety || 0),
    defaultNotes: category.default_notes || '',
    sortOrder: category.sort_order ?? 0,
    sort_order: category.sort_order ?? 0,
    isDefault: category.is_default ?? false,
    is_default: category.is_default ?? false,
    createdAt: category.created_at,
    created_at: category.created_at,
    updatedAt: category.updated_at,
    updated_at: category.updated_at,
    deletedAt: category.deleted_at,
    deleted_at: category.deleted_at,
    version: category.version ?? 1
  };
}

function getTaxonomyMergeKey(record, fallbackPrefix) {
  return record.stableKey ||
    record.stable_key ||
    record.typeKey ||
    record.type_key ||
    record.id ||
    `${fallbackPrefix}_${uuidv4()}`;
}

function buildDefaultMaintenanceSystems() {
  return DEFAULT_MAINTENANCE_SYSTEMS.map((system, index) => ({
    ...system,
    stableKey: system.stableKey || system.stable_key || system.id,
    stable_key: system.stable_key || system.stableKey || system.id,
    typeKey: system.typeKey || system.type_key || system.id,
    type_key: system.type_key || system.typeKey || system.id,
    sortOrder: system.sortOrder ?? system.sort_order ?? index,
    sort_order: system.sort_order ?? system.sortOrder ?? index,
    isDefault: system.isDefault ?? system.is_default ?? true,
    is_default: system.is_default ?? system.isDefault ?? true,
    categories: [...(system.categories || [])]
  }));
}

function buildDefaultMaintenanceCategories() {
  return Object.values(MAINTENANCE_CATEGORIES).map((category, index) => ({
    ...category,
    stableKey: category.stableKey || category.stable_key || category.id,
    stable_key: category.stable_key || category.stableKey || category.id,
    typeKey: category.typeKey || category.type_key || category.id,
    type_key: category.type_key || category.typeKey || category.id,
    sortOrder: category.sortOrder ?? category.sort_order ?? index,
    sort_order: category.sort_order ?? category.sortOrder ?? index,
    isDefault: category.isDefault ?? category.is_default ?? true,
    is_default: category.is_default ?? category.isDefault ?? true
  }));
}

function mergeDownloadedMaintenanceTaxonomy(cloudSystems = [], cloudCategories = []) {
  const currentSystems = JSON.parse(localStorage.getItem(MAINTENANCE_SYSTEMS_KEY) || '[]');
  const currentCategories = JSON.parse(localStorage.getItem(MAINTENANCE_CATEGORIES_KEY) || '[]');
  const settings = JSON.parse(localStorage.getItem(MAINTENANCE_SETTINGS_KEY) || '{"categorySettings":{}}');

  const mergedSystems = (currentSystems.length > 0 ? currentSystems : buildDefaultMaintenanceSystems())
    .map((system, index) => ({
      ...system,
      stableKey: system.stableKey || system.stable_key || system.id,
      stable_key: system.stable_key || system.stableKey || system.id,
      typeKey: system.typeKey || system.type_key || system.id,
      type_key: system.type_key || system.typeKey || system.id,
      sortOrder: system.sortOrder ?? system.sort_order ?? index,
      sort_order: system.sort_order ?? system.sortOrder ?? index,
      categories: [...(system.categories || [])]
    }));
  const mergedCategories = (currentCategories.length > 0 ? currentCategories : buildDefaultMaintenanceCategories())
    .map((category, index) => ({
      ...category,
      stableKey: category.stableKey || category.stable_key || category.id,
      stable_key: category.stable_key || category.stableKey || category.id,
      typeKey: category.typeKey || category.type_key || category.id,
      type_key: category.type_key || category.typeKey || category.id,
      sortOrder: category.sortOrder ?? category.sort_order ?? index,
      sort_order: category.sort_order ?? category.sortOrder ?? index
    }));

  const systemIndexByKey = new Map();
  mergedSystems.forEach((system, index) => {
    [system.id, system.stableKey, system.stable_key, system.typeKey, system.type_key]
      .filter(Boolean)
      .forEach((key) => systemIndexByKey.set(key, index));
  });

  cloudSystems.forEach((cloudSystem) => {
    const localSystem = mapCloudSystemToLocal(cloudSystem);
    const key = getTaxonomyMergeKey(localSystem, 'system');
    const existingIndex = systemIndexByKey.get(key);

    if (existingIndex !== undefined) {
      const existing = mergedSystems[existingIndex];
      mergedSystems[existingIndex] = {
        ...existing,
        ...localSystem,
        categories: [...(existing.categories || [])]
      };
    } else {
      const nextIndex = mergedSystems.length;
      mergedSystems.push(localSystem);
      [localSystem.id, localSystem.stableKey, localSystem.stable_key, localSystem.typeKey, localSystem.type_key]
        .filter(Boolean)
        .forEach((systemKey) => systemIndexByKey.set(systemKey, nextIndex));
    }
  });

  const categoryIndexByKey = new Map();
  mergedCategories.forEach((category, index) => {
    [category.id, category.stableKey, category.stable_key, category.typeKey, category.type_key]
      .filter(Boolean)
      .forEach((key) => categoryIndexByKey.set(key, index));
  });

  cloudCategories.forEach((cloudCategory) => {
    const localCategory = mapCloudCategoryToLocal(cloudCategory);
    const key = getTaxonomyMergeKey(localCategory, 'category');
    const existingIndex = categoryIndexByKey.get(key);

    if (existingIndex !== undefined) {
      mergedCategories[existingIndex] = {
        ...mergedCategories[existingIndex],
        ...localCategory
      };
    } else {
      const nextIndex = mergedCategories.length;
      mergedCategories.push(localCategory);
      [localCategory.id, localCategory.stableKey, localCategory.stable_key, localCategory.typeKey, localCategory.type_key]
        .filter(Boolean)
        .forEach((categoryKey) => categoryIndexByKey.set(categoryKey, nextIndex));
    }

    const categoryId = localCategory.id;
    if (Object.prototype.hasOwnProperty.call(cloudCategory, 'system_stable_key')) {
      mergedSystems.forEach((system) => {
        system.categories = (system.categories || []).filter((id) => id !== categoryId);
      });
      if (cloudCategory.system_stable_key && !cloudCategory.deleted_at) {
        const parentSystem = mergedSystems.find((system) =>
          [system.id, system.stableKey, system.stable_key, system.typeKey, system.type_key].includes(cloudCategory.system_stable_key)
        );
        if (parentSystem && !parentSystem.categories.includes(categoryId)) {
          parentSystem.categories.push(categoryId);
        }
      }
    }

    settings.categorySettings = settings.categorySettings || {};
    settings.categorySettings[categoryId] = {
      ...(settings.categorySettings[categoryId] || {}),
      intervalKm: localCategory.defaultInterval?.value ?? localCategory.defaultDistance ?? localCategory.default_distance ?? null,
      safetyMarginKm: localCategory.defaultSafetyMarginKm ?? localCategory.default_safety ?? null,
      enabled: cloudCategory.deleted_at ? false : settings.categorySettings[categoryId]?.enabled ?? true
    };
  });

  return { systems: mergedSystems, categories: mergedCategories, settings };
}

/**
 * Normalize vehicle object for matching (handles camelCase/snake_case differences)
 * @param {Object} vehicle - Vehicle object from local or cloud
 * @param {string} source - 'local' or 'cloud'
 * @returns {Object} Normalized vehicle object with consistent field names
 */
function normalizeVehicleForMatch(vehicle, source) {
  // Handle snake_case to camelCase conversion for cloud data
  if (source === 'cloud') {
    return {
      id: vehicle.id,
      stableKey: vehicle.stable_key || vehicle.stableKey,
      name: vehicle.name,
      tankCapacity: vehicle.tank_capacity || vehicle.tankCapacity,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      fuelType: vehicle.fuel_type || vehicle.fuelType,
      licensePlate: vehicle.license_plate || vehicle.licensePlate,
      tyreWidth: vehicle.tyre_width || vehicle.tyreWidth,
      tyreAspectRatio: vehicle.tyre_aspect_ratio || vehicle.tyreAspectRatio,
      tyreRimSize: vehicle.tyre_rim_size || vehicle.tyreRimSize
    };
  }
  
  // Local data is already in camelCase
  return {
    id: vehicle.id,
    stableKey: vehicle.stableKey,
    name: vehicle.name,
    tankCapacity: vehicle.tankCapacity,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    fuelType: vehicle.fuelType,
    licensePlate: vehicle.licensePlate,
    tyreWidth: vehicle.tyreWidth,
    tyreAspectRatio: vehicle.tyreAspectRatio,
    tyreRimSize: vehicle.tyreRimSize
  };
}

/**
 * Generate a fingerprint for vehicle matching (fallback for legacy data)
 * @param {Object} vehicle - Normalized vehicle object
 * @returns {string} Fingerprint string
 */
function generateVehicleFingerprint(vehicle) {
  const parts = [
    vehicle.name,
    vehicle.tankCapacity,
    vehicle.make,
    vehicle.model,
    vehicle.year
  ];

  return parts
    .map(v => (v ?? '').toString().toLowerCase().trim())
    .join('|');
}

/**
 * Match vehicles by stable key or fingerprint (with normalization)
 * @param {Array} localVehicles - Local vehicle records
 * @param {Array} cloudVehicles - Cloud vehicle records
 * @returns {Object} { matches: Map, unmatchedLocal: Array, unmatchedCloud: Array }
 */
function matchVehicles(localVehicles, cloudVehicles) {
  const matches = new Map(); // localId -> cloudId
  const cloudByStableKey = new Map();
  const cloudByFingerprint = new Map();
  
  // Build cloud lookup maps with normalization
  cloudVehicles.forEach(cloudVehicle => {
    const normalized = normalizeVehicleForMatch(cloudVehicle, 'cloud');
    if (normalized.stableKey) {
      cloudByStableKey.set(normalized.stableKey, cloudVehicle);
    }
    const fingerprint = generateVehicleFingerprint(normalized);
    cloudByFingerprint.set(fingerprint, cloudVehicle);
  });
  
  const unmatchedLocal = [];
  const unmatchedCloud = [...cloudVehicles];
  
  // Match local vehicles to cloud vehicles with normalization
  localVehicles.forEach(localVehicle => {
    const normalizedLocal = normalizeVehicleForMatch(localVehicle, 'local');
    const stableKey = normalizedLocal.stableKey;
    const fingerprint = generateVehicleFingerprint(normalizedLocal);
    
    // First try stable key match
    if (stableKey && cloudByStableKey.has(stableKey)) {
      const cloudVehicle = cloudByStableKey.get(stableKey);
      matches.set(localVehicle.id, cloudVehicle.id);
      
      // Remove from unmatched cloud
      const idx = unmatchedCloud.findIndex(v => v.id === cloudVehicle.id);
      if (idx !== -1) unmatchedCloud.splice(idx, 1);
      return;
    }
    
    // Fallback to fingerprint match for legacy vehicles
    if (cloudByFingerprint.has(fingerprint)) {
      const cloudVehicle = cloudByFingerprint.get(fingerprint);
      matches.set(localVehicle.id, cloudVehicle.id);
      
      // Remove from unmatched cloud
      const idx = unmatchedCloud.findIndex(v => v.id === cloudVehicle.id);
      if (idx !== -1) unmatchedCloud.splice(idx, 1);
      return;
    }
    
    // No match found
    unmatchedLocal.push(localVehicle);
  });
  
  return { matches, unmatchedLocal, unmatchedCloud };
}

/**
 * Sync tombstones (deleted records) to cloud
 * @param {string} userId - User ID
 * @param {Array} localRecords - Local records with deleted_at
 * @param {string} tableName - Table name
 * @returns {Promise<Object>} Sync result
 */
async function syncTombstonesToCloud(userId, localRecords, tableName) {
  const deletedRecords = localRecords.filter(r => r.deletedAt);
  if (deletedRecords.length === 0) {
    return { synced: 0, errors: 0 };
  }
  
  let synced = 0;
  let errors = 0;
  
  for (const record of deletedRecords) {
    const tombstonePayload = { deleted_at: record.deletedAt };
    let error = null;
    let updatedRows = [];

    if (record.stableKey || record.stable_key) {
      const result = await supabase
        .from(tableName)
        .update(tombstonePayload)
        .eq('stable_key', record.stableKey || record.stable_key)
        .eq('user_id', userId)
        .select('id');

      error = result.error;
      updatedRows = result.data || [];
    }

    if (!error && updatedRows.length === 0 && isValidUuid(record.id)) {
      const result = await supabase
        .from(tableName)
        .update(tombstonePayload)
        .eq('id', record.id)
        .eq('user_id', userId)
        .select('id');

      error = result.error;
      updatedRows = result.data || [];
    }
    
    if (error || updatedRows.length === 0) {
      errors++;
    } else {
      synced++;
    }
  }
  
  return { synced, errors };
}

/**
 * Detect if there are any changes between local and cloud records
 * @param {Object} localData - Local data summary
 * @param {Object} cloudData - Cloud data summary
 * @returns {Object} { hasChanges: boolean, changeType: string }
 */
function detectChanges(localData, cloudData) {
  // Check for new records
  const newVehicles = localData.vehicles.filter(v => !cloudData.vehicles.some(cv => cv.stable_key === v.stableKey));
  const newFillups = localData.fillups.filter(f => !cloudData.fillups.some(cf => cf.stable_key === f.stableKey));
  const newMaintenance = localData.maintenance.filter(m => !cloudData.maintenance.some(cm => cm.id === m.id));
  const newTrips = localData.tripEstimates.filter(t => !cloudData.tripEstimates.some(ct => ct.id === t.id));
  
  // Check for updated records (simplified comparison)
  const updatedVehicles = localData.vehicles.filter(v => {
    const cloudV = cloudData.vehicles.find(cv => cv.stable_key === v.stableKey);
    if (!cloudV) return false;
    // Compare actual persisted fields
    return v.name !== cloudV.name ||
           v.make !== cloudV.make ||
           v.model !== cloudV.model ||
           v.year !== cloudV.year ||
           v.fuelType !== cloudV.fuel_type ||
           v.tankCapacity !== cloudV.tank_capacity ||
           v.licensePlate !== cloudV.license_plate;
  });
  
  // Check for deleted records (local has record that cloud doesn't, and not new)
  const deletedVehicles = cloudData.vehicles.filter(cv => !localData.vehicles.some(lv => lv.stableKey === cv.stable_key));
  const deletedFillups = cloudData.fillups.filter(cf => !localData.fillups.some(lf => lf.stableKey === cf.stable_key));
  
  const hasNewRecords = newVehicles.length > 0 || newFillups.length > 0 || newMaintenance.length > 0 || newTrips.length > 0;
  const hasUpdates = updatedVehicles.length > 0;
  const hasDeletions = deletedVehicles.length > 0 || deletedFillups.length > 0;
  
  let changeType = 'none';
  if (hasDeletions) changeType = 'deletions';
  else if (hasUpdates) changeType = 'updates';
  else if (hasNewRecords) changeType = 'inserts';
  
  return {
    hasChanges: hasNewRecords || hasUpdates || hasDeletions,
    changeType,
    newVehicles: newVehicles.length,
    newFillups: newFillups.length,
    updatedVehicles: updatedVehicles.length,
    deletedVehicles: deletedVehicles.length
  };
}

/**
 * Detect duplicate fillup by business fields (fallback for historical bad data)
 * @param {Object} fillup - Fillup to check
 * @param {Array} existingFillups - Existing cloud fillups
 * @returns {Object} { isDuplicate: boolean, existingId: string | null }
 */
function detectDuplicateFillupByFields(fillup, existingFillups, userId) {
  const normalized = {
    user_id: userId || fillup.userId || fillup.user_id,
    vehicle_id: fillup.vehicleId || fillup.vehicle_id,
    date: fillup.date,
    odometer: Number(fillup.odometer),
    liters: Number(fillup.liters),
    price_per_liter: Number(fillup.pricePerLiter || fillup.price_per_liter)
  };
  
  for (const existing of existingFillups) {
    const existingOdo = Number(existing.odometer);
    const existingLiters = Number(existing.liters);
    const existingPrice = Number(existing.price_per_liter);

    if (
      existing.user_id === normalized.user_id &&
      existing.vehicle_id === normalized.vehicle_id &&
      existing.date === normalized.date &&
      Math.abs(existingOdo - normalized.odometer) < 0.01 &&
      Math.abs(existingLiters - normalized.liters) < 0.01 &&
      Math.abs(existingPrice - normalized.price_per_liter) < 0.001
    ) {
      return { isDuplicate: true, existingId: existing.id };
    }
  }
  
  return { isDuplicate: false, existingId: null };
}

/**
 * Normalize a fillup record for cloud upload/merge
 * Remaps vehicleId, validates required fields, computes missing total_cost
 * @param {Object} fillup - Original fillup record
 * @param {Map} vehicleIdMap - Map of old vehicle IDs to new UUIDs
 * @returns {Object} { normalized: Object, skipped: boolean, reason: string }
 */
function normalizeFillupForCloud(fillup, vehicleIdMap) {
  const id = fillup.id || 'unknown';
  console.log(`[Sync][fillup] Normalizing fillup ${id}`);

  // Remap vehicleId if needed
  const oldVehicleId = fillup.vehicleId;
  const newVehicleId = vehicleIdMap.has(oldVehicleId) ? vehicleIdMap.get(oldVehicleId) : oldVehicleId;

  // Validate required fields
  if (!newVehicleId) {
    console.log(`[Sync][fillup] Skipping fillup ${id} due to missing vehicleId`);
    return { normalized: null, skipped: true, reason: 'missing vehicleId' };
  }

  if (!fillup.odometer || fillup.odometer === null || fillup.odometer === undefined) {
    console.log(`[Sync][fillup] Skipping fillup ${id} due to missing odometer`);
    return { normalized: null, skipped: true, reason: 'missing odometer' };
  }

  if (!fillup.liters || fillup.liters === null || fillup.liters === undefined) {
    console.log(`[Sync][fillup] Skipping fillup ${id} due to missing liters`);
    return { normalized: null, skipped: true, reason: 'missing liters' };
  }

  if (!fillup.pricePerLiter || fillup.pricePerLiter === null || fillup.pricePerLiter === undefined) {
    console.log(`[Sync][fillup] Skipping fillup ${id} due to missing pricePerLiter`);
    return { normalized: null, skipped: true, reason: 'missing pricePerLiter' };
  }

  // Convert numeric strings to numbers
  const odometer = Number(fillup.odometer);
  const liters = Number(fillup.liters);
  const pricePerLiter = Number(fillup.pricePerLiter);

  // Compute total_cost if missing or invalid
  let totalCost = fillup.totalCost;
  let computedTotal = false;

  if (totalCost === null || totalCost === undefined || totalCost === '' || isNaN(Number(totalCost))) {
    if (!isNaN(liters) && !isNaN(pricePerLiter) && liters > 0 && pricePerLiter >= 0) {
      totalCost = liters * pricePerLiter;
      // Round to 2 decimal places for currency
      totalCost = Math.round(totalCost * 100) / 100;
      computedTotal = true;
    } else {
      return { normalized: null, skipped: true, reason: 'unable to compute totalCost' };
    }
  } else {
    totalCost = Number(totalCost);
  }

  // CRITICAL FIX: Preserve original fill-up date
  // Priority order for date source:
  // 1. fillup.date (explicit date field in YYYY-MM-DD format)
  // 2. fillup.timestamp (legacy timestamp field - extract date portion)
  // 3. fillup.createdAt (record creation time - extract date portion as fallback)
  // 4. Only as absolute last resort: reject the record if no date can be determined
  let normalizedDate = null;
  if (fillup.date) {
    // Use explicit date field if present
    normalizedDate = fillup.date;
  } else if (fillup.timestamp || fillup.createdAt) {
    // 2 & 3. Fallback to timestamp or createdAt, converting them to YYYY-MM-DD
    const rawTarget = fillup.timestamp || fillup.createdAt;
    
    // Handle both numeric UNIX timestamps and ISO strings safely
    const parsedDate = new Date(isNaN(Number(rawTarget)) ? rawTarget : Number(rawTarget));
    
    if (!isNaN(parsedDate.getTime())) {
      // Formats safely to YYYY-MM-DD
      normalizedDate = parsedDate.toISOString().split('T')[0];
    }
  }

  // Validate the extracted date is in correct format
  if (!normalizedDate || !/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    console.error(`[Sync][fillup] Fillup ${id}: CRITICAL - Invalid date format: ${normalizedDate}. Rejecting record.`);
    return { normalized: null, skipped: true, reason: `invalid date format: ${normalizedDate}` };
  }

  // Build normalized payload
  const normalized = {
    id: fillup.id,
    user_id: null, // Will be set by caller
    vehicle_id: newVehicleId,
    date: normalizedDate,
    odometer: odometer,
    liters: liters,
    price_per_liter: pricePerLiter,
    total_cost: totalCost,
    station: fillup.station || null,
    notes: fillup.notes || null,
    full_tank: fillup.fullTank !== undefined ? fillup.fullTank : true,
    created_at: fillup.createdAt || new Date().toISOString()
  };


  return { normalized, skipped: false, reason: null, computedTotal };
}

/**
 * Remap legacy IDs to UUIDs for upload
 * @param {Array} vehicles - Vehicle records
 * @param {Array} fillups - Fillup records
 * @param {Array} maintenance - Maintenance records
 * @param {Array} tripEstimates - Trip estimate records
 * @returns {Object} Remapped data and mapping summary
 */
function remapLegacyIds(vehicles, fillups, maintenance, tripEstimates) {
  console.log('[Sync][uuid] Starting UUID remapping');
  
  // Test: Verify general UUID validation accepts non-v4 UUIDs
  console.log('[Sync][uuid] Test: UUID v1 "00000000-0000-1000-8000-000000000000" valid:', isValidUuid('00000000-0000-1000-8000-000000000000'));
  console.log('[Sync][uuid] Test: UUID v4 "550e8400-e29b-41d4-a716-446655440000" valid:', isValidUuid('550e8400-e29b-41d4-a716-446655440000'));
  console.log('[Sync][uuid] Test: Legacy ID "default" valid:', isValidUuid('default'));
  
  const vehicleIdMap = new Map();
  const fillupIdMap = new Map();
  const maintenanceIdMap = new Map();
  const tripIdMap = new Map();
  
  let preservedVehicleUuids = 0;
  let regeneratedVehicleIds = 0;
  let preservedFillupUuids = 0;
  let regeneratedFillupIds = 0;
  let preservedMaintenanceUuids = 0;
  let regeneratedMaintenanceIds = 0;
  let preservedTripUuids = 0;
  let regeneratedTripIds = 0;
  let remappedForeignKeys = 0;
  
  // Remap vehicle IDs
  const remappedVehicles = vehicles.map(vehicle => {
    const oldId = vehicle.id;
    if (isValidUuid(oldId)) {
      preservedVehicleUuids++;
      console.log(`[Sync][uuid] Vehicle ID preserved: ${oldId}`);
      return vehicle;
    } else {
      const newId = uuidv4();
      regeneratedVehicleIds++;
      vehicleIdMap.set(oldId, newId);
      console.log(`[Sync][uuid] Vehicle ID remapped from "${oldId}" to "${newId}"`);
      return { ...vehicle, id: newId };
    }
  });
  
  // Remap fillup IDs and vehicle references
  const remappedFillups = fillups.map(fillup => {
    const oldId = fillup.id;
    let newId = oldId;
    
    // Remap fillup ID if invalid
    if (!isValidUuid(oldId)) {
      newId = uuidv4();
      regeneratedFillupIds++;
      fillupIdMap.set(oldId, newId);
      console.log(`[Sync][uuid] Fillup ID remapped from "${oldId}" to "${newId}"`);
    } else {
      preservedFillupUuids++;
    }
    
    // Remap vehicleId reference if needed
    const oldVehicleId = fillup.vehicleId;
    if (vehicleIdMap.has(oldVehicleId)) {
      const newVehicleId = vehicleIdMap.get(oldVehicleId);
      remappedForeignKeys++;
      console.log(`[Sync][uuid] Fillup vehicleId remapped from "${oldVehicleId}" to "${newVehicleId}"`);
      return { ...fillup, id: newId, vehicleId: newVehicleId };
    }
    
    return { ...fillup, id: newId };
  });
  
  // Remap maintenance IDs and vehicle references
  const remappedMaintenance = maintenance.map(entry => {
    // Use case-agnostic properties to ensure compatibility
    const oldId = entry.id || entry.idx;
    let newId = oldId;
    
    // Remap maintenance ID if invalid
    if (!isValidUuid(oldId)) {
      newId = uuidv4();
      regeneratedMaintenanceIds++;
      maintenanceIdMap.set(oldId, newId);
      console.log(`[Sync][uuid] Maintenance ID remapped from "${oldId}" to "${newId}"`);
    } else {
      preservedMaintenanceUuids++;
    }
    
    // Extract vehicle reference defensively checking both camelCase and snake_case
    const oldVehicleId = entry.vehicleId || entry.vehicle_id;
    let vehicleIdToAssign = oldVehicleId;

    if (vehicleIdMap.has(oldVehicleId)) {
      vehicleIdToAssign = vehicleIdMap.get(oldVehicleId);
      remappedForeignKeys++;
      console.log(`[Sync][uuid] Maintenance vehicleId remapped from "${oldVehicleId}" to "${vehicleIdToAssign}"`);
    }
    
    // Return the complete object matching both paradigms to survive downstream operations safely
    return {
      ...entry,
      id: newId,
      idx: entry.idx !== undefined ? entry.idx : newId,
      
      // Assign mapped values to both casing properties so subsequent components don't read undefined
      vehicleId: vehicleIdToAssign,
      vehicle_id: vehicleIdToAssign,
      
      stableKey: entry.stableKey || entry.stable_key || newId,
      stable_key: entry.stableKey || entry.stable_key || newId,
      
      // Ensure numbers don't inadvertently cast to strings or drop out
      cost: entry.cost !== undefined && entry.cost !== null ? Number(entry.cost) : null,
      odometer: entry.odometer !== undefined && entry.odometer !== null ? Number(entry.odometer) : null,
      distance: entry.distance !== undefined && entry.distance !== null ? Number(entry.distance) : null,
      safety: entry.safety !== undefined && entry.safety !== null ? Number(entry.safety) : null,
      
      // Explicitly pass descriptions/notes along
      notes: entry.notes || entry.description || null,
      description: entry.description || entry.notes || null,
      
      nextDueDate: entry.nextDueDate || entry.next_due_date || null,
      next_due_date: entry.nextDueDate || entry.next_due_date || null,
      nextDueOdometer: entry.nextDueOdometer || entry.next_due_odometer || null,
      next_due_odometer: entry.nextDueOdometer || entry.next_due_odometer || null
    };
  });
  
  // Remap trip estimate IDs and vehicle references
  const remappedTripEstimates = tripEstimates.map(estimate => {
    const oldId = estimate.id;
    let newId = oldId;
    
    // Remap trip ID if invalid
    if (!isValidUuid(oldId)) {
      newId = uuidv4();
      regeneratedTripIds++;
      tripIdMap.set(oldId, newId);
      console.log(`[Sync][uuid] Trip estimate ID remapped from "${oldId}" to "${newId}"`);
    } else {
      preservedTripUuids++;
    }
    
    // Remap vehicleId reference if needed
    const oldVehicleId = estimate.vehicleId;
    if (vehicleIdMap.has(oldVehicleId)) {
      const newVehicleId = vehicleIdMap.get(oldVehicleId);
      remappedForeignKeys++;
      console.log(`[Sync][uuid] Trip estimate vehicleId remapped from "${oldVehicleId}" to "${newVehicleId}"`);
      return { ...estimate, id: newId, vehicleId: newVehicleId };
    }
    
    return { ...estimate, id: newId };
  });
  
  const summary = {
    preservedUuids: preservedVehicleUuids + preservedFillupUuids + preservedMaintenanceUuids + preservedTripUuids,
    regeneratedIds: regeneratedVehicleIds + regeneratedFillupIds + regeneratedMaintenanceIds + regeneratedTripIds,
    remappedForeignKeys,
    details: {
      vehicles: { preserved: preservedVehicleUuids, regenerated: regeneratedVehicleIds },
      fillups: { preserved: preservedFillupUuids, regenerated: regeneratedFillupIds },
      maintenance: { preserved: preservedMaintenanceUuids, regenerated: regeneratedMaintenanceIds },
      trips: { preserved: preservedTripUuids, regenerated: regeneratedTripIds }
    }
  };
  
  console.log('[Sync][uuid] UUID remapping summary:', summary);
  
  return {
    vehicles: remappedVehicles,
    fillups: remappedFillups,
    maintenance: remappedMaintenance,
    tripEstimates: remappedTripEstimates,
    summary
  };
}

export const cloudSyncService = {
  async uploadAppSettings(userId) {
    const settings = collectAppSettingsForCloud();
    if (Object.keys(settings).length === 0) return { success: true, count: 0 };

    const { data: existing, error: fetchError } = await supabase
      .from('app_settings')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) throw fetchError;

    const { error } = await supabase.from('app_settings').upsert({
      id: existing?.id || uuidv4(),
      user_id: userId,
      settings_json: settings,
      updated_at: new Date().toISOString()
    });

    if (error) throw error;
    return { success: true, count: Object.keys(settings).length };
  },

  /**
   * Validate if a string is a valid UUID (any version)
   * Service method wrapper for the standalone isValidUuid function
   * @param {string} value - Value to validate
   * @returns {boolean} True if valid UUID (any version)
   */
  isValidUuid(value) {
    return isValidUuid(value);
  },

  /**
   * Check if user is online
   */
  isOnline() {
    return navigator.onLine;
  },

  /**
   * Get the current user ID from Supabase
   */
  async getUserId() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      return user?.id || null;
    } catch {
      return null;
    }
  },

  /**
   * Check if local data exists
   */
  hasLocalData() {
    const vehicles = JSON.parse(localStorage.getItem('fueltracker-vehicles-v2') || '[]').filter(v => !v.deletedAt && !v.deleted_at);
    const fillups = JSON.parse(localStorage.getItem('fueltracker-fillups-v2') || '[]').filter(f => !f.deletedAt && !f.deleted_at);
    const maintenance = JSON.parse(localStorage.getItem('fueltracker-maintenance-entries-v3') || '[]').filter(m => !m.deletedAt && !m.deleted_at);
    const tripEstimates = JSON.parse(localStorage.getItem('fueltracker-trip-estimates-v2') || '[]').filter(t => !t.deletedAt && !t.deleted_at);
    
    return {
      hasData: vehicles.length > 0 || fillups.length > 0 || maintenance.length > 0 || tripEstimates.length > 0,
      counts: {
        vehicles: vehicles.length,
        fillups: fillups.length,
        maintenance: maintenance.length,
        tripEstimates: tripEstimates.length
      }
    };
  },

  /**
   * Get local data summary
   */
  getLocalDataSummary() {
    const vehicles = JSON.parse(localStorage.getItem('fueltracker-vehicles-v2') || '[]').filter(v => !v.deletedAt && !v.deleted_at);
    const fillups = JSON.parse(localStorage.getItem('fueltracker-fillups-v2') || '[]').filter(f => !f.deletedAt && !f.deleted_at);
    const maintenance = JSON.parse(localStorage.getItem('fueltracker-maintenance-entries-v3') || '[]').filter(m => !m.deletedAt && !m.deleted_at);
    const tripEstimates = JSON.parse(localStorage.getItem('fueltracker-trip-estimates-v2') || '[]').filter(t => !t.deletedAt && !t.deleted_at);
    
    console.log('[Sync][getLocalDataSummary] Local counts - vehicles:', vehicles.length, 'fillups:', fillups.length, 'maintenance:', maintenance.length, 'trips:', tripEstimates.length);
    
    return {
      hasLocalData: vehicles.length > 0 || fillups.length > 0 || maintenance.length > 0 || tripEstimates.length > 0,
      localCounts: {
        vehicles: vehicles.length,
        fillups: fillups.length,
        maintenance: maintenance.length,
        tripEstimates: tripEstimates.length
      }
    };
  },

  /**
   * Get cloud data summary for a user
   */
  async getCloudDataSummary(userId) {
    try {
      console.log('[Sync][getCloudDataSummary] Fetching cloud data summary for userId:', userId);
      
      const [vehiclesResult, fillupsResult, maintenanceResult, tripEstimatesResult] = await Promise.all([
        supabase.from('vehicles').select('id').eq('user_id', userId).is('deleted_at', null),
        supabase.from('fillups').select('id').eq('user_id', userId).is('deleted_at', null),
        supabase.from('maintenance').select('id').eq('user_id', userId).is('deleted_at', null),
        supabase.from('trip_estimates').select('id').eq('user_id', userId).is('deleted_at', null)
      ]);

      const vehicles = vehiclesResult.data || [];
      const fillups = fillupsResult.data || [];
      const maintenance = maintenanceResult.data || [];
      const tripEstimates = tripEstimatesResult.data || [];


      return {
        hasCloudData: vehicles.length > 0 || fillups.length > 0 || maintenance.length > 0 || tripEstimates.length > 0,
        cloudCounts: {
          vehicles: vehicles.length,
          fillups: fillups.length,
          maintenance: maintenance.length,
          tripEstimates: tripEstimates.length
        }
      };
    } catch {
      return {
        hasCloudData: false,
        cloudCounts: {
          vehicles: 0,
          fillups: 0,
          maintenance: 0,
          tripEstimates: 0
        }
      };
    }
  },

  /**
   * Get sync status (both local and cloud)
   */
  async getSyncStatus(userId) {
    const localSummary = this.getLocalDataSummary();
    const cloudSummary = await this.getCloudDataSummary(userId);
    const detailedDiff = await this.getDetailedSyncDiff(userId);
    
    return {
      ...localSummary,
      ...cloudSummary,
      detailedDiff,
      taxonomyDirty: hasDirtyMaintenanceTaxonomy()
    };
  },

  async resolveActiveCloudVehicleId(userId, vehicleIdMap = new Map()) {
    const selectedVehicleId = getSelectedVehicleLocalId();
    if (!selectedVehicleId) return null;
    if (vehicleIdMap.has(selectedVehicleId)) return vehicleIdMap.get(selectedVehicleId);
    if (this.isValidUuid(selectedVehicleId)) return selectedVehicleId;

    const localVehicles = JSON.parse(localStorage.getItem('fueltracker-vehicles-v2') || '[]');
    const activeVehicle = localVehicles.find((vehicle) => vehicle.id === selectedVehicleId);
    if (!activeVehicle?.stableKey && !activeVehicle?.stable_key) return null;

    const { data, error } = await supabase
      .from('vehicles')
      .select('id')
      .eq('user_id', userId)
      .eq('stable_key', activeVehicle.stableKey || activeVehicle.stable_key)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw error;
    return data?.id || null;
  },

  async resolveAllCloudVehicleIds(userId, vehicleIdMap = new Map()) {
    const localVehicles = JSON.parse(localStorage.getItem('fueltracker-vehicles-v2') || '[]')
      .filter((vehicle) => !vehicle.deletedAt && !vehicle.deleted_at);
    const cloudVehicleIds = new Set();

    localVehicles.forEach((vehicle) => {
      const mappedId = vehicleIdMap.get(vehicle.id);
      if (mappedId) cloudVehicleIds.add(mappedId);
      else if (this.isValidUuid(vehicle.id)) cloudVehicleIds.add(vehicle.id);
    });

    const stableKeys = localVehicles
      .map((vehicle) => vehicle.stableKey || vehicle.stable_key)
      .filter(Boolean);

    if (stableKeys.length > 0) {
      const { data, error } = await supabase
        .from('vehicles')
        .select('id, stable_key')
        .eq('user_id', userId)
        .in('stable_key', stableKeys)
        .is('deleted_at', null);

      if (error) throw error;
      (data || []).forEach((vehicle) => cloudVehicleIds.add(vehicle.id));
    }

    if (cloudVehicleIds.size === 0) {
      const { data, error } = await supabase
        .from('vehicles')
        .select('id')
        .eq('user_id', userId)
        .is('deleted_at', null);

      if (error) throw error;
      (data || []).forEach((vehicle) => cloudVehicleIds.add(vehicle.id));
    }

    return Array.from(cloudVehicleIds);
  },

  async upsertMaintenanceTaxonomyRecord(table, payload) {
    const selectColumns = table === 'maintenance_systems'
      ? '*'
      : '*';

    const { data: stableMatch, error: stableFetchError } = await supabase
      .from(table)
      .select(selectColumns)
      .eq('user_id', payload.user_id)
      .eq('vehicle_id', payload.vehicle_id)
      .eq('stable_key', payload.stable_key)
      .maybeSingle();

    if (stableFetchError) throw stableFetchError;

    if (stableMatch) {
      if (taxonomyPayloadMatchesCloud(payload, stableMatch)) return { action: 'skipped' };
      const { error: updateError } = await supabase
        .from(table)
        .update(payload)
        .eq('id', stableMatch.id);
      if (updateError) throw updateError;
      return { action: 'updated' };
    }

    let typeQuery = supabase
      .from(table)
      .select(selectColumns)
      .eq('user_id', payload.user_id)
      .eq('vehicle_id', payload.vehicle_id)
      .eq('type_key', payload.type_key);

    if (table === 'maintenance_subcategories') {
      typeQuery = payload.system_stable_key
        ? typeQuery.eq('system_stable_key', payload.system_stable_key)
        : typeQuery.is('system_stable_key', null);
    }

    const { data: typeMatch, error: typeFetchError } = await typeQuery.maybeSingle();

    if (typeFetchError) throw typeFetchError;

    if (typeMatch) {
      if (taxonomyPayloadMatchesCloud(payload, typeMatch)) return { action: 'skipped' };
      const { error: updateError } = await supabase
        .from(table)
        .update(payload)
        .eq('id', typeMatch.id);
      if (updateError) throw updateError;
      return { action: 'updated_by_type' };
    }

    const { data: migrated, error: migrateError } = await supabase
      .from(table)
      .update(payload)
      .eq('user_id', payload.user_id)
      .is('vehicle_id', null)
      .eq('stable_key', payload.stable_key)
      .select('stable_key');

    if (migrateError) throw migrateError;
    if (migrated && migrated.length > 0) return { action: 'migrated' };

    const { error: insertError } = await supabase.from(table).insert(payload);
    if (insertError) throw insertError;
    return { action: 'inserted' };
  },

  async uploadMaintenanceTaxonomy(userId, vehicleIdMap = new Map(), options = {}) {
    const result = {
      success: true,
      skipped: false,
      systems: 0,
      categories: 0,
      details: []
    };

    try {
      const { systems, categories, settings } = loadLocalMaintenanceTaxonomy();
      const activeLocalVehicleId = getSelectedVehicleLocalId();
      const taxonomyToSync = getMaintenanceTaxonomyForSync(systems, categories, settings, activeLocalVehicleId);
      if (!taxonomyToSync.hasCustomizations) {
        result.skipped = true;
        result.details.push('Maintenance taxonomy upload skipped: only default local taxonomy is present.');
        if (options.clearDirty !== false) clearDirtyMaintenanceTaxonomy();
        return result;
      }
      const activeCloudVehicleId = await this.resolveActiveCloudVehicleId(userId, vehicleIdMap);
      const cloudVehicleIds = activeCloudVehicleId ? [activeCloudVehicleId] : [];

      if (cloudVehicleIds.length === 0) {
        result.success = false;
        result.details.push('Maintenance taxonomy upload failed: no cloud vehicles could be mapped.');
        return result;
      }

      const systemByCategory = taxonomyToSync.systemByCategory;

      for (const cloudVehicleId of cloudVehicleIds) {
        for (const [index, system] of taxonomyToSync.systems.entries()) {
          const payload = mapLocalSystemToCloud(system, userId, cloudVehicleId, index);
          const { action } = await this.upsertMaintenanceTaxonomyRecord('maintenance_systems', payload);
          if (action !== 'skipped') result.systems += 1;
        }

        const { data: cloudSystems, error: cloudSystemsError } = await supabase
          .from('maintenance_systems')
          .select('id, stable_key')
          .eq('user_id', userId)
          .eq('vehicle_id', cloudVehicleId)
          .is('deleted_at', null);

        if (cloudSystemsError) throw cloudSystemsError;
        const cloudSystemIdByStableKey = new Map((cloudSystems || []).map((system) => [system.stable_key, system.id]));

        for (const [index, category] of taxonomyToSync.categories.entries()) {
          const categorySettings = settings?.categorySettings?.[category.id] || {};
          const parentSystem = systemByCategory.get(category.id);
          const parentStableKey = parentSystem ? getTaxonomyStableKey(parentSystem, 'system') : null;
          const payload = mapLocalCategoryToCloud(
            category,
            parentSystem,
            userId,
            cloudVehicleId,
            parentStableKey ? cloudSystemIdByStableKey.get(parentStableKey) || null : null,
            index,
            categorySettings
          );
          const { action } = await this.upsertMaintenanceTaxonomyRecord('maintenance_subcategories', payload);
          if (action !== 'skipped') result.categories += 1;
        }
      }

      if (result.systems > 0 || result.categories > 0) {
        result.details.push(`Maintenance taxonomy uploaded: ${result.systems} systems, ${result.categories} categories across ${cloudVehicleIds.length} vehicles`);
      } else {
        result.skipped = true;
        result.details.push('Maintenance taxonomy already matches the cloud.');
      }
      if (options.clearDirty !== false) clearDirtyMaintenanceTaxonomy();
      return result;
    } catch (error) {
      if (isMissingTaxonomyTableError(error)) {
        result.success = true;
        result.skipped = true;
        result.details.push('Maintenance taxonomy sync skipped: taxonomy tables are not installed yet.');
        return result;
      }

      result.success = false;
      result.details.push(`Maintenance taxonomy upload failed: ${error.message}`);
      return result;
    }
  },

  async downloadMaintenanceTaxonomy(userId, vehicleIdMap = new Map(), options = {}) {
    const result = {
      success: true,
      skipped: false,
      systems: 0,
      categories: 0,
      details: []
    };

    try {
      const cloudVehicleId = await this.resolveActiveCloudVehicleId(userId, vehicleIdMap);
      const cloudVehicleIds = cloudVehicleId ? [cloudVehicleId] : await this.resolveAllCloudVehicleIds(userId, vehicleIdMap);
      if (cloudVehicleIds.length === 0) return result;

      const { data: systems, error: systemsError } = await supabase
        .from('maintenance_systems')
        .select('*')
        .eq('user_id', userId)
        .in('vehicle_id', cloudVehicleIds)
        .order('sort_order', { ascending: true });

      if (systemsError) throw systemsError;

      const { data: categories, error: categoriesError } = await supabase
        .from('maintenance_subcategories')
        .select('*')
        .eq('user_id', userId)
        .in('vehicle_id', cloudVehicleIds)
        .order('sort_order', { ascending: true });

      if (categoriesError) throw categoriesError;

      if (!systems?.length && !categories?.length) return result;

      const preferActiveVehicle = (records) => {
        const byStableKey = new Map();
        (records || []).forEach((record) => {
          const key = record.stable_key || record.type_key || record.id;
          const existing = byStableKey.get(key);
          if (!existing || record.vehicle_id === cloudVehicleId) {
            byStableKey.set(key, record);
          }
        });
        return Array.from(byStableKey.values());
      };

      const preferredSystems = preferActiveVehicle(systems);
      const preferredCategories = preferActiveVehicle(categories);
      const {
        systems: localSystems,
        categories: localCategories,
        settings: localSettings
      } = mergeDownloadedMaintenanceTaxonomy(preferredSystems, preferredCategories);

      if (localSystems.length > 0) {
        localStorage.setItem(MAINTENANCE_SYSTEMS_KEY, JSON.stringify(localSystems));
        result.systems = preferredSystems.length;
      }

      if (localCategories.length > 0) {
        localStorage.setItem(MAINTENANCE_CATEGORIES_KEY, JSON.stringify(localCategories));
        localStorage.setItem(MAINTENANCE_SETTINGS_KEY, JSON.stringify(localSettings));
        result.categories = preferredCategories.length;
      }

      window.dispatchEvent(new CustomEvent('local-data-changed', { detail: { entityKey: 'maintenance-taxonomy' } }));
      window.dispatchEvent(new Event('fueltracker-local-storage-refresh'));
      result.details.push(`Maintenance taxonomy downloaded: ${result.systems} systems, ${result.categories} categories from ${cloudVehicleIds.length} vehicles`);
      if (options.clearDirty !== false) clearDirtyMaintenanceTaxonomy();
      return result;
    } catch (error) {
      if (isMissingTaxonomyTableError(error)) {
        result.success = true;
        result.skipped = true;
        result.details.push('Maintenance taxonomy download skipped: taxonomy tables are not installed yet.');
        return result;
      }

      result.success = false;
      result.details.push(`Maintenance taxonomy download failed: ${error.message}`);
      return result;
    }
  },

  async buildLocalMaintenanceTaxonomyPayloads(userId, vehicleIdMap = new Map()) {
    const { systems, categories, settings } = loadLocalMaintenanceTaxonomy();
    const activeLocalVehicleId = getSelectedVehicleLocalId();
    const taxonomyToSync = getMaintenanceTaxonomyForSync(systems, categories, settings, activeLocalVehicleId);
    if (!taxonomyToSync.hasCustomizations) {
      return { systemPayloads: [], categoryPayloads: [], cloudVehicleIds: [] };
    }
    const activeCloudVehicleId = await this.resolveActiveCloudVehicleId(userId, vehicleIdMap);
    const cloudVehicleIds = activeCloudVehicleId ? [activeCloudVehicleId] : [];
    const systemByCategory = taxonomyToSync.systemByCategory;

    const systemPayloads = [];
    const categoryPayloads = [];

    cloudVehicleIds.forEach((cloudVehicleId) => {
      taxonomyToSync.systems.forEach((system, index) => {
        systemPayloads.push(mapLocalSystemToCloud(system, userId, cloudVehicleId, index));
      });

      taxonomyToSync.categories.forEach((category, index) => {
        const categorySettings = settings?.categorySettings?.[category.id] || {};
        const parentSystem = systemByCategory.get(category.id);
        categoryPayloads.push(mapLocalCategoryToCloud(
          category,
          parentSystem,
          userId,
          cloudVehicleId,
          null,
          index,
          categorySettings
        ));
      });
    });

    return { systemPayloads, categoryPayloads, cloudVehicleIds };
  },

  async getMaintenanceTaxonomyDiff(userId) {
    const diff = {
      localOnly: [],
      cloudOnly: [],
      bothChanged: [],
      localDeleted: [],
      cloudDeleted: [],
      identical: []
    };

    try {
      const vehicleIdMap = await this.buildVehicleIdMap(userId);
      const { systemPayloads, categoryPayloads, cloudVehicleIds } =
        await this.buildLocalMaintenanceTaxonomyPayloads(userId, vehicleIdMap);

      if (cloudVehicleIds.length === 0 || (systemPayloads.length === 0 && categoryPayloads.length === 0)) return diff;

      const { data: cloudSystems, error: systemsError } = await supabase
        .from('maintenance_systems')
        .select('*')
        .eq('user_id', userId)
        .in('vehicle_id', cloudVehicleIds);

      if (systemsError) throw systemsError;

      const { data: cloudCategories, error: categoriesError } = await supabase
        .from('maintenance_subcategories')
        .select('*')
        .eq('user_id', userId)
        .in('vehicle_id', cloudVehicleIds);

      if (categoriesError) throw categoriesError;

      const compareTaxonomy = (localPayloads, cloudRecords, tableName) => {
        const cloudByStableKey = new Map();
        const cloudByTypeKey = new Map();
        const matchedCloudIds = new Set();

        (cloudRecords || []).forEach((record) => {
          const stableKey = `${record.vehicle_id}:${record.stable_key}`;
          const typeKey = tableName === 'maintenance_subcategories'
            ? `${record.vehicle_id}:${record.system_stable_key || ''}:${record.type_key}`
            : `${record.vehicle_id}:${record.type_key}`;
          cloudByStableKey.set(stableKey, record);
          cloudByTypeKey.set(typeKey, record);
        });

        localPayloads.forEach((payload) => {
          const stableKey = `${payload.vehicle_id}:${payload.stable_key}`;
          const typeKey = tableName === 'maintenance_subcategories'
            ? `${payload.vehicle_id}:${payload.system_stable_key || ''}:${payload.type_key}`
            : `${payload.vehicle_id}:${payload.type_key}`;
          const cloudRecord = cloudByStableKey.get(stableKey) || cloudByTypeKey.get(typeKey);

          if (!cloudRecord) {
            const target = payload.deleted_at ? diff.localDeleted : diff.localOnly;
            target.push({ ...payload, entityType: tableName });
            return;
          }

          matchedCloudIds.add(cloudRecord.id);
          if (taxonomyPayloadMatchesCloud(payload, cloudRecord)) {
            diff.identical.push({ local: payload, cloud: cloudRecord });
          } else {
            diff.bothChanged.push({
              local: payload,
              cloud: cloudRecord,
              winner: 'local',
              entityType: tableName
            });
          }
        });

        (cloudRecords || []).forEach((record) => {
          if (!matchedCloudIds.has(record.id)) {
            const target = record.deleted_at ? diff.cloudDeleted : diff.cloudOnly;
            target.push({ ...record, entityType: tableName });
          }
        });
      };

      compareTaxonomy(systemPayloads, cloudSystems || [], 'maintenance_systems');
      compareTaxonomy(categoryPayloads, cloudCategories || [], 'maintenance_subcategories');

      return diff;
    } catch (error) {
      if (isMissingTaxonomyTableError(error)) return diff;
      throw error;
    }
  },

  /**
   * Upload local data to cloud
   * @param {string} userId - User ID
   * @param {Object} options - Options object
   * @param {boolean} options.silent - If true, no modal or success messages (for background sync)
   */
  async uploadLocalDataToCloud(userId, options = {}) {
    const result = {
      success: false,
      action: 'upload',
      message: '',
      details: [],
      counts: {
        vehicles: 0,
        fillups: 0,
        maintenance: 0,
        tripEstimates: 0,
        maintenanceTaxonomy: 0
      },
      uuidSummary: null,
      totalUploaded: 0
    };

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        result.message = 'Not authenticated';
        result.details.push('User authentication check failed');
        return result;
      }

      result.details.push(`Authenticated as user: ${userId}`);

      // Load ALL records (including soft-deleted) for tombstone sync purposes
      const allVehicles = JSON.parse(localStorage.getItem('fueltracker-vehicles-v2') || '[]');
      const allFillups = JSON.parse(localStorage.getItem('fueltracker-fillups-v2') || '[]');
      const allMaintenance = JSON.parse(localStorage.getItem('fueltracker-maintenance-entries-v3') || '[]');
      const allTripEstimates = JSON.parse(localStorage.getItem('fueltracker-trip-estimates-v2') || '[]');

      // Backfill stable keys on ALL records so tombstones are preserved.
      const allVehiclesWithStableKeys = backfillStableKeys(allVehicles);
      const allFillupsWithStableKeys = backfillStableKeysForFillups(allFillups);
      const allMaintenanceWithStableKeys = backfillStableKeysForMaintenance(allMaintenance);
      const { usable: validMaintenanceRecords, hollow: hollowMaintenanceRecords } = splitHollowMaintenanceRecords(allMaintenanceWithStableKeys);
      const allMaintenanceForSync = hollowMaintenanceRecords.length > 0
        ? tombstoneLocalMaintenanceRecords(hollowMaintenanceRecords)
        : allMaintenanceWithStableKeys;

      // Only upload ACTIVE records (exclude soft-deleted tombstones)
      const vehicles = allVehiclesWithStableKeys.filter(v => !v.deletedAt && !v.deleted_at && v.lastAction !== 'DELETE');
      const fillups = allFillupsWithStableKeys.filter(f => !f.deletedAt && !f.deleted_at && f.lastAction !== 'DELETE');
      const maintenance = validMaintenanceRecords.filter(m => !m.deletedAt && !m.deleted_at && m.lastAction !== 'DELETE');
      const tripEstimates = allTripEstimates.filter(t => !t.deletedAt && !t.deleted_at && t.lastAction !== 'DELETE');

      result.details.push(`Local records found: ${vehicles.length} vehicles, ${fillups.length} fillups, ${maintenance.length} maintenance, ${tripEstimates.length} trips (${allVehicles.length - vehicles.length} deleted vehicles excluded)`);
      if (hollowMaintenanceRecords.length > 0) {
        result.details.push(`Ignored ${hollowMaintenanceRecords.length} hollow maintenance placeholder record(s) and marked them for cloud deletion.`);
      }

      const vehiclesWithStableKeys = vehicles;
      const fillupsWithStableKeys = fillups;
      const maintenanceWithStableKeys = maintenance;


      // Fetch existing cloud vehicles for deduplication (filter out deleted records)
      const { data: existingCloudVehicles } = await supabase.from('vehicles').select('*').eq('user_id', userId).is('deleted_at', null);
      const { data: existingFillups } = await supabase.from('fillups').select('*').eq('user_id', userId);
      // Fetch ALL maintenance records (including deleted) to check for stable_key conflicts
      const { data: existingMaintenance } = await supabase.from('maintenance').select('*').eq('user_id', userId);
      const { data: existingTripEstimates } = await supabase.from('trip_estimates').select('*').eq('user_id', userId).is('deleted_at', null);
      

      result.details.push(`Cloud records found: ${existingCloudVehicles?.length || 0} vehicles, ${existingFillups?.length || 0} fillups, ${existingMaintenance?.length || 0} maintenance, ${existingTripEstimates?.length || 0} trips`);


      // Match local vehicles to cloud vehicles BEFORE remapping (using original IDs)
      const { matches } = matchVehicles(vehiclesWithStableKeys, existingCloudVehicles || []);
      

      if (matches.size === 0 && vehiclesWithStableKeys.length > 0 && existingCloudVehicles?.length > 0) {
        
        // Try fingerprint matching as fallback with normalization
        for (const localVehicle of vehiclesWithStableKeys) {
          const normalizedLocal = normalizeVehicleForMatch(localVehicle, 'local');
          const localFingerprint = generateVehicleFingerprint(normalizedLocal);
          
          for (const cloudVehicle of existingCloudVehicles) {
            const normalizedCloud = normalizeVehicleForMatch(cloudVehicle, 'cloud');
            const cloudFingerprint = generateVehicleFingerprint(normalizedCloud);
            
            if (localFingerprint === cloudFingerprint) {
              matches.set(localVehicle.id, cloudVehicle.id);
              break;
            }
          }
        }
        
        
        if (matches.size === 0) {
          result.success = false;
          result.message = 'Upload aborted: Vehicle matching failed. This may indicate data corruption or schema mismatch.';
          result.details.push('Matching failed: No vehicles could be matched between local and cloud data.');
          result.details.push('Upload was aborted to prevent duplicate data creation.');
          result.details.push(`Local vehicles: ${vehiclesWithStableKeys.length}, Cloud vehicles: ${existingCloudVehicles.length}`);
          return result;
        }
      }

      // Remap legacy IDs to UUIDs AFTER matching (preserve matched cloud IDs)
      const { vehicles: remappedVehicles, fillups: remappedFillups, maintenance: remappedMaintenance, tripEstimates: remappedTripEstimates, summary } = remapLegacyIds(vehiclesWithStableKeys, fillupsWithStableKeys, maintenanceWithStableKeys, tripEstimates);
      result.uuidSummary = summary;
      result.details.push(`UUID remapping: ${summary.preservedUuids} preserved, ${summary.regeneratedIds} regenerated, ${summary.remappedForeignKeys} foreign keys remapped`);

      // Build mapping from remapped local IDs to cloud IDs for upload
      const remappedToCloudIdMap = new Map();
      vehicles.forEach((originalVehicle, idx) => {
        const originalId = originalVehicle.id;
        const remappedId = remappedVehicles[idx].id;
        const cloudId = matches.get(originalId);
        if (cloudId) {
          remappedToCloudIdMap.set(remappedId, cloudId);
        }
      });

      // Detect if there are any changes to upload
      const localDataSummary = {
        vehicles: vehiclesWithStableKeys,
        fillups: fillupsWithStableKeys,
        maintenance: remappedMaintenance,
        tripEstimates: remappedTripEstimates
      };
      
      // Filter out deleted records from cloud data for change detection
      const cloudDataSummary = {
        vehicles: existingCloudVehicles || [],
        fillups: existingFillups || [],
        maintenance: existingMaintenance || [],
        tripEstimates: existingTripEstimates || []
      };

      // Sync tombstones to cloud before uploading new/updated records or
      // deciding that active records are already in sync.
      const vehicleTombstoneSync = await syncTombstonesToCloud(userId, allVehiclesWithStableKeys, 'vehicles');
      const fillupTombstoneSync = await syncTombstonesToCloud(userId, allFillupsWithStableKeys, 'fillups');
      const maintenanceTombstoneSync = await syncTombstonesToCloud(userId, allMaintenanceForSync, 'maintenance');
      const tripTombstoneSync = await syncTombstonesToCloud(userId, allTripEstimates, 'trip_estimates');
      const tombstonesSynced =
        vehicleTombstoneSync.synced +
        fillupTombstoneSync.synced +
        maintenanceTombstoneSync.synced +
        tripTombstoneSync.synced;

      result.details.push(`Tombstone sync: ${vehicleTombstoneSync.synced} vehicles, ${fillupTombstoneSync.synced} fillups, ${maintenanceTombstoneSync.synced} maintenance, ${tripTombstoneSync.synced} trips`);

      const changeDetection = detectChanges(localDataSummary, cloudDataSummary);
      
      if (!changeDetection.hasChanges) {
        const shouldSyncDirtyTaxonomy = hasDirtyMaintenanceTaxonomy();
        const taxonomyUpload = options.silent && !shouldSyncDirtyTaxonomy
          ? { success: true, skipped: true, systems: 0, categories: 0, details: ['Maintenance taxonomy upload skipped during background sync.'] }
          : await this.uploadMaintenanceTaxonomy(userId, await this.buildVehicleIdMap(userId), { clearDirty: true });
        result.details.push(...taxonomyUpload.details);
        const taxonomyRecords = (taxonomyUpload.systems || 0) + (taxonomyUpload.categories || 0);
        result.counts.maintenanceTaxonomy = taxonomyRecords;
        result.totalUploaded = taxonomyRecords;
        result.success = taxonomyUpload.success !== false;
        result.message = taxonomyUpload.success === false
          ? 'Upload partially failed. Maintenance taxonomy could not be synced.'
          : taxonomyRecords > 0
          ? `Upload complete. ${taxonomyRecords} maintenance taxonomy record${taxonomyRecords !== 1 ? 's' : ''} saved to your cloud account.`
          : tombstonesSynced > 0
          ? 'Deleted records synced. Cloud is up to date.'
          : 'Nothing to upload. Cloud is already up to date.';
        if (taxonomyUpload.success !== false) {
          result.details.push(tombstonesSynced > 0
            ? `Synced ${tombstonesSynced} deleted records`
            : 'No new or changed records detected');
        }
        return result;
      }

      let vehicleErrors = 0;
      let fillupErrors = 0;
      let fillupSkipped = 0;
      let fillupSkippedById = 0;
      let fillupSkippedByStableKey = 0;
      let fillupSkippedByFallback = 0;
      let fillupComputedTotal = 0;
      let maintenanceErrors = 0;
      let taxonomyErrors = 0;
      let tripErrors = 0;
      let vehicleUpdates = 0;
      let vehicleInserts = 0;
      let vehicleSkipped = 0;

      // Build vehicle ID map for fillup normalization (use matched cloud IDs)
      const vehicleIdMap = new Map();
      remappedToCloudIdMap.forEach((cloudId, remappedLocalId) => {
        vehicleIdMap.set(remappedLocalId, cloudId);
      });
      

      // Upload vehicles with deduplication
      for (const remappedVehicle of remappedVehicles) {
        const matchedCloudId = remappedToCloudIdMap.get(remappedVehicle.id);
        
        if (matchedCloudId) {
          
          // Fetch current cloud vehicle to compare fields
          const { data: cloudVehicle, error: fetchError } = await supabase
            .from('vehicles')
            .select('*')
            .eq('id', matchedCloudId)
            .single();
          
          if (fetchError) {
            vehicleErrors++;
            result.details.push(`Vehicle fetch failed (${remappedVehicle.id}): ${fetchError.message}`);
            continue;
          }
          
          // Compare persisted fields
          const hasChanges = 
            remappedVehicle.name !== cloudVehicle.name ||
            (remappedVehicle.make || null) !== cloudVehicle.make ||
            (remappedVehicle.model || null) !== cloudVehicle.model ||
            (remappedVehicle.year || null) !== cloudVehicle.year ||
            (remappedVehicle.fuelType || null) !== cloudVehicle.fuel_type ||
            (remappedVehicle.tankCapacity || null) !== cloudVehicle.tank_capacity ||
            (remappedVehicle.licensePlate || null) !== cloudVehicle.license_plate ||
            (remappedVehicle.tyreSize?.width || null) !== cloudVehicle.tyre_width ||
            (remappedVehicle.tyreSize?.aspectRatio || null) !== cloudVehicle.tyre_ratio ||
            (remappedVehicle.tyreSize?.rimSize || null) !== cloudVehicle.tyre_rim ||
            remappedVehicle.stableKey !== cloudVehicle.stable_key;
          
          if (!hasChanges) {
            vehicleSkipped++;
            continue;
          }
          
          // Update vehicle with changes
          const { error } = await supabase.from('vehicles').update({
            name: remappedVehicle.name,
            make: remappedVehicle.make || null,
            model: remappedVehicle.model || null,
            year: remappedVehicle.year || null,
            fuel_type: remappedVehicle.fuelType || null,
            tank_capacity: remappedVehicle.tankCapacity || null,
            license_plate: remappedVehicle.licensePlate || null,
            tyre_width: remappedVehicle.tyreSize?.width || null,
            tyre_ratio: remappedVehicle.tyreSize?.aspectRatio || null,
            tyre_rim: remappedVehicle.tyreSize?.rimSize || null,
            stable_key: remappedVehicle.stableKey
          }).eq('id', matchedCloudId);
          
          if (error) {
            vehicleErrors++;
            result.details.push(`Vehicle update failed (${remappedVehicle.id}): ${error.message} (code: ${error.code})`);
          } else {
            vehicleUpdates++;
            result.counts.vehicles++;
          }
        } else {
          // New vehicle - insert it
          const { error } = await supabase.from('vehicles').insert({
            id: remappedVehicle.id,
            user_id: userId,
            name: remappedVehicle.name,
            make: remappedVehicle.make || null,
            model: remappedVehicle.model || null,
            year: remappedVehicle.year || null,
            fuel_type: remappedVehicle.fuelType || null,
            tank_capacity: remappedVehicle.tankCapacity || null,
            license_plate: remappedVehicle.licensePlate || null,
            tyre_width: remappedVehicle.tyreSize?.width || null,
            tyre_ratio: remappedVehicle.tyreSize?.aspectRatio || null,
            tyre_rim: remappedVehicle.tyreSize?.rimSize || null,
            stable_key: remappedVehicle.stableKey,
            created_at: new Date().toISOString()
          });
          
          if (error) {
            vehicleErrors++;
            result.details.push(`Vehicle insert failed (${remappedVehicle.id}): ${error.message} (code: ${error.code})`);
            result.success = false;
            result.message = 'Upload aborted: Vehicle insert failed. This may indicate a schema mismatch.';
            result.details.push('Upload was aborted to prevent cascading foreign key errors.');
            return result;
          } else {
            vehicleInserts++;
            result.counts.vehicles++;
            
            vehicleIdMap.set(remappedVehicle.id, remappedVehicle.id);
            
          }
        }
      }

      const shouldSyncDirtyTaxonomy = hasDirtyMaintenanceTaxonomy();
      const taxonomyUpload = options.silent && !shouldSyncDirtyTaxonomy
        ? { success: true, skipped: true, systems: 0, categories: 0, details: ['Maintenance taxonomy upload skipped during background sync.'] }
        : await this.uploadMaintenanceTaxonomy(userId, vehicleIdMap, { clearDirty: true });
      result.details.push(...taxonomyUpload.details);
      taxonomyErrors = taxonomyUpload.success === false ? 1 : 0;
      result.counts.maintenanceTaxonomy = (taxonomyUpload.systems || 0) + (taxonomyUpload.categories || 0);

      try {
        const appSettingsUpload = await this.uploadAppSettings(userId);
        if (appSettingsUpload.count > 0) {
          result.details.push(`App settings backed up: ${appSettingsUpload.count} setting groups`);
        }
      } catch (error) {
        taxonomyErrors += 1;
        result.details.push(`App settings backup failed: ${error.message}`);
      }

      // Upload fillups with normalization and deduplication
      if (remappedFillups.length > 0) {
        const existingFillupIds = new Set(existingFillups?.map(f => f.id) || []);
        const existingFillupStableKeys = new Map(); // stable_key -> fillup
        existingFillups?.forEach(f => {
          if (f.stable_key) {
            existingFillupStableKeys.set(f.stable_key, f);
          }
        });
        
        for (const fillup of remappedFillups) {
          if (fillup.stableKey && existingFillupStableKeys.has(fillup.stableKey)) {
            fillupSkipped++;
            fillupSkippedByStableKey++;
            continue;
          }
          
          // Skip if fillup already exists in cloud (by ID)
          if (existingFillupIds.has(fillup.id)) {
            fillupSkipped++;
            fillupSkippedById++;
            continue;
          }
          
          const { normalized, skipped, reason, computedTotal } = normalizeFillupForCloud(fillup, vehicleIdMap);
          
          if (skipped) {
            fillupSkipped++;
            result.details.push(`Fillup skipped (${fillup.id}): ${reason}`);
            continue;
          }
          
          if (computedTotal) {
            fillupComputedTotal++;
          }
          
          // Fallback duplicate detection for historical bad data
          const duplicateCheck = detectDuplicateFillupByFields(normalized, existingFillups, userId);
          if (duplicateCheck.isDuplicate) {
            fillupSkipped++;
            fillupSkippedByFallback++;
            continue;
          }
          

          const { error } = await supabase.from('fillups').upsert({
            ...normalized,
            stable_key: fillup.stableKey,
            user_id: userId
          });
          if (error) {
            fillupErrors++;
            result.details.push(`Fillup upload failed (${fillup.id}): ${error.message} (code: ${error.code})`);
          } else {
            result.counts.fillups++;
          }
        }
        
        result.details.push(`Fillup deduplication: ${fillupSkippedByStableKey} skipped by stable_key, ${fillupSkippedById} skipped by ID, ${fillupSkippedByFallback} skipped by fallback detection`);
      }

      // Upload maintenance with deduplication
      if (remappedMaintenance.length > 0) {
        const { systems: localMaintenanceSystems, categories: localMaintenanceCategories } = loadLocalMaintenanceTaxonomy();
        const existingMaintenanceIds = new Set(existingMaintenance?.map(m => m.id) || []);
        const existingMaintenanceStableKeys = new Map();
        existingMaintenance?.forEach(m => {
          if (m.stable_key) {
            existingMaintenanceStableKeys.set(m.stable_key, m);
          }
        });

        for (const entry of remappedMaintenance) {
          let cloudIdToUse = entry.id;
          if (entry.stableKey && existingMaintenanceStableKeys.has(entry.stableKey)) {
            const existingMaintenanceRec = existingMaintenanceStableKeys.get(entry.stableKey);
            cloudIdToUse = existingMaintenanceRec.id;
          } else if (existingMaintenanceIds.has(entry.id)) {
            continue;
          }

          // --- CRITICAL DATE FIX FOR MAINTENANCE ---
          let normalizedMaintenanceDate = null;
          if (entry.date) {
            normalizedMaintenanceDate = entry.date;
          } else if (entry.timestamp || entry.createdAt) {
            const rawTarget = entry.timestamp || entry.createdAt;
            const parsedDate = new Date(isNaN(Number(rawTarget)) ? rawTarget : Number(rawTarget));
            if (!isNaN(parsedDate.getTime())) {
              normalizedMaintenanceDate = parsedDate.toISOString().split('T')[0];
            }
          }

          if (!normalizedMaintenanceDate) {
            maintenanceErrors++;
            console.error(`[Sync][maintenance] Entry ${entry.id} skipped: Missing/unparseable date context.`);
            result.details.push(`Maintenance upload failed (${entry.id}): missing or unparseable date`);
            continue;
          }

          // Validate date format alignment
          if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedMaintenanceDate)) {
            console.error(`[Sync][maintenance] Maintenance ${entry.id}: CRITICAL - Invalid date format: ${normalizedMaintenanceDate}`);
            maintenanceErrors++;
            result.details.push(`Maintenance upload failed (${entry.id}): invalid date format: ${normalizedMaintenanceDate}`);
            continue;
          }

          const mappedEntryVehicleId =
            remappedToCloudIdMap.get(entry.vehicleId) ||
            vehicleIdMap.get(entry.vehicleId) ||
            entry.vehicleId;
          const taxonomyMeta = getMaintenanceTaxonomyMetadata(entry, localMaintenanceSystems, localMaintenanceCategories);

          const payload = {
            id: cloudIdToUse,
            user_id: userId,
            vehicle_id: mappedEntryVehicleId,
            date: normalizedMaintenanceDate,
            type: entry.type || null,
            description: entry.description || null,
            cost: entry.cost || null,
            odometer: entry.odometer || null,
            next_due_date: entry.nextDueDate || null,
            stable_key: entry.stableKey,
            next_due_odometer: entry.nextDueOdometer || null,
            created_at: entry.createdAt || new Date().toISOString(),
            subcategory_stable_key: taxonomyMeta.subcategoryStableKey,
            subcategory_type_key: taxonomyMeta.subcategoryTypeKey,
            system_stable_key: taxonomyMeta.systemStableKey,
            subcategory_name_snapshot: taxonomyMeta.subcategoryNameSnapshot
          };

          const existingMaintenanceRec = entry.stableKey
            ? existingMaintenanceStableKeys.get(entry.stableKey)
            : existingMaintenance?.find((m) => m.id === entry.id);

          if (existingMaintenanceRec && maintenancePayloadMatchesCloud(payload, existingMaintenanceRec)) {
            continue;
          }

          const { error } = await supabase.from('maintenance').upsert(payload, {
            onConflict: 'user_id,stable_key'
          });

          if (error) {
            maintenanceErrors++;
            // --- CRITICAL LOGGER TO CAPTURE DB MISALIGNMENT ---
            console.error(`[Sync][MAINTENANCE CRITICAL] Supabase rejection details:`, error);
            result.details.push(`Maintenance upload failed (${entry.id}): ${error.message} (code: ${error.code})`);
          } else {
            result.counts.maintenance++;
          }
        }
      }

      // Upload trip estimates with deduplication
      if (remappedTripEstimates.length > 0) {
        const existingTripIds = new Set(existingTripEstimates?.map(t => t.id) || []);
        
        for (const estimate of remappedTripEstimates) {
          if (existingTripIds.has(estimate.id)) {
            continue;
          }
          
          const mappedTripVehicleId =
            remappedToCloudIdMap.get(estimate.vehicleId) ||
            vehicleIdMap.get(estimate.vehicleId) ||
            estimate.vehicleId;

          const { error } = await supabase.from('trip_estimates').upsert({
            id: estimate.id,
            user_id: userId,
            vehicle_id: mappedTripVehicleId,
            name: estimate.name || null,
            distance: estimate.distance || null,
            notes: estimate.notes || null,
            created_at: estimate.createdAt || new Date().toISOString()
          });
          if (error) {
            tripErrors++;
            result.details.push(`Trip estimate upload failed: ${error.message} (code: ${error.code})`);
          } else {
            result.counts.tripEstimates++;
          }
        }
      }

      const totalErrors = vehicleErrors + fillupErrors + maintenanceErrors + taxonomyErrors + tripErrors;
      const totalRecords = result.counts.vehicles + result.counts.fillups + result.counts.maintenance + result.counts.tripEstimates + result.counts.maintenanceTaxonomy;
      const totalSkipped = fillupSkipped;

      if (totalErrors === 0 && totalRecords > 0) {
        result.success = true;
        result.totalUploaded = totalRecords;
        result.message = `Upload complete. ${totalRecords} records saved to your cloud account.`;
        result.details.push(`Successfully uploaded: ${vehicleInserts} new vehicles, ${vehicleUpdates} updated vehicles, ${result.counts.fillups} fillups, ${result.counts.maintenance} maintenance, ${result.counts.tripEstimates} trips, ${result.counts.maintenanceTaxonomy} maintenance taxonomy records`);
        result.details.push(`Skipped ${totalSkipped} existing records (${vehicleSkipped} unchanged vehicles, ${fillupSkipped} fillups)`);
        if (fillupComputedTotal > 0) {
          result.details.push(`Fillup normalization: ${fillupComputedTotal} totalCost values computed from liters * pricePerLiter`);
        }
        if (fillupSkipped > 0) {
          result.details.push(`Fillup deduplication: ${fillupSkippedByStableKey} skipped by stable_key, ${fillupSkippedById} skipped by ID, ${fillupSkippedByFallback} skipped by fallback detection`);
        }
        localStorage.setItem(MIGRATION_DECISION_KEY, 'upload');
        localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
        // Set cloud synced flag to indicate local data is now in cloud
        localStorage.setItem(CLOUD_SYNCED_FLAG_KEY, new Date().toISOString());
      } else if (totalRecords > 0) {
        result.success = false;
        result.totalUploaded = totalRecords;
        result.message = `Upload partially succeeded. ${totalRecords} records uploaded, ${totalErrors} failed.`;
        result.details.push(`Partial success: ${vehicleInserts} new vehicles, ${vehicleUpdates} updated vehicles, ${totalRecords} uploaded, ${totalErrors} failed`);
        result.details.push(`Skipped ${totalSkipped} existing records (${vehicleSkipped} unchanged vehicles, ${fillupSkipped} fillups)`);
        if (fillupComputedTotal > 0) {
          result.details.push(`Fillup normalization: ${fillupComputedTotal} totalCost values computed from liters * pricePerLiter`);
        }
        if (fillupSkipped > 0) {
          result.details.push(`Fillup deduplication: ${fillupSkippedByStableKey} skipped by stable_key, ${fillupSkippedById} skipped by ID, ${fillupSkippedByFallback} skipped by fallback detection`);
        }
        result.details.push(`Fillup deduplication: ${fillupSkippedByStableKey} skipped by stable_key, ${fillupSkippedById} skipped by ID, ${fillupSkippedByFallback} skipped by fallback detection`);
      } else if (totalSkipped > 0) {
        // No new records, only skipped existing records
        // But only treat as no-op if there were NO errors
        if (totalErrors === 0) {
          result.success = true;
          result.totalUploaded = 0;
          result.message = 'Nothing to upload. All records are already in sync.';
          result.details.push(`No new records to upload. Skipped ${totalSkipped} existing records (${vehicleSkipped} unchanged vehicles, ${fillupSkipped} fillups)`);
          if (fillupSkipped > 0) {
            result.details.push(`Fillup deduplication: ${fillupSkippedByStableKey} skipped by stable_key, ${fillupSkippedById} skipped by ID, ${fillupSkippedByFallback} skipped by fallback detection`);
          }
          result.details.push(`Fillup deduplication: ${fillupSkippedByStableKey} skipped by stable_key, ${fillupSkippedById} skipped by ID, ${fillupSkippedByFallback} skipped by fallback detection`);
        } else {
          // There were errors even though no records were uploaded
          result.success = false;
          result.totalUploaded = 0;
          result.message = `Sync failed. ${totalErrors} error${totalErrors !== 1 ? 's' : ''} occurred during upload.`;
          result.details.push(`No records uploaded, but ${totalErrors} error${totalErrors !== 1 ? 's' : ''} occurred`);
          result.details.push(`Skipped ${totalSkipped} existing records (${vehicleSkipped} unchanged vehicles, ${fillupSkipped} fillups)`);
          if (fillupSkipped > 0) {
            result.details.push(`Fillup deduplication: ${fillupSkippedByStableKey} skipped by stable_key, ${fillupSkippedById} skipped by ID, ${fillupSkippedByFallback} skipped by fallback detection`);
          }
          result.details.push(`Fillup deduplication: ${fillupSkippedByStableKey} skipped by stable_key, ${fillupSkippedById} skipped by ID, ${fillupSkippedByFallback} skipped by fallback detection`);
        }
      } else {
        result.success = false;
        result.totalUploaded = 0;
        result.message = 'Upload failed. No records were saved to the cloud.';
        result.details.push('All upload operations failed or no data to upload');
        result.details.push(`Skipped ${totalSkipped} existing records`);
        if (fillupSkipped > 0) {
          result.details.push(`Fillup normalization: ${fillupSkipped} fillups skipped due to missing required fields`);
        }
        result.details.push(`Skipped ${totalSkipped} existing records`);
      }

      return result;
    } catch (error) {
      result.success = false;
      result.message = 'Upload failed due to an unexpected error.';
      result.details.push(`Exception: ${error.message}`);
      return result;
    }
  },

  async uploadLocalChanges(userId, options = {}) {
    return this.uploadLocalDataToCloud(userId, { silent: true, ...options });
  },

  /**
   * Download cloud data to local (overwrites local)
   */
  async downloadCloudDataToLocal(userId) {
    const result = {
      success: false,
      action: 'download',
      message: '',
      details: [],
      counts: {
        vehicles: 0,
        fillups: 0,
        maintenance: 0,
        tripEstimates: 0,
        maintenanceTaxonomy: 0
      }
    };

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        result.message = 'Not authenticated';
        result.details.push('User authentication check failed');
        return result;
      }

      result.details.push(`Authenticated as user: ${userId}`);

      // Fetch vehicles (filter out deleted records)
      const { data: vehicles, error: vehiclesError } = await supabase
        .from('vehicles')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null);
      
      if (vehiclesError) {
        result.details.push(`Vehicles fetch failed: ${vehiclesError.message} (code: ${vehiclesError.code})`);
      } else if (vehicles) {
        const mappedVehicles = vehicles.map(v => ({
          id: v.id,
          name: v.name,
          make: v.make,
          model: v.model,
          year: v.year,
          fuelType: v.fuel_type,
          tankCapacity: v.tank_capacity,
          licensePlate: v.license_plate,
          stableKey: v.stable_key,
          tyreSize: {
            width: v.tyre_width || null,
            aspectRatio: v.tyre_ratio || null,
            rimSize: v.tyre_rim || null
          }
        }));
        localStorage.setItem('fueltracker-vehicles-v2', JSON.stringify(mappedVehicles));
        result.counts.vehicles = mappedVehicles.length;
      }

      // Fetch fillups (filter out deleted records)
      const { data: fillups, error: fillupsError } = await supabase
        .from('fillups')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('date', { ascending: true });
      
      if (fillupsError) {
        result.details.push(`Fillups fetch failed: ${fillupsError.message} (code: ${fillupsError.code})`);
      } else if (fillups) {
        const mappedFillups = fillups.map(f => ({
          id: f.id,
          vehicleId: f.vehicle_id,
          date: f.date,
          odometer: f.odometer,
          liters: f.liters,
          pricePerLiter: f.price_per_liter,
          totalCost: f.total_cost,
          station: f.station,
          notes: f.notes,
          fullTank: f.full_tank,
          timestamp: f.date,
          createdAt: f.created_at,
          updatedAt: f.updated_at,
          stableKey: f.stable_key,
          deletedAt: f.deleted_at
        }));
        localStorage.setItem('fueltracker-fillups-v2', JSON.stringify(mappedFillups));
        result.counts.fillups = mappedFillups.length;
      }

      // Fetch maintenance (filter out deleted records)
      const { data: maintenance, error: maintenanceError } = await supabase
        .from('maintenance')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('date', { ascending: true });
      
      if (maintenanceError) {
        result.details.push(`Maintenance fetch failed: ${maintenanceError.message} (code: ${maintenanceError.code})`);
      } else if (maintenance) {
        const usableMaintenance = filterUsableMaintenanceRecords(maintenance);
        if (usableMaintenance.length !== maintenance.length) {
          result.details.push(`Skipped ${maintenance.length - usableMaintenance.length} hollow maintenance placeholder record(s) from cloud download.`);
        }
        const mappedMaintenance = usableMaintenance.map((m) =>
          this.mapCloudMaintenanceToLocal(m),
        );
        localStorage.setItem('fueltracker-maintenance-entries-v3', JSON.stringify(mappedMaintenance));
        result.counts.maintenance = mappedMaintenance.length;
      }

      // Fetch trip estimates (filter out deleted records)
      const { data: tripEstimates, error: tripsError } = await supabase
        .from('trip_estimates')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null);
      
      if (tripsError) {
        result.details.push(`Trip estimates fetch failed: ${tripsError.message} (code: ${tripsError.code})`);
      } else if (tripEstimates) {
        const mappedTrips = tripEstimates.map(t => ({
          id: t.id,
          vehicleId: t.vehicle_id,
          name: t.name,
          distance: t.distance,
          notes: t.notes,
          createdAt: t.created_at
        }));
        localStorage.setItem('fueltracker-trip-estimates-v2', JSON.stringify(mappedTrips));
        result.counts.tripEstimates = mappedTrips.length;
      }

      // Fetch app settings
      const { data: settings, error: settingsError } = await supabase
        .from('app_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (settingsError) {
        result.details.push(`Settings fetch failed: ${settingsError.message} (code: ${settingsError.code})`);
      } else if (settings?.settings_json) {
        Object.entries(settings.settings_json).forEach(([key, value]) => {
          if (key === MAINTENANCE_SYSTEMS_KEY || key === MAINTENANCE_CATEGORIES_KEY) return;
          try {
            localStorage.setItem(key, JSON.stringify(value));
          } catch (e) {
            result.details.push(`Failed to set ${key}: ${e.message}`);
          }
        });
      }

      const taxonomyDownload = await this.downloadMaintenanceTaxonomy(userId);
      result.details.push(...taxonomyDownload.details);
      result.counts.maintenanceTaxonomy = (taxonomyDownload.systems || 0) + (taxonomyDownload.categories || 0);

      const totalRecords = result.counts.vehicles + result.counts.fillups + result.counts.maintenance + result.counts.tripEstimates + result.counts.maintenanceTaxonomy;
      const hasErrors = result.details.some(d => d.includes('failed'));

      if (!hasErrors && totalRecords > 0) {
        result.success = true;
        result.message = `Download complete. ${totalRecords} records loaded from your cloud account.`;
        result.details.push(`Successfully downloaded: ${result.counts.vehicles} vehicles, ${result.counts.fillups} fillups, ${result.counts.maintenance} maintenance, ${result.counts.tripEstimates} trips, ${result.counts.maintenanceTaxonomy} maintenance taxonomy records`);
        localStorage.setItem(MIGRATION_DECISION_KEY, 'download');
        localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
        // Set cloud synced flag to indicate local data is now in sync with cloud
        localStorage.setItem(CLOUD_SYNCED_FLAG_KEY, new Date().toISOString());
        console.log('[Sync][download] Download successful, migration flags set');
      } else if (totalRecords > 0) {
        result.success = false;
        result.message = `Download partially succeeded. ${totalRecords} records loaded, some operations failed.`;
        console.log('[Sync][download] Download partially succeeded with errors');
      } else {
        result.success = false;
        result.message = 'Download failed. No records were loaded from the cloud.';
        console.log('[Sync][download] Download failed - no records loaded');
      }

      return result;
    } catch (error) {
      result.success = false;
      result.message = 'Download failed due to an unexpected error.';
      result.details.push(`Exception: ${error.message}`);
      console.error('[Sync][download] Download exception:', error);
      return result;
    }
  },

  /**
   * Merge local data to cloud (dedupe by ID where possible)
   */
  async mergeLocalDataToCloud(userId) {
    console.log('[Sync][merge] Starting merge to cloud');
    const result = {
      success: false,
      action: 'merge',
      message: '',
      details: [],
      counts: {
        vehicles: 0,
        fillups: 0,
        maintenance: 0,
        tripEstimates: 0,
        maintenanceTaxonomy: 0
      },
      uuidSummary: null
    };

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        result.message = 'Not authenticated';
        result.details.push('User authentication check failed');
        return result;
      }

      result.details.push(`Authenticated as user: ${userId}`);

      // Get existing cloud data to avoid duplicates (include stable_key for matching, filter out deleted records)
      const { data: existingVehicles, error: vehiclesFetchError } = await supabase.from('vehicles').select('*').eq('user_id', userId).is('deleted_at', null);
      const { data: existingFillups, error: fillupsFetchError } = await supabase.from('fillups').select('id').eq('user_id', userId).is('deleted_at', null);
      const { data: existingMaintenance, error: maintenanceFetchError } = await supabase.from('maintenance').select('id').eq('user_id', userId).is('deleted_at', null);
      const { data: existingTripEstimates, error: tripsFetchError } = await supabase.from('trip_estimates').select('id').eq('user_id', userId).is('deleted_at', null);

      if (vehiclesFetchError) result.details.push(`Cloud vehicles fetch failed: ${vehiclesFetchError.message}`);
      if (fillupsFetchError) result.details.push(`Cloud fillups fetch failed: ${fillupsFetchError.message}`);
      if (maintenanceFetchError) result.details.push(`Cloud maintenance fetch failed: ${maintenanceFetchError.message}`);
      if (tripsFetchError) result.details.push(`Cloud trips fetch failed: ${tripsFetchError.message}`);

      const existingVehicleIds = new Set(existingVehicles?.map(v => v.id) || []);
      const existingFillupIds = new Set(existingFillups?.map(f => f.id) || []);
      const existingMaintenanceIds = new Set(existingMaintenance?.map(m => m.id) || []);
      const existingTripEstimateIds = new Set(existingTripEstimates?.map(t => t.id) || []);

      result.details.push(`Existing cloud records: ${existingVehicleIds.size} vehicles, ${existingFillupIds.size} fillups, ${existingMaintenanceIds.size} maintenance, ${existingTripEstimateIds.size} trips`);

      const vehicles = JSON.parse(localStorage.getItem('fueltracker-vehicles-v2') || '[]');
      const fillups = JSON.parse(localStorage.getItem('fueltracker-fillups-v2') || '[]');
      const maintenance = JSON.parse(localStorage.getItem('fueltracker-maintenance-entries-v3') || '[]');
      const tripEstimates = JSON.parse(localStorage.getItem('fueltracker-trip-estimates-v2') || '[]');

      result.details.push(`Local records to merge: ${vehicles.length} vehicles, ${fillups.length} fillups, ${maintenance.length} maintenance, ${tripEstimates.length} trips`);

      // Remap legacy IDs to UUIDs before merge
      const { vehicles: remappedVehicles, fillups: remappedFillups, maintenance: remappedMaintenance, tripEstimates: remappedTripEstimates, summary } = remapLegacyIds(vehicles, fillups, maintenance, tripEstimates);
      result.uuidSummary = summary;
      result.details.push(`UUID remapping: ${summary.preservedUuids} preserved, ${summary.regeneratedIds} regenerated, ${summary.remappedForeignKeys} foreign keys remapped`);

      // Backfill stable keys for vehicles
      const vehiclesWithStableKeys = backfillStableKeys(remappedVehicles);

      // Match local vehicles to cloud vehicles using stable_key or fingerprint
      const { matches } = matchVehicles(vehiclesWithStableKeys, existingVehicles || []);

      let vehicleErrors = 0;
      let fillupErrors = 0;
      let fillupSkipped = 0;
      let fillupComputedTotal = 0;
      let maintenanceErrors = 0;
      let tripErrors = 0;
      let skipped = 0;
      let vehicleInserts = 0;

      // Build vehicle ID map for fillup normalization (use matched cloud IDs)
      const vehicleIdMap = new Map();
      matches.forEach((cloudId, localId) => {
        vehicleIdMap.set(localId, cloudId);
      });

      // Upload vehicles with deduplication (same logic as upload)
      for (const localVehicle of vehiclesWithStableKeys) {
        const matchedCloudId = matches.get(localVehicle.id);
        
        if (matchedCloudId) {
          // Vehicle already exists in cloud - skip (merge only adds new records)
          console.log(`[Sync][vehicle] Merge reused existing cloud vehicle ${localVehicle.id} -> ${matchedCloudId}`);
          skipped++;
        } else if (!existingVehicleIds.has(localVehicle.id)) {
          // New vehicle - insert it
          console.log(`[Sync][vehicle] Merge created new vehicle ${localVehicle.id}`);
          const { error } = await supabase.from('vehicles').insert({
            id: localVehicle.id,
            user_id: userId,
            name: localVehicle.name,
            make: localVehicle.make || null,
            model: localVehicle.model || null,
            year: localVehicle.year || null,
            fuel_type: localVehicle.fuelType || null,
            tank_capacity: localVehicle.tankCapacity || null,
            license_plate: localVehicle.licensePlate || null,
            tyre_width: localVehicle.tyreSize?.width || null,
            tyre_ratio: localVehicle.tyreSize?.aspectRatio || null,
            tyre_rim: localVehicle.tyreSize?.rimSize || null,
            stable_key: localVehicle.stableKey,
            created_at: new Date().toISOString()
          });
          
          if (error) {
            vehicleErrors++;
            result.details.push(`Vehicle insert failed (${localVehicle.id}): ${error.message} (code: ${error.code})`);
          } else {
            vehicleInserts++;
            result.counts.vehicles++;
          }
        } else {
          // Vehicle ID exists but no stable_key match - skip to avoid duplicates
          console.log(`[Sync][vehicle] Merge skipped duplicate vehicle ${localVehicle.id}`);
          skipped++;
        }
      }

      // Upload fillups (skip existing) with normalization
      for (const fillup of remappedFillups) {
        if (!existingFillupIds.has(fillup.id)) {
          const { normalized, skipped: fillupSkippedNorm, reason, computedTotal } = normalizeFillupForCloud(fillup, vehicleIdMap);
          
          if (fillupSkippedNorm) {
            fillupSkipped++;
            result.details.push(`Fillup skipped (${fillup.id}): ${reason}`);
            continue;
          }
          
          if (computedTotal) {
            fillupComputedTotal++;
          }
          
          const { error } = await supabase.from('fillups').upsert({
            ...normalized,
            user_id: userId
          });
          if (error) {
            fillupErrors++;
            result.details.push(`Fillup merge failed (${fillup.id}): ${error.message} (code: ${error.code})`);
          } else {
            result.counts.fillups++;
          }
        } else {
          skipped++;
        }
      }

      // Upload maintenance (skip existing)
      const { systems: mergeMaintenanceSystems, categories: mergeMaintenanceCategories } = loadLocalMaintenanceTaxonomy();
      for (const entry of remappedMaintenance) {
        if (!existingMaintenanceIds.has(entry.id)) {
          // CRITICAL FIX: Preserve original maintenance date (same logic as fill-ups)
          // Priority order: date > timestamp > createdAt
          let normalizedMaintenanceDate = null;
          if (entry.date) {
            normalizedMaintenanceDate = entry.date;
            console.log(`[Sync][merge] Maintenance ${entry.id}: Using entry.date = ${entry.date}`);
          } else if (entry.timestamp) {
            normalizedMaintenanceDate = entry.timestamp.split('T')[0];
            console.log(`[Sync][merge] Maintenance ${entry.id}: Extracted date from timestamp = ${normalizedMaintenanceDate} (original timestamp: ${entry.timestamp})`);
          } else if (entry.createdAt) {
            normalizedMaintenanceDate = entry.createdAt.split('T')[0];
            console.log(`[Sync][merge] Maintenance ${entry.id}: Extracted date from createdAt = ${normalizedMaintenanceDate} (original createdAt: ${entry.createdAt})`);
          } else {
            console.error(`[Sync][merge] Maintenance ${entry.id}: CRITICAL - No date field found (date, timestamp, createdAt all missing). Rejecting record.`);
            maintenanceErrors++;
            result.details.push(`Maintenance merge failed (${entry.id}): missing date (date, timestamp, and createdAt all absent)`);
            continue;
          }

          // Validate date format
          if (!normalizedMaintenanceDate || !/^\d{4}-\d{2}-\d{2}$/.test(normalizedMaintenanceDate)) {
            console.error(`[Sync][merge] Maintenance ${entry.id}: CRITICAL - Invalid date format: ${normalizedMaintenanceDate}. Rejecting record.`);
            maintenanceErrors++;
            result.details.push(`Maintenance merge failed (${entry.id}): invalid date format: ${normalizedMaintenanceDate}`);
            continue;
          }

          const taxonomyMeta = getMaintenanceTaxonomyMetadata(entry, mergeMaintenanceSystems, mergeMaintenanceCategories);
          const mappedEntryVehicleId = vehicleIdMap.get(entry.vehicleId) || entry.vehicleId;

          const { error } = await supabase.from('maintenance').upsert({
            id: entry.id,
            user_id: userId,
            vehicle_id: mappedEntryVehicleId,
            date: normalizedMaintenanceDate,
            type: entry.type || null,
            description: entry.description || null,
            cost: entry.cost || null,
            odometer: entry.odometer || null,
            next_due_date: entry.nextDueDate || null,
            next_due_odometer: entry.nextDueOdometer || null,
            created_at: entry.createdAt || new Date().toISOString(),
            subcategory_stable_key: taxonomyMeta.subcategoryStableKey,
            subcategory_type_key: taxonomyMeta.subcategoryTypeKey,
            system_stable_key: taxonomyMeta.systemStableKey,
            subcategory_name_snapshot: taxonomyMeta.subcategoryNameSnapshot
          });
          if (error) {
            maintenanceErrors++;
            result.details.push(`Maintenance merge failed: ${error.message} (code: ${error.code})`);
          } else {
            result.counts.maintenance++;
          }
        } else {
          skipped++;
        }
      }

      // Upload trip estimates (skip existing)
      for (const estimate of remappedTripEstimates) {
        if (!existingTripEstimateIds.has(estimate.id)) {
          const { error } = await supabase.from('trip_estimates').upsert({
            id: estimate.id,
            user_id: userId,
            vehicle_id: estimate.vehicleId,
            name: estimate.name || null,
            distance: estimate.distance || null,
            notes: estimate.notes || null,
            created_at: estimate.createdAt || new Date().toISOString()
          });
          if (error) {
            tripErrors++;
            result.details.push(`Trip estimate merge failed: ${error.message} (code: ${error.code})`);
          } else {
            result.counts.tripEstimates++;
          }
        } else {
          skipped++;
        }
      }

      const taxonomyUpload = await this.uploadMaintenanceTaxonomy(userId);
      result.details.push(...taxonomyUpload.details);
      const taxonomyErrors = taxonomyUpload.success === false ? 1 : 0;
      result.counts.maintenanceTaxonomy = (taxonomyUpload.systems || 0) + (taxonomyUpload.categories || 0);

      // Sync merged data back to local
      await this.downloadCloudDataToLocal(userId);

      const totalErrors = vehicleErrors + fillupErrors + maintenanceErrors + taxonomyErrors + tripErrors;
      const totalMerged = result.counts.vehicles + result.counts.fillups + result.counts.maintenance + result.counts.tripEstimates + result.counts.maintenanceTaxonomy;

      result.details.push(`Merge summary: ${totalMerged} new records merged, ${skipped} duplicates skipped, ${totalErrors} errors`);

      if (totalErrors === 0) {
        result.success = true;
        result.message = `Merge complete. ${totalMerged} new records merged, ${skipped} duplicates skipped.`;
        result.details.push(`Vehicle merge: ${vehicleInserts} new vehicles created, ${matches.size} existing vehicles reused`);
        if (fillupComputedTotal > 0) {
          result.details.push(`Fillup normalization: ${fillupComputedTotal} totalCost values computed from liters * pricePerLiter`);
        }
        if (fillupSkipped > 0) {
          result.details.push(`Fillup normalization: ${fillupSkipped} fillups skipped due to missing required fields`);
        }
        localStorage.setItem(MIGRATION_DECISION_KEY, 'merge');
        localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
        // Set cloud synced flag to indicate local data is now in sync with cloud
        localStorage.setItem(CLOUD_SYNCED_FLAG_KEY, new Date().toISOString());
        console.log('[Sync][merge] Merge successful, migration flags set');
      } else if (totalMerged > 0) {
        result.success = false;
        result.message = `Merge partially succeeded. ${totalMerged} records merged, ${totalErrors} failed.`;
        result.details.push(`Vehicle merge: ${vehicleInserts} new vehicles created, ${matches.size} existing vehicles reused`);
        if (fillupComputedTotal > 0) {
          result.details.push(`Fillup normalization: ${fillupComputedTotal} totalCost values computed from liters * pricePerLiter`);
        }
        if (fillupSkipped > 0) {
          result.details.push(`Fillup normalization: ${fillupSkipped} fillups skipped due to missing required fields`);
        }
        console.log('[Sync][merge] Merge partially succeeded with errors');
      } else {
        result.success = false;
        result.message = 'Merge failed. No records were merged.';
        if (fillupSkipped > 0) {
          result.details.push(`Fillup normalization: ${fillupSkipped} fillups skipped due to missing required fields`);
        }
        console.log('[Sync][merge] Merge failed - no records merged');
      }

      return result;
    } catch (error) {
      result.success = false;
      result.message = 'Merge failed due to an unexpected error.';
      result.details.push(`Exception: ${error.message}`);
      console.error('[Sync][merge] Merge exception:', error);
      return result;
    }
  },

  /**
   * Migrate existing localStorage data to Supabase on first login
   */
  async migrateData(userId) {
    const migrationComplete = localStorage.getItem(MIGRATION_FLAG_KEY);
    if (migrationComplete) {
      return;
    }

    try {
      // Migrate vehicles
      const vehicles = JSON.parse(localStorage.getItem('fueltracker-vehicles-v2') || '[]');
      if (vehicles.length > 0) {
        for (const vehicle of vehicles) {
          await supabase.from('vehicles').upsert({
            id: vehicle.id || uuidv4(),
            user_id: userId,
            name: vehicle.name,
            make: vehicle.make || null,
            model: vehicle.model || null,
            year: vehicle.year || null,
            fuel_type: vehicle.fuelType || null,
            tank_capacity: vehicle.tankCapacity || null,
            license_plate: vehicle.licensePlate || null,
            tyre_width: vehicle.tyreSize?.width || null,
            tyre_ratio: vehicle.tyreSize?.aspectRatio || null,
            tyre_rim: vehicle.tyreSize?.rimSize || null,
            created_at: new Date().toISOString()
          });
        }
      }

      // Migrate fillups
      const fillups = JSON.parse(localStorage.getItem('fueltracker-fillups-v2') || '[]');
      if (fillups.length > 0) {
        for (const fillup of fillups) {
          // CRITICAL FIX: Preserve original fill-up date during migration
          // Priority order: date > timestamp > createdAt
          let normalizedDate = null;
          if (fillup.date) {
            normalizedDate = fillup.date;
          } else if (fillup.timestamp) {
            normalizedDate = fillup.timestamp.split('T')[0];
          } else if (fillup.createdAt) {
            normalizedDate = fillup.createdAt.split('T')[0];
          } else {
            console.error(`[Sync][migrate] Fillup ${fillup.id}: CRITICAL - No date field found. Skipping migration.`);
            continue;
          }

          await supabase.from('fillups').upsert({
            id: fillup.id || uuidv4(),
            user_id: userId,
            vehicle_id: fillup.vehicleId,
            date: normalizedDate,
            odometer: fillup.odometer,
            liters: fillup.liters,
            price_per_liter: fillup.pricePerLiter,
            total_cost: fillup.totalCost,
            station: fillup.station || null,
            notes: fillup.notes || null,
            full_tank: fillup.fullTank !== undefined ? fillup.fullTank : true,
            created_at: fillup.createdAt || new Date().toISOString()
          });
        }
      }

      // Migrate maintenance entries
      const maintenance = JSON.parse(localStorage.getItem('fueltracker-maintenance-entries-v3') || '[]');
      if (maintenance.length > 0) {
        for (const entry of maintenance) {
          await supabase.from('maintenance').upsert({
            id: entry.id || uuidv4(),
            user_id: userId,
            vehicle_id: entry.vehicleId,
            date: entry.date || new Date().toISOString().split('T')[0],
            type: entry.type || null,
            description: entry.description || null,
            cost: entry.cost || null,
            odometer: entry.odometer || null,
            next_due_date: entry.nextDueDate || null,
            next_due_odometer: entry.nextDueOdometer || null,
            created_at: entry.createdAt || new Date().toISOString()
          });
        }
      }

      // Migrate prices
      const prices = JSON.parse(localStorage.getItem('fueltracker-prices-v2') || '{}');
      if (Object.keys(prices).length > 0) {
        await supabase.from('prices').upsert({
          id: uuidv4(),
          user_id: userId,
          date: new Date().toISOString().split('T')[0],
          station: 'Default',
          fuel_type: 'mixed',
          price: JSON.stringify(prices),
          location: null,
          created_at: new Date().toISOString()
        });
      }

      // Migrate trip estimates
      const tripEstimates = JSON.parse(localStorage.getItem('fueltracker-trip-estimates-v2') || '[]');
      if (tripEstimates.length > 0) {
        for (const estimate of tripEstimates) {
          await supabase.from('trip_estimates').upsert({
            id: estimate.id || uuidv4(),
            user_id: userId,
            vehicle_id: estimate.vehicleId,
            name: estimate.name || null,
            distance: estimate.distance || null,
            notes: estimate.notes || null,
            created_at: estimate.createdAt || new Date().toISOString()
          });
        }
      }

      await this.uploadAppSettings(userId);

      // Always set migration flag, even if no data was migrated
      localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
    } catch (error) {
      // Set migration flag even on error to prevent infinite loop
      localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
      throw error;
    }
  },

  /**
   * Fetch all data from Supabase and update localStorage
   */
  async syncFromCloud(userId) {
    if (!this.isOnline()) {
      return;
    }

    try {
      // Fetch vehicles
      const { data: vehicles, error: vehiclesError } = await supabase
        .from('vehicles')
        .select('*')
        .eq('user_id', userId);
      
      if (vehiclesError) {
        console.warn('[Sync][syncFromCloud] Vehicles fetch failed:', vehiclesError.message);
      } else {
        const mappedVehicles = (vehicles || []).map(v => ({
          id: v.id,
          name: v.name,
          make: v.make,
          model: v.model,
          year: v.year,
          fuelType: v.fuel_type,
          tankCapacity: v.tank_capacity,
          licensePlate: v.license_plate,
          tyreSize: {
            width: v.tyre_width || null,
            aspectRatio: v.tyre_ratio || null,
            rimSize: v.tyre_rim || null
          }
        }));
        localStorage.setItem('fueltracker-vehicles-v2', JSON.stringify(mappedVehicles));
      }

      // Fetch fillups
      const { data: fillups, error: fillupsError } = await supabase
        .from('fillups')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('date', { ascending: true });
      
      if (fillupsError) {
        console.warn('[Sync][syncFromCloud] Fillups fetch failed:', fillupsError.message);
      } else {
        const mappedFillups = (fillups || []).map((f) =>
          this.mapCloudFillupToLocal(f),
        );
        localStorage.setItem('fueltracker-fillups-v2', JSON.stringify(mappedFillups));
      }

      // Fetch maintenance
      const { data: maintenance, error: maintenanceError } = await supabase
        .from('maintenance')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('date', { ascending: true });
      
      if (maintenanceError) {
        console.warn('[Sync][syncFromCloud] Maintenance fetch failed:', maintenanceError.message);
      } else {
        const usableMaintenance = filterUsableMaintenanceRecords(maintenance || []);
        const mappedMaintenance = usableMaintenance.map((m) =>
          this.mapCloudMaintenanceToLocal(m),
        );
        localStorage.setItem('fueltracker-maintenance-entries-v3', JSON.stringify(mappedMaintenance));
      }

      // Fetch app settings - use maybeSingle to handle missing rows gracefully
      const { data: settings, error: settingsError } = await supabase
        .from('app_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (settingsError) {
        console.warn('[Sync][syncFromCloud] Settings fetch failed:', settingsError.message);
      } else if (settings?.settings_json) {
        Object.entries(settings.settings_json).forEach(([key, value]) => {
          if (key === MAINTENANCE_SYSTEMS_KEY || key === MAINTENANCE_CATEGORIES_KEY) return;
          try {
            localStorage.setItem(key, JSON.stringify(value));
          } catch (error) {
            console.warn('[Sync][syncFromCloud] Failed to persist setting:', key, error);
          }
        });
      }

      const taxonomyDownload = await this.downloadMaintenanceTaxonomy(userId, new Map(), { clearDirty: false });
      if (taxonomyDownload.success === false) {
        console.warn('[Sync][syncFromCloud] Maintenance taxonomy fetch failed:', taxonomyDownload.details.join(' '));
      }
    } catch (error) {
      console.warn('[Sync][syncFromCloud] Failed:', error);
    }
  },

  /**
   * Queue a change for sync when online
   */
  queueChange(operation, table, data) {
    try {
      const queue = JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]');
      queue.push({
        id: uuidv4(),
        operation,
        table,
        data,
        timestamp: new Date().toISOString()
      });
      localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    } catch (error) {
      console.warn('[Sync][queueChange] Failed to queue change:', error);
    }
  },

  /**
   * Process queued changes when online
   */
  async processQueue(userId) {
    if (!this.isOnline()) {
      return;
    }

    try {
      const queue = JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]');
      if (queue.length === 0) {
        return;
      }

      const processed = [];
      const failed = [];

      for (const item of queue) {
        try {
          if (item.table === 'vehicles') {
            const data = item.data;
            await supabase.from('vehicles').upsert({
              id: data.id || uuidv4(),
              user_id: userId,
              name: data.name,
              make: data.make || null,
              model: data.model || null,
              year: data.year || null,
              fuel_type: data.fuelType || null,
              tank_capacity: data.tankCapacity || null,
              license_plate: data.licensePlate || null
            });
          } else if (item.table === 'fillups') {
            const data = item.data;
            await supabase.from('fillups').upsert({
              id: data.id || uuidv4(),
              user_id: userId,
              vehicle_id: data.vehicleId,
              date: data.date,
              odometer: data.odometer,
              liters: data.liters,
              price_per_liter: data.pricePerLiter,
              total_cost: data.totalCost,
              station: data.station || null,
              notes: data.notes || null,
              full_tank: data.fullTank !== undefined ? data.fullTank : true
            });
          } else if (item.table === 'maintenance') {
            const data = item.data;
            await supabase.from('maintenance').upsert({
              id: data.id || uuidv4(),
              user_id: userId,
              vehicle_id: data.vehicleId,
              date: data.date,
              type: data.type || null,
              description: data.description || null,
              cost: data.cost || null,
              odometer: data.odometer || null,
              next_due_date: data.nextDueDate || null,
              next_due_odometer: data.nextDueOdometer || null
            });
          }
          processed.push(item.id);
        } catch {
          failed.push(item);
        }
      }

      // Remove processed items from queue
      const remainingQueue = queue.filter(item => !processed.includes(item.id));
      localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(remainingQueue));
    } catch (error) {
      console.warn('[Sync][processQueue] Failed:', error);
    }
  },

  /**
   * Setup online sync listener (controlled, single instance)
   * @param {string} userId - User ID for sync
   * @param {Object} options - Sync options
   * @param {string} options.decision - Migration decision ('upload', 'download', 'merge', 'keep-local')
   */
  setupOnlineSyncListener(userId, options = {}) {
    // Remove existing listener if any
    this.removeOnlineSyncListener();

    const decision = options.decision || localStorage.getItem(MIGRATION_DECISION_KEY) || 'download';

    onlineListener = async () => {
      try {
        // Respect migration decision for online sync
        if (decision === 'keep-local') {
          // Only process queue if safe (uploading local changes, not overwriting)
          // For now, skip entirely to be safe
          return;
        }

        if (this.isOnline()) {
          await this.syncFromCloud(userId);
          await this.processQueue(userId);
        }
      } catch (error) {
        console.warn('[Sync][online] Background sync failed:', error);
      }
    };

    window.addEventListener('online', onlineListener);
  },

  /**
   * Remove online sync listener
   */
  removeOnlineSyncListener() {
    if (onlineListener) {
      window.removeEventListener('online', onlineListener);
      onlineListener = null;
    }
  },

  /**
   * Initialize sync - called on app load
   * Returns sync status for UI to decide if migration modal is needed
   */
  async initialize() {
  if (initializationInProgress) {
    console.log('[Sync][initialize] Initialization already in progress, returning existing promise');
    return initializationPromise;
  }

  const currentId = ++latestInitializationId;
  console.log(`[Sync][initialize] Starting sync initialization (ID: ${currentId})`);

  initializationInProgress = true;
  initializationPromise = (async () => {
    try {
      const userId = await this.getUserId();
      if (!userId) {
        console.log('[Sync][initialize] No user ID found, returning null');
        return null;
      }

      if (currentId !== latestInitializationId) return null;

      const migrationDecision = localStorage.getItem(MIGRATION_DECISION_KEY);
      const migrationFlag = localStorage.getItem(MIGRATION_FLAG_KEY);

      const clearPendingSyncStatus = () => {
        pendingSyncStatus = null;
        localStorage.removeItem(PENDING_SYNC_STATUS_KEY);
      };

      const isRestorablePendingStatus = (status) => {
        if (!status || typeof status !== 'object') return false;

        const hasLocalData = !!status.hasLocalData;
        const hasCloudData = !!status.hasCloudData;
        const hasScenario = typeof status.scenario === 'string' && status.scenario.length > 0;

        return hasLocalData && (hasCloudData || hasScenario);
      };

      if (pendingSyncStatus) {
        if (!migrationFlag && migrationDecision === null && isRestorablePendingStatus(pendingSyncStatus)) {
          console.log('[Sync][initialize] Returning cached pending sync status');
          return pendingSyncStatus;
        }

        console.log('[Sync][initialize] Clearing stale cached pending sync status');
        clearPendingSyncStatus();
      }

      const persistedPendingStatus = localStorage.getItem(PENDING_SYNC_STATUS_KEY);
      if (persistedPendingStatus) {
        try {
          const restored = JSON.parse(persistedPendingStatus);

          if (!migrationFlag && migrationDecision === null && isRestorablePendingStatus(restored)) {
            console.log('[Sync][initialize] Restoring persisted pending sync status');
            pendingSyncStatus = restored;
            return restored;
          }

          console.log('[Sync][initialize] Ignoring stale persisted pending sync status');
          clearPendingSyncStatus();
        } catch (e) {
          console.error('[Sync][initialize] Failed to parse persisted pending status:', e);
          clearPendingSyncStatus();
        }
      }

      console.log('[Sync][initialize] Running legacy metadata backfill');
      this.backfillMetadata();

      const migrationComplete = localStorage.getItem(MIGRATION_FLAG_KEY);
      const countsMatchedNoConflict = localStorage.getItem(COUNTS_MATCHED_NO_CONFLICT_KEY);
      console.log('[Sync][initialize] migrationComplete:', migrationComplete);
      console.log('[Sync][initialize] countsMatchedNoConflict:', countsMatchedNoConflict);
      console.log('[Sync][initialize] migrationDecision:', migrationDecision);

      if (countsMatchedNoConflict && !migrationDecision) {
        console.log('[Sync][initialize] countsMatchedNoConflict is true, checking if counts still match');
        const syncStatus = await this.getSyncStatus(userId);
        if (currentId !== latestInitializationId) return null;

        const countsMatch = (
          syncStatus.localCounts?.vehicles === syncStatus.cloudCounts?.vehicles &&
          syncStatus.localCounts?.fillups === syncStatus.cloudCounts?.fillups &&
          syncStatus.localCounts?.maintenance === syncStatus.cloudCounts?.maintenance &&
          syncStatus.localCounts?.trips === syncStatus.cloudCounts?.trips
        );

        console.log(
          '[Sync][initialize] countsMatch check:',
          countsMatch,
          'localCounts:',
          syncStatus.localCounts,
          'cloudCounts:',
          syncStatus.cloudCounts
        );

        let noActionableDifference = false;
        if (!countsMatch) {
          const uploadCheck = await this.uploadLocalDataToCloud(userId, { silent: true });
          noActionableDifference =
            uploadCheck.success &&
            (
              uploadCheck.message === 'Nothing to upload. Cloud is already up to date.' ||
              uploadCheck.message === 'Nothing to upload. All records are already in sync.'
            );

          console.log(
            '[Sync][initialize] countsMatchedNoConflict fallback noActionableDifference:',
            noActionableDifference,
            'uploadCheck.message:',
            uploadCheck.message
          );
        }

        if (countsMatch || noActionableDifference) {
          console.log('[Sync][initialize] Counts still match, skipping modal and setting up sync listener');
          this.setupOnlineSyncListener(userId, { decision: null });
          if (this.isOnline()) await this.syncAfterMutation(userId);
          return null;
        } else {
          console.log('[Sync][initialize] Counts no longer match, removing countsMatchedNoConflict flag');
          localStorage.removeItem(COUNTS_MATCHED_NO_CONFLICT_KEY);
          return await this.getSyncStatus(userId);
        }
      }

      if (migrationComplete === 'true' && migrationDecision) {
        console.log('[Sync][initialize] migrationComplete is true with decision:', migrationDecision);

        if (migrationDecision === 'keep-local') {
          console.log('[Sync][initialize] Stored decision is keep-local — cloud writes DISABLED. Remove localStorage key "fueltracker-migration-decision" to re-enable.');
          return null;
        }

        if (migrationDecision === 'download') {
          console.log('[Sync][initialize] Stored decision is download — skipping startup auto-upload');
          this.setupOnlineSyncListener(userId, { decision: 'download' });
          return null;
        }

        console.log('[Sync][initialize] Setting up sync listener with decision:', migrationDecision);
        this.setupOnlineSyncListener(userId, { decision: migrationDecision });
        if (this.isOnline()) await this.syncAfterMutation(userId);
        return null;
      }

      const syncStatus = await this.getSyncStatus(userId);
      let noActionableDifference = false;
      const hasLocalData = syncStatus.hasLocalData;
      const hasCloudData = syncStatus.hasCloudData;

      if (hasLocalData && hasCloudData) {
        const uploadCheck = await this.uploadLocalDataToCloud(userId, { silent: true });
        noActionableDifference =
          uploadCheck.success &&
          (
            uploadCheck.message === 'Nothing to upload. Cloud is already up to date.' ||
            uploadCheck.message === 'Nothing to upload. All records are already in sync.'
          );
      }

      if (currentId !== latestInitializationId) return null;

      const hasConflicts = syncStatus.detailedDiff?.conflicts?.length > 0;
      const countsMatch = (
        syncStatus.localCounts?.vehicles === syncStatus.cloudCounts?.vehicles &&
        syncStatus.localCounts?.fillups === syncStatus.cloudCounts?.fillups &&
        syncStatus.localCounts?.maintenance === syncStatus.cloudCounts?.maintenance &&
        syncStatus.localCounts?.trips === syncStatus.cloudCounts?.trips
      );

      if (!hasLocalData && !hasCloudData) {
        console.log('[Sync][initialize] Fresh start - no local or cloud data, skipping modal');
        localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
        localStorage.setItem(MIGRATION_DECISION_KEY, 'keep-local');
        return null;
      }

      if (!hasConflicts && (countsMatch || noActionableDifference)) {
        console.log('[Sync][initialize] Already in sync - no conflicts, counts match, skipping modal');
        localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
        localStorage.setItem(MIGRATION_DECISION_KEY, 'merge');
        this.setupOnlineSyncListener(userId, { decision: 'merge' });
        if (this.isOnline()) await this.syncAfterMutation(userId);
        return null;
      }

      if (hasLocalData && !hasCloudData && !hasConflicts && migrationDecision !== 'keep-local' && migrationDecision !== 'download') {
        console.log('[Sync][initialize] First-time user with local data only - auto-uploading without modal');
        const uploadResult = await this.uploadLocalChanges(userId);
        if (uploadResult.success) {
          localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
          localStorage.setItem(MIGRATION_DECISION_KEY, 'upload');
          this.setupOnlineSyncListener(userId, { decision: 'upload' });
          return null;
        }
        console.log('[Sync][initialize] Auto-upload failed, showing modal for manual intervention');
      }

      if (hasConflicts || (hasLocalData && hasCloudData) || (hasCloudData && !hasLocalData)) {
        let scenario = 'UNKNOWN';
        if (!hasLocalData && !hasCloudData) {
          scenario = 'NO_BOTH';
        } else if (!hasLocalData && hasCloudData) {
          scenario = 'NO_LOCAL_HAS_CLOUD';
        } else if (hasLocalData && !hasCloudData) {
          scenario = 'HAS_LOCAL_NO_CLOUD';
        } else if (hasLocalData && hasCloudData) {
          scenario = 'HAS_BOTH';
        }

        syncStatus.scenario = scenario;
        pendingSyncStatus = syncStatus;
        localStorage.setItem(PENDING_SYNC_STATUS_KEY, JSON.stringify(syncStatus));
        return syncStatus;
      }

      console.log('[Sync][initialize] No user action required, skipping modal');
      localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
      localStorage.setItem(MIGRATION_DECISION_KEY, 'keep-local');
      return null;
    } catch (error) {
      console.error('[Sync][initialize] Initialization failed:', error);
      return null;
    } finally {
      initializationInProgress = false;
      setTimeout(() => {
        if (!initializationInProgress) initializationPromise = null;
      }, 1000);
    }
  })();

  return initializationPromise;
},

  /**
   * Backfill missing metadata (stableKey, updatedAt) for all local records
   */
  backfillMetadata() {
    const keys = [
      { localKey: 'fueltracker-vehicles-v2', entityKey: 'vehicles' },
      { localKey: 'fueltracker-fillups-v2', entityKey: 'fillups' }
    ];

    keys.forEach(k => {
      const records = JSON.parse(localStorage.getItem(k.localKey) || '[]');
      const { normalized, changed } = this.normalizeLegacyRecords(records);
      if (changed) {
        localStorage.setItem(k.localKey, JSON.stringify(normalized));
        console.log(`[Sync][backfill] Backfilled metadata for ${k.entityKey}`);
        window.dispatchEvent(new CustomEvent('local-data-changed', { detail: { entityKey: k.entityKey } }));
      }
    });
  },

  /**
   * Continue sync after migration decision
   */
  async continueSyncAfterDecision(userId, decision) {
  console.log('[Sync][initialize] Continuing sync after decision:', decision);
  console.log('[Sync][initialize] Decision value:', decision);
  console.log('[Sync][initialize] Action to perform:', decision);

  pendingSyncStatus = null;
  localStorage.removeItem(PENDING_SYNC_STATUS_KEY);
  console.log('[Sync][initialize] Cleared pending migration state after decision');

  const result = {
    success: true,
    action: decision,
    message: '',
    details: []
  };

  try {
    switch (decision) {
      case 'upload': {
        console.log('[Sync][initialize] Action: Upload local data to cloud');
        console.log('[Sync][initialize] Using new uploadLocalChanges logic');

        const uploadResult = await this.uploadLocalChanges(userId);
        result.success = !!uploadResult?.success;
        result.message = uploadResult?.message || '';
        result.details = uploadResult?.details || [];
        result.summary = uploadResult?.summary;
        result.counts = uploadResult?.counts;
        result.totalUploaded = uploadResult?.totalUploaded;

        if (result.success) {
          localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
          localStorage.setItem(MIGRATION_DECISION_KEY, 'upload');
          localStorage.removeItem(COUNTS_MATCHED_NO_CONFLICT_KEY);
          pendingSyncStatus = null;
          localStorage.removeItem(PENDING_SYNC_STATUS_KEY);
          this.setupOnlineSyncListener(userId, { decision: 'upload' });
        }

        console.log('[Sync][initialize] Upload action completed. Success:', result.success, 'Message:', result.message);
        break;
      }

      case 'download': {
        console.log('[Sync][initialize] Action: Download cloud data to local');
        console.log('[Sync][initialize] Using new replaceLocalWithCloud logic');

        const downloadResult = await this.replaceLocalWithCloud(userId);
        result.success = !!downloadResult?.success;
        result.message = downloadResult?.message || '';
        result.details = downloadResult?.details || [];
        result.summary = downloadResult?.summary;
        result.counts = downloadResult?.counts;

        if (result.success) {
          localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
          localStorage.setItem(MIGRATION_DECISION_KEY, 'download');
          localStorage.removeItem(COUNTS_MATCHED_NO_CONFLICT_KEY);
          pendingSyncStatus = null;
          localStorage.removeItem(PENDING_SYNC_STATUS_KEY);
          this.setupOnlineSyncListener(userId, { decision: 'download' });
        }

        console.log('[Sync][initialize] Download action completed. Success:', result.success, 'Message:', result.message);
        break;
      }

      case 'merge': {
        console.log('[Sync][initialize] Action: Sync both sides (merge)');
        console.log('[Sync][initialize] Checking for conflicts in merge decision');

        const { data: cloudFillups } = await supabase
          .from('fillups')
          .select('*')
          .eq('user_id', userId)
          .is('deleted_at', null);

        const localFillups = JSON.parse(localStorage.getItem('fueltracker-fillups-v2') || '[]');
        const diff = this.computeFillupDiff(localFillups, cloudFillups || []);

        console.log('[Sync][initialize] Diff computed:', {
          localOnly: diff.localOnly.length,
          cloudOnly: diff.cloudOnly.length,
          bothChanged: diff.bothChanged.length,
          localDeleted: diff.localDeleted.length,
          cloudDeleted: diff.cloudDeleted.length
        });

        if (diff.bothChanged.length > 0) {
          console.log('[Sync][initialize] Conflicts detected, returning for user resolution');
          result.needsResolution = true;
          result.conflicts = diff.bothChanged;
          result.nonConflicts = {
            localOnly: diff.localOnly,
            cloudOnly: diff.cloudOnly,
            localDeleted: diff.localDeleted,
            cloudDeleted: diff.cloudDeleted
          };
          result.message = `${diff.bothChanged.length} conflict${diff.bothChanged.length !== 1 ? 's' : ''} need resolution`;
          return result;
        }

        console.log('[Sync][initialize] No conflicts, proceeding with automatic sync');
        const mergeResult = await this.syncBothSides(userId);
        result.success = !!mergeResult?.success;
        result.message = mergeResult?.message || '';
        result.details = mergeResult?.details || [];
        result.summary = mergeResult?.summary;
        result.counts = mergeResult?.counts;

        if (result.success) {
          localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
          localStorage.setItem(MIGRATION_DECISION_KEY, 'merge');
          localStorage.removeItem(COUNTS_MATCHED_NO_CONFLICT_KEY);
          pendingSyncStatus = null;
          localStorage.removeItem(PENDING_SYNC_STATUS_KEY);
          this.setupOnlineSyncListener(userId, { decision: 'merge' });
        }

        console.log('[Sync][initialize] Merge action completed. Success:', result.success, 'Message:', result.message);
        break;
      }

      case 'keep-local': {
        console.log('[Sync][initialize] Action: Keep local only (no sync)');
        console.log('[Sync][initialize] Keeping local only, no sync');

        localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
        localStorage.setItem(MIGRATION_DECISION_KEY, 'keep-local');
        localStorage.removeItem(COUNTS_MATCHED_NO_CONFLICT_KEY);
        pendingSyncStatus = null;
        localStorage.removeItem(PENDING_SYNC_STATUS_KEY);

        result.success = true;
        result.message = 'Local data preserved. Cloud sync disabled.';
        console.log('[Sync][initialize] Keep-local action completed. Success:', result.success, 'Message:', result.message);
        break;
      }

      default: {
        console.log('[Sync][initialize] Unknown decision:', decision);
        result.success = false;
        result.message = 'Unknown migration decision.';
        break;
      }
    }
  } catch (error) {
    console.error('[Sync][initialize] Continue sync after decision exception:', error);
    result.success = false;
    result.message = error?.message || 'Sync continuation failed.';
    result.details.push(`Exception: ${error.message}`);
  }

  console.log('[Sync][initialize] Result modal to show - Title:', result.action, 'Message:', result.message);
  return result;
},

  /**
   * Silent background sync for routine mutations
   * This function is called automatically after local mutations (create/update/delete)
   * It syncs changes to the cloud without showing any modal or success messages
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Sync result (silent, no UI)
   */
  /**
   * Process local mutations in FIFO order (Outbox Pattern)
   */
  async syncAfterMutation(userId) {
    if (backgroundSyncInProgress) return backgroundSyncPromise;

    backgroundSyncInProgress = true;
    backgroundSyncPromise = (async () => {
      try {
        console.log('[Sync][outbox] Starting outbox processing');

        const migrationDecision = localStorage.getItem(MIGRATION_DECISION_KEY);
        if (migrationDecision === 'keep-local') {
          console.log('[Sync][outbox] Skipping cloud upload because migration decision is keep-local');
          return { success: true, count: 0, skipped: 'keep-local' };
        }
        
        // Use a consistent snapshot of the outbox to avoid race conditions
        const fillups = JSON.parse(localStorage.getItem('fueltracker-fillups-v2') || '[]');
        const maintenance = JSON.parse(localStorage.getItem('fueltracker-maintenance-entries-v3') || '[]');
        
        // Find all pending or failed mutations in FIFO order (by id which is timestamp or updatedAt)
        const fillupMutations = fillups
          .filter(f =>
            f.syncStatus === 'pending' ||
            (f.syncStatus === 'failed' && (f.retryCount || 0) < 3) ||
            ((f.deletedAt || f.lastAction === 'DELETE') && !f.tombstoneVerifiedAt)
          )
          .map(record => ({ record, entityKey: 'fillups' }));

        const maintenanceMutations = maintenance
          .filter(m =>
            m.syncStatus === 'pending' ||
            (m.syncStatus === 'failed' && (m.retryCount || 0) < 3) ||
            ((m.deletedAt || m.deleted_at || m.lastAction === 'DELETE') && !m.tombstoneVerifiedAt)
          )
          .map(record => ({ record, entityKey: 'maintenance' }));

        const pendingMutations = [...fillupMutations, ...maintenanceMutations]
          .sort((a, b) =>
            (a.record.updatedAt || a.record.timestamp || 0) >
            (b.record.updatedAt || b.record.timestamp || 0) ? 1 : -1
          );

        if (pendingMutations.length === 0) {
          console.log('[Sync][outbox] No pending mutations');
          return this.uploadLocalChanges(userId);
        }

        console.log(`[Sync][outbox] Processing ${pendingMutations.length} mutations`);
        let successCount = 0;

        for (const { record, entityKey } of pendingMutations) {
          if (!this.isOnline()) break;

          const result = await this.processSingleOutboxMutation(userId, record, entityKey);
          if (result.success) successCount++;
          else {
            console.warn(`[Sync][outbox] Mutation failed for ${record.id}:`, result.error);
            // Sequential processing: stop on first failure to maintain FIFO integrity for dependent records
            break; 
          }
        }

        const fallbackUpload = await this.uploadLocalChanges(userId);
        return { success: fallbackUpload.success !== false, count: successCount, fallbackUpload };
      } catch (error) {
        console.error('[Sync][outbox] Critical failure:', error);
        return { success: false, error: error.message };
      } finally {
        backgroundSyncInProgress = false;
        backgroundSyncPromise = null;
      }
    })();

    return backgroundSyncPromise;
  },

  /**
   * Process a single outbox mutation with idempotency and lifecycle management
   */
  async processSingleOutboxMutation(userId, record, entityKey) {
    const tableMap = { fillups: 'fillups', vehicles: 'vehicles', maintenance: 'maintenance' };
    const table = tableMap[entityKey];

    // 1. Mark in_progress locally
    this.updateLocalSyncStatus(entityKey, record.id, { syncStatus: 'in_progress' });

    try {
      // 2. Backfill stable_key if missing
      if (!record.stableKey) {
        console.log(`[Sync][outbox] Backfilling missing stable_key for record ${record.id}`);
        const newStableKey = uuidv4();
        this.updateLocalSyncStatus(entityKey, record.id, { stableKey: newStableKey });
        record.stableKey = newStableKey;
      }

      // 3. Prepare payload
      const payload = this.mapLocalToCloud(record, entityKey);
      payload.user_id = userId;

      if (entityKey === "fillups") {
        payload.total_cost =
          payload.total_cost ??
          (payload.liters != null && payload.price_per_liter != null
            ? Number(payload.liters) * Number(payload.price_per_liter)
            : 0);

        console.log("[Sync][outbox] fillup total_cost check", {
          stable_key: record.stableKey,
          liters: payload.liters,
          price_per_liter: payload.price_per_liter,
          total_cost: payload.total_cost,
        });
      }

      // 3. Replay-safe idempotency check (Identity + Metadata)
      // Check if cloud already has a newer or identical version
      const { data: existing, error: fetchError } = await supabase
        .from(table)
        .select('updated_at, deleted_at')
        .eq('stable_key', record.stableKey)
        .maybeSingle();

      if (fetchError) {
        console.error(`[Sync][outbox] Error fetching existing record ${record.stableKey}:`, fetchError);
      }

      if (existing) {
        const cloudUpdated = new Date(existing.updated_at).getTime();
        const localUpdated = new Date(record.updatedAt).getTime();
        const diffMs = cloudUpdated - localUpdated;

        console.log(`[Sync][reconcile] Comparing ${record.stableKey}:`, {
          localUpdatedAt: record.updatedAt,
          cloudUpdatedAt: existing.updated_at,
          diffMs,
          isCloudNewer: diffMs > 1000 // 1s buffer for clock skew
        });

        // No-resurrection rule: if cloud is already deleted, don't update unless this is also a delete
        if (existing.deleted_at && record.lastAction !== 'DELETE') {
          console.log(`[Sync][outbox] Idempotency: Cloud record ${record.stableKey} is already deleted. Keeping deleted.`);
          this.updateLocalSyncStatus(entityKey, record.id, { 
            syncStatus: 'synced', 
            deletedAt: existing.deleted_at,
            lastAction: 'DELETE' 
          });
          return { success: true };
        }

        // Newer cloud data wins for updates. Local deletes are tombstones and
        // should still be applied so deleted records do not reappear.
        if (diffMs > 1000 && record.lastAction !== 'DELETE') {
          console.log(`[Sync][outbox] Idempotency: Cloud has newer version for ${record.stableKey} by ${diffMs}ms. Triggering conflict.`);
          this.updateLocalSyncStatus(entityKey, record.id, { syncStatus: 'conflict' });
          return { success: false, error: 'conflict' };
        }
      }

      // 4. Perform Cloud Mutation
      // Strategy: filter by (user_id + stable_key); UPDATE if row exists, INSERT if not.
      // This avoids relying on DB-side on_conflict=stable_key which requires a unique constraint
      // that may not exist as a plain single-column index.
      let error;
      console.log(`[Sync][outbox] Operation: ${record.lastAction}, table: ${table}, stable_key: ${record.stableKey}`);
      console.log(`[Sync][outbox] Payload keys:`, Object.keys(payload));
      console.log(`[Sync][outbox] Payload:`, JSON.stringify(payload, null, 2));

      if (record.lastAction === 'DELETE') {
        // Tombstone: set deleted_at
        const tombstonePayload = {
          deleted_at: record.deletedAt || new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const { data: tombstonedByStableKey, error: stableKeyDeleteError } = await supabase
          .from(table)
          .update(tombstonePayload)
          .eq('stable_key', record.stableKey)
          .eq('user_id', userId)
          .select('id, stable_key');

        error = stableKeyDeleteError;

        if (!error && (!tombstonedByStableKey || tombstonedByStableKey.length === 0)) {
          console.warn(`[Sync][outbox] Tombstone by stable_key matched 0 rows for ${record.stableKey}`);

          if (this.isValidUuid(record.id)) {
            const { data: tombstonedById, error: idDeleteError } = await supabase
              .from(table)
              .update(tombstonePayload)
              .eq('id', record.id)
              .eq('user_id', userId)
              .select('id, stable_key');

            error = idDeleteError;

            if (!error && (!tombstonedById || tombstonedById.length === 0)) {
              error = {
                code: 'NO_TOMBSTONE_TARGET',
                message: `No cloud ${entityKey} row matched delete for stable_key ${record.stableKey} or id ${record.id}`,
              };
            }
          } else {
            error = {
              code: 'NO_TOMBSTONE_TARGET',
              message: `No cloud ${entityKey} row matched delete for stable_key ${record.stableKey}`,
            };
          }
        }

        console.log(`[Sync][outbox] Tombstone sent for ${record.stableKey}, error:`, error?.message ?? 'none');
      } else {
        // Upsert: try UPDATE first; if no rows affected, INSERT
        const { data: updated, error: updateErr } = await supabase
          .from(table)
          .update(payload)
          .eq('stable_key', record.stableKey)
          .eq('user_id', userId)
          .select('stable_key');

        if (updateErr) {
          console.error(`[Sync][outbox] UPDATE failed for ${record.stableKey} (code: ${updateErr.code}):`, updateErr.message);
          error = updateErr;
        } else if (!updated || updated.length === 0) {
          // Row doesn't exist yet — INSERT
          console.log(`[Sync][outbox] No existing row for ${record.stableKey}, inserting`);
          const { error: insertErr } = await supabase
            .from(table)
            .insert(payload);
          if (insertErr) {
            console.error(`[Sync][outbox] INSERT failed for ${record.stableKey} (code: ${insertErr.code}):`, insertErr.message);
            error = insertErr;
          } else {
            console.log(`[Sync][outbox] INSERT succeeded for ${record.stableKey}`);
          }
        } else {
          console.log(`[Sync][outbox] UPDATE succeeded for ${record.stableKey}`);
        }
      }

      if (error) {
        console.error(`[Sync][outbox] Write error (code: ${error.code}):`, error.message);
        throw error;
      }

      // 5. Mark synced
      this.updateLocalSyncStatus(entityKey, record.id, {
        syncStatus: 'synced',
        retryCount: 0,
        ...(record.lastAction === 'DELETE' ? { tombstoneVerifiedAt: new Date().toISOString() } : {})
      });
      return { success: true };

    } catch (err) {
      const retryCount = (record.retryCount || 0) + 1;
      this.updateLocalSyncStatus(entityKey, record.id, { 
        syncStatus: 'failed', 
        retryCount,
        lastError: err.message
      });
      return { success: false, error: err.message };
    }
  },

  /**
   * Internal helper to update a single record's sync metadata locally
   */
  updateLocalSyncStatus(entityKey, id, updates) {
    const localKeyMap = {
      fillups: 'fueltracker-fillups-v2',
      vehicles: 'fueltracker-vehicles-v2',
      maintenance: 'fueltracker-maintenance-entries-v3'
    };
    const localKey = localKeyMap[entityKey];
    if (!localKey) return;

    const records = JSON.parse(localStorage.getItem(localKey) || '[]');
    const updated = records.map(r => r.id === id ? { ...r, ...updates } : r);
    localStorage.setItem(localKey, JSON.stringify(updated));
    
    // Broadcast change for UI
    window.dispatchEvent(new CustomEvent('local-data-changed', { detail: { entityKey } }));
  },

  /**
   * Map local record to Cloud schema
   */
  mapLocalToCloud(record, entityKey) {
    if (entityKey === 'fillups') {
      const now = new Date().toISOString();
      const fillupDate = record.date ||
        (record.timestamp ? new Date(record.timestamp).toISOString().split('T')[0] : null);

      return {
        // Identity
        stable_key: record.stableKey,
        user_id: null, // Caller must set this
        // Ownership
        vehicle_id: record.vehicleId,
        // Data fields — snake_case only, no camelCase, no 'timestamp'
        date: fillupDate,
        created_at: record.createdAt || now,
        odometer: record.odometer,
        liters: record.liters,
        price_per_liter: record.pricePerLiter,
        total_cost: record.totalCost ??
          ((record.liters != null && record.pricePerLiter != null)
            ? Number(record.liters) * Number(record.pricePerLiter)
            : 0),
        station: record.station || null,
        full_tank: record.fullTank !== undefined ? record.fullTank : true,
        notes: record.notes || null,
        // Sync metadata
        updated_at: record.updatedAt || now,
        deleted_at: record.deletedAt || null
      };
    }
    if (entityKey === 'maintenance') {
      const now = new Date().toISOString();
      let nestedMeta = {};
      if (typeof record.description === 'string') {
        try {
          const trimmed = record.description.trim();
          if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            nestedMeta = JSON.parse(trimmed);
          }
        } catch {
          console.log('[Sync][mapLocalToCloud] Maintenance description is plain text.');
        }
      }
      const maintenanceDate = record.date ||
        (record.timestamp ? new Date(record.timestamp).toISOString().split('T')[0] : null) ||
        (record.createdAt ? new Date(record.createdAt).toISOString().split('T')[0] : now.split('T')[0]);
      const odometer = record.odometer ?? record.performedAtODO ?? null;
      const distance = record.distance ?? record.intervalKm ?? nestedMeta.distance ?? null;
      const safety = record.safety ?? record.safetyMarginKm ?? nestedMeta.safety ?? null;
      const notes = record.notes ?? nestedMeta.notes ?? '';
      const nextDueOdometer = record.next_due_odometer ??
        record.nextDueOdometer ??
        record.nextDueODO ??
        (odometer != null && distance != null ? Number(odometer) + Number(distance) : null);

      return {
        stable_key: record.stableKey || record.stable_key,
        user_id: null,
        vehicle_id: record.vehicleId || record.vehicle_id,
        date: maintenanceDate,
        type: record.type || null,
        description: JSON.stringify({ distance, safety, notes }),
        cost: record.cost !== undefined && record.cost !== null && record.cost !== '' ? Number(record.cost) : null,
        odometer: odometer !== null ? Number(odometer) : null,
        next_due_date: record.nextDueDate || record.next_due_date || null,
        next_due_odometer: nextDueOdometer,
        created_at: record.createdAt || record.created_at || now,
        updated_at: record.updatedAt || record.updated_at || now,
        deleted_at: record.deletedAt || record.deleted_at || null,
        subcategory_stable_key: record.subcategoryStableKey || record.subcategory_stable_key || null,
        subcategory_type_key: record.subcategoryTypeKey || record.subcategory_type_key || null,
        system_stable_key: record.systemStableKey || record.system_stable_key || null,
        subcategory_name_snapshot: record.subcategoryNameSnapshot || record.subcategory_name_snapshot || null
      };
    }
    return record;
  },

  /**
   * Queue a background sync for later processing
   * This is called when offline or when sync fails
   * @returns {void}
   */
  queueBackgroundSync() {
    console.log('[Sync][background] Queuing background sync');
    localStorage.setItem(BACKGROUND_SYNC_LOCK_KEY, Date.now().toString());
  },

  /**
   * Compute diff between local and cloud data for any entity
   * @param {Array} localRecords - Local records
   * @param {Array} cloudRecords - Cloud records
   * @param {string} type - Entity type ('vehicle', 'fillup', 'maintenance', 'trip')
   * @returns {Object} Diff classification
   */
  /**
   * Normalize legacy records - ensures all records have stableKey and updatedAt
   */
  normalizeLegacyRecords(records) {
    let changed = false;
    const normalized = records.map(r => {
      let recordChanged = false;
      const updates = {};
      
      if (!r.stableKey) {
        updates.stableKey = isValidUuid(r.id) ? r.id : uuidv4();
        recordChanged = true;
      }
      
      if (!r.updatedAt) {
        updates.updatedAt = r.timestamp || r.createdAt || new Date().toISOString();
        recordChanged = true;
      }

      if (recordChanged) {
        changed = true;
        return { ...r, ...updates };
      }
      return r;
    });
    
    return { normalized, changed };
  },

  computeDiff(localRecords, cloudRecords, type) {
    const { normalized: normalizedLocal } = this.normalizeLegacyRecords(localRecords || []);
    const { normalized: normalizedCloud } = this.normalizeLegacyRecords(cloudRecords || []);
    
    // Only compare records that aren't deleted
    const activeLocal = normalizedLocal.filter(r => !r.deletedAt && r.lastAction !== 'DELETE' && !r.deleted_at);
    const activeCloud = normalizedCloud.filter(r => !r.deleted_at);

    const diff = {
      localOnly: [],
      cloudOnly: [],
      bothChanged: [],
      localDeleted: [],
      cloudDeleted: [],
      identical: []
    };

    const localMap = new Map();
    const cloudMap = new Map();

    activeLocal.forEach(r => {
      const key = r.stableKey || r.id;
      localMap.set(key, r);
    });

    activeCloud.forEach(r => {
      const key = r.stable_key || r.id;
      cloudMap.set(key, r);
    });

    // Content comparison fields per type
    const fieldMap = {
      vehicle: {
        name: 'name', tank_capacity: 'tankCapacity', make: 'make', 
        model: 'model', year: 'year', fuel_type: 'fuelType', license_plate: 'licensePlate'
      },
      fillup: {
        odometer: 'odometer', liters: 'liters', pricePerLiter: 'price_per_liter',
        totalCost: 'total_cost', station: 'station', notes: 'notes', fullTank: 'full_tank'
      },
      maintenance: {
        type: 'type',
        date: 'date',
        cost: 'cost',
        odometer: 'odometer',
        description: 'description',
        next_due_date: 'nextDueDate',
        next_due_odometer: 'nextDueOdometer'
      }
      // Add other entities as needed
    };

    const fields = fieldMap[type] || {};

    localMap.forEach((local, key) => {
      const cloud = cloudMap.get(key);
      
      if (!cloud) {
        if (local.deletedAt || local.lastAction === 'DELETE') {
          diff.localDeleted.push(local);
        } else {
          diff.localOnly.push(local);
        }
      } else {
        // Strict Tombstone & Delete-Wins Logic
        const isLocalDeleted = !!(local.deletedAt || local.lastAction === 'DELETE');
        const isCloudDeleted = !!cloud.deleted_at;

        if (isLocalDeleted && !isCloudDeleted) {
          diff.localDeleted.push(local);
        } else if (!isLocalDeleted && isCloudDeleted) {
          diff.cloudDeleted.push(local);
        } else if (isLocalDeleted && isCloudDeleted) {
          diff.identical.push({ local, cloud });
        } else {
          const localUpdated = local.updatedAt || local.timestamp;
          const cloudUpdated = cloud.updated_at || cloud.created_at;

          let contentChanged = false;
          if (type === 'maintenance') {
            contentChanged = !maintenancePayloadMatchesCloud(this.mapLocalToCloud(local, 'maintenance'), cloud);
          } else {
            // Check fields for content change
            for (const [cloudField, localField] of Object.entries(fields)) {
              if (String(local[localField]) !== String(cloud[cloudField])) {
                contentChanged = true;
                break;
              }
            }
          }

          if (contentChanged) {
            const localTime = new Date(localUpdated).getTime();
            const cloudTime = new Date(cloudUpdated).getTime();
            
            // Replay-safe reconciliation: latest updated wins
            // but delete-wins is handled above by strict tombstone logic
            const winner = localTime > cloudTime ? 'local' : 'cloud';
            
            diff.bothChanged.push({
              local, cloud, winner,
              localUpdated, cloudUpdated, type
            });
          } else {
            diff.identical.push({ local, cloud });
          }
        }
      }
    });

    cloudMap.forEach((cloud, key) => {
      if (!localMap.has(key)) {
        if (cloud.deleted_at) {
          diff.cloudDeleted.push(cloud);
        } else {
          diff.cloudOnly.push(cloud);
        }
      }
    });

    return diff;
  },

  /**
   * Get detailed sync diff for all entities
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Aggregated diff
   */
  async getDetailedSyncDiff(userId) {
    const categories = [
      { key: 'vehicles', table: 'vehicles', type: 'vehicle', localKey: 'fueltracker-vehicles-v2' },
      { key: 'fillups', table: 'fillups', type: 'fillup', localKey: 'fueltracker-fillups-v2' },
      { key: 'maintenance', table: 'maintenance', type: 'maintenance', localKey: 'fueltracker-maintenance-entries-v3' },
      { key: 'tripEstimates', table: 'trip_estimates', type: 'trip', localKey: 'fueltracker-trip-estimates-v2' }
    ];

    const detailedDiff = {
      summary: {
        localOnly: 0,
        cloudOnly: 0,
        bothChanged: 0,
        localDeleted: 0,
        cloudDeleted: 0,
        total: 0
      },
      entities: {},
      conflicts: [],
      nonConflicts: {
        localOnly: [],
        cloudOnly: [],
        localDeleted: [],
        cloudDeleted: []
      }
    };

    for (const cat of categories) {
      const localRecords = JSON.parse(localStorage.getItem(cat.localKey) || '[]');
      const { data: cloudRecords } = await supabase.from(cat.table).select('*').eq('user_id', userId);
      
      const diff = this.computeDiff(localRecords, cloudRecords || [], cat.type);
      detailedDiff.entities[cat.key] = diff;
      
      detailedDiff.summary.localOnly += diff.localOnly.length;
      detailedDiff.summary.cloudOnly += diff.cloudOnly.length;
      detailedDiff.summary.bothChanged += diff.bothChanged.length;
      detailedDiff.summary.localDeleted += diff.localDeleted.length;
      detailedDiff.summary.cloudDeleted += diff.cloudDeleted.length;
      detailedDiff.summary.total =
        detailedDiff.summary.localOnly +
        detailedDiff.summary.cloudOnly +
        detailedDiff.summary.bothChanged +
        detailedDiff.summary.localDeleted +
        detailedDiff.summary.cloudDeleted;

      detailedDiff.conflicts.push(...diff.bothChanged);
      
      detailedDiff.nonConflicts.localOnly.push(...diff.localOnly.map(r => ({ ...r, entityType: cat.key })));
      detailedDiff.nonConflicts.cloudOnly.push(...diff.cloudOnly.map(r => ({ ...r, entityType: cat.key })));
      detailedDiff.nonConflicts.localDeleted.push(...diff.localDeleted.map(r => ({ ...r, entityType: cat.key })));
      detailedDiff.nonConflicts.cloudDeleted.push(...diff.cloudDeleted.map(r => ({ ...r, entityType: cat.key })));
    }

    const taxonomyDiff = await this.getMaintenanceTaxonomyDiff(userId);
    detailedDiff.entities.maintenanceTaxonomy = taxonomyDiff;
    detailedDiff.summary.localOnly += taxonomyDiff.localOnly.length;
    detailedDiff.summary.cloudOnly += taxonomyDiff.cloudOnly.length;
    detailedDiff.summary.bothChanged += taxonomyDiff.bothChanged.length;
    detailedDiff.summary.localDeleted += taxonomyDiff.localDeleted.length;
    detailedDiff.summary.cloudDeleted += taxonomyDiff.cloudDeleted.length;
    detailedDiff.nonConflicts.localOnly.push(...taxonomyDiff.localOnly.map(r => ({ ...r, entityType: 'maintenanceTaxonomy' })));
    detailedDiff.nonConflicts.cloudOnly.push(...taxonomyDiff.cloudOnly.map(r => ({ ...r, entityType: 'maintenanceTaxonomy' })));
    detailedDiff.nonConflicts.localDeleted.push(...taxonomyDiff.localDeleted.map(r => ({ ...r, entityType: 'maintenanceTaxonomy' })));
    detailedDiff.nonConflicts.cloudDeleted.push(...taxonomyDiff.cloudDeleted.map(r => ({ ...r, entityType: 'maintenanceTaxonomy' })));

    detailedDiff.summary.total =
      detailedDiff.summary.localOnly +
      detailedDiff.summary.cloudOnly +
      detailedDiff.summary.bothChanged +
      detailedDiff.summary.localDeleted +
      detailedDiff.summary.cloudDeleted;

    return detailedDiff;
  },

  /**
   * Compute diff between local and cloud data for fill-ups
   * @param {Array} localFillups - Local fill-up records
   * @param {Array} cloudFillups - Cloud fill-up records
   * @returns {Object} Diff classification
   */
  computeFillupDiff(localFillups, cloudFillups) {
    const diff = {
      localOnly: [],
      cloudOnly: [],
      bothChanged: [],
      localDeleted: [],
      cloudDeleted: [],
      identical: []
    };

    // Create maps for efficient lookup
    const localMap = new Map();
    const cloudMap = new Map();

    // Index local records by stable_key (or id as fallback)
    localFillups.forEach(f => {
      const key = f.stableKey || f.id;
      localMap.set(key, f);
    });

    // Index cloud records by stable_key (or id as fallback)
    cloudFillups.forEach(f => {
      const key = f.stable_key || f.id;
      cloudMap.set(key, f);
    });

    // Find local-only and both-changed records
    localMap.forEach((local, key) => {
      const cloud = cloudMap.get(key);
      if (!cloud) {
        // Record exists locally but not in cloud
        if (local.deletedAt) {
          diff.localDeleted.push(local);
        } else {
          diff.localOnly.push(local);
        }
      } else {
        // Record exists in both
        if (local.deletedAt && !cloud.deleted_at) {
          diff.localDeleted.push(local);
        } else if (!local.deletedAt && cloud.deleted_at) {
          diff.cloudDeleted.push(local);
        } else if (local.deletedAt && cloud.deleted_at) {
          // Both deleted - identical
          diff.identical.push({ local, cloud });
        } else {
          // Both active - check if changed
          const localUpdated = local.updatedAt || local.timestamp;
          const cloudUpdated = cloud.updated_at || cloud.created_at;
          
          // Compare key fields for content changes
          const contentChanged = 
            local.odometer !== cloud.odometer ||
            local.liters !== cloud.liters ||
            local.pricePerLiter !== cloud.price_per_liter ||
            local.totalCost !== cloud.total_cost ||
            local.station !== cloud.station ||
            local.notes !== cloud.notes ||
            local.fullTank !== cloud.full_tank;

          if (contentChanged) {
            // Determine winner based on updated_at
            const localTime = new Date(localUpdated).getTime();
            const cloudTime = new Date(cloudUpdated).getTime();
            const winner = localTime > cloudTime ? 'local' : 'cloud';
            
            diff.bothChanged.push({
              local,
              cloud,
              winner,
              localUpdated: localUpdated,
              cloudUpdated: cloudUpdated
            });
          } else {
            diff.identical.push({ local, cloud });
          }
        }
      }
    });

    // Find cloud-only records
    cloudMap.forEach((cloud, key) => {
      if (!localMap.has(key)) {
        // Record exists in cloud but not locally
        if (cloud.deleted_at) {
          diff.cloudDeleted.push(cloud);
        } else {
          diff.cloudOnly.push(cloud);
        }
      }
    });

    return diff;
  },

  /**
   * Apply diff to local and cloud based on sync action
   * @param {Object} diff - Diff classification from computeFillupDiff
   * @param {string} action - Sync action: 'sync-both', 'upload-local', 'replace-local'
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Result summary
   */
  /**
   * Apply diff to local and cloud based on sync action
   * @param {Object} diff - Diff classification
   * @param {string} action - Sync action
   * @param {string} type - Entity type
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Result summary
   */
  async applyDiff(diff, action, type, userId) {
  const result = {
    uploaded: 0,
    downloaded: 0,
    deletedFromCloud: 0,
    deletedFromLocal: 0,
    conflictsResolved: 0,
    errors: []
  };

  try {
    switch (action) {
      case 'sync-both':
        result.uploaded += diff.localOnly.length;
        result.downloaded += diff.cloudOnly.length;
        result.deletedFromCloud += diff.localDeleted.length;
        result.deletedFromLocal += diff.cloudDeleted.length;

        for (const record of diff.localOnly) {
          await this.uploadSingle(record, type, userId);
        }

        for (const record of diff.cloudOnly) {
          await this.downloadSingle(record, type);
        }

        for (const record of diff.localDeleted) {
          if (isValidUuid(record.stableKey || record.id)) {
            await this.deleteFromCloud(record, type, userId);
          }
        }

        for (const record of diff.cloudDeleted) {
          await this.deleteFromLocal(record, type);
        }

        for (const conflict of diff.bothChanged) {
          if (conflict.winner === 'local') {
            await this.uploadSingle(conflict.local, type, userId);
          } else {
            await this.downloadSingle(conflict.cloud, type);
          }
          result.conflictsResolved++;
        }
        break;

      case 'upload-local':
        result.uploaded += diff.localOnly.length + diff.bothChanged.length;
        result.deletedFromCloud += diff.localDeleted.length;

        for (const record of diff.localOnly) {
          await this.uploadSingle(record, type, userId);
        }

        for (const record of diff.localDeleted) {
          if (isValidUuid(record.stableKey || record.id)) {
            await this.deleteFromCloud(record, type, userId);
          }
        }

        for (const conflict of diff.bothChanged) {
          await this.uploadSingle(conflict.local, type, userId);
          result.conflictsResolved++;
        }
        break;

      case 'replace-local':
        result.downloaded += diff.cloudOnly.length + diff.bothChanged.length;
        result.deletedFromLocal += diff.cloudDeleted.length + diff.localOnly.length;

        for (const record of diff.cloudOnly) {
          await this.downloadSingle(record, type);
        }

        for (const record of diff.localOnly) {
          await this.deleteFromLocal(record, type);
        }

        for (const record of diff.cloudDeleted) {
          await this.deleteFromLocal(record, type);
        }

        for (const conflict of diff.bothChanged) {
          await this.downloadSingle(conflict.cloud, type);
          result.conflictsResolved++;
        }
        break;
    }
  } catch (error) {
    console.error(`[Sync][applyDiff] Error applying diff for ${type}:`, error);
    result.errors.push(error.message);
  }

  return result;
},

  /**
   * Upload a single record of any type
   */
  async uploadSingle(record, type, userId) {
    console.log(`[Sync][uploadSingle] Type: ${type}, Record ID: ${record.id}, stableKey: ${record.stableKey}`);
    
    // Guardrail: Check if handler exists before calling
    switch (type) {
      case 'vehicle':
        if (typeof this.uploadSingleVehicle !== 'function') {
          const error = `uploadSingleVehicle handler does not exist for entity type: ${type}`;
          console.error(`[Sync][uploadSingle] ${error}`);
          throw new Error(error);
        }
        return this.uploadSingleVehicle(record, userId);
      case 'fillup':
        if (typeof this.uploadSingleFillup !== 'function') {
          const error = `uploadSingleFillup handler does not exist for entity type: ${type}`;
          console.error(`[Sync][uploadSingle] ${error}`);
          throw new Error(error);
        }
        return this.uploadSingleFillup(record, userId);
      case 'maintenance':
        if (typeof this.uploadSingleMaintenance !== 'function') {
          const error = `uploadSingleMaintenance handler does not exist for entity type: ${type}`;
          
          throw new Error(error);
        }
        return this.uploadSingleMaintenance(record, userId);
      case 'trip':
        if (typeof this.uploadSingleTripEstimate !== 'function') {
          const error = `uploadSingleTripEstimate handler does not exist for entity type: ${type}`;
          console.error(`[Sync][uploadSingle] ${error}`);
          throw new Error(error);
        }
        return this.uploadSingleTripEstimate(record, userId);
      default: {
        const error = `Unknown entity type: ${type}`;
        console.error(`[Sync][uploadSingle] ${error}`);
        throw new Error(error);
      }
    }
  },


  /**
   * Apply diff to local and cloud based on sync action (legacy wrapper)
   */
  async applyFillupDiff(diff, action, userId) {
    return this.applyDiff(diff, action, 'fillup', userId);
  },

  /**
   * Upload a single vehicle to cloud
   * @param {Object} vehicle - Local vehicle record
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async uploadSingleVehicle(vehicle, userId) {
    // Validate inputs before making request
    if (!userId) {
      const error = 'userId is required but was undefined';
      console.error(`[Sync][uploadSingleVehicle] Validation failed: ${error}`);
      console.error(`[Sync][uploadSingleVehicle] Caller: ${new Error().stack}`);
      throw new Error(error);
    }
    if (!this.isValidUuid(userId)) {
      const error = `userId is not a valid UUID: ${userId}`;
      console.error(`[Sync][uploadSingleVehicle] Validation failed: ${error}`);
      throw new Error(error);
    }
    if (!vehicle.stableKey) {
      const error = 'stableKey is required but was undefined';
      console.error(`[Sync][uploadSingleVehicle] Validation failed: ${error}`);
      throw new Error(error);
    }

    console.log(`[Sync][uploadSingleVehicle] Starting upload for stable_key: ${vehicle.stableKey}, userId: ${userId}`);

    const now = new Date().toISOString();
    
    // First, check if a row exists with this stable_key and user_id
    const { data: existingRow, error: fetchErr } = await supabase
      .from('vehicles')
      .select('id')
      .eq('stable_key', vehicle.stableKey)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchErr) {
      console.error(`[Sync][uploadSingleVehicle] Fetch existing row failed for ${vehicle.stableKey} (code: ${fetchErr.code}):`, fetchErr.message);
      throw new Error(`Failed to check existing vehicle ${vehicle.id}: ${fetchErr.message}`);
    }

    const normalized = {
      user_id: userId,
      name: vehicle.name,
      make: vehicle.make || null,
      model: vehicle.model || null,
      year: vehicle.year || null,
      fuel_type: vehicle.fuelType || null,
      tank_capacity: vehicle.tankCapacity || null,
      license_plate: vehicle.licensePlate || null,
      stable_key: vehicle.stableKey,
      created_at: vehicle.createdAt || now,
      updated_at: vehicle.updatedAt || now,
      deleted_at: vehicle.deletedAt || null
    };

    console.log(`[Sync][uploadSingleVehicle] Payload keys:`, Object.keys(normalized));
    console.log(`[Sync][uploadSingleVehicle] Payload for vehicle ${vehicle.stableKey}:`, JSON.stringify(normalized, null, 2));

    if (existingRow) {
      // Row exists - UPDATE by id (the primary key)
      console.log(`[Sync][uploadSingleVehicle] Existing row found with id: ${existingRow.id}, updating by id`);
      const { error: updateErr } = await supabase
        .from('vehicles')
        .update(normalized)
        .eq('id', existingRow.id);

      if (updateErr) {
        console.error(`[Sync][uploadSingleVehicle] UPDATE failed for ${vehicle.stableKey} (code: ${updateErr.code}):`, updateErr.message);
        throw new Error(`Failed to update vehicle ${vehicle.id}: ${updateErr.message}`);
      }
      console.log(`[Sync][uploadSingleVehicle] UPDATE succeeded for ${vehicle.stableKey}`);
    } else {
      // Row doesn't exist - INSERT without id (let database generate it)
      console.log(`[Sync][uploadSingleVehicle] No existing row for ${vehicle.stableKey}, inserting`);
      const { error: insertErr } = await supabase.from('vehicles').insert(normalized);
      if (insertErr) {
        console.error(`[Sync][uploadSingleVehicle] INSERT failed for ${vehicle.stableKey} (code: ${insertErr.code}):`, insertErr.message);
        throw new Error(`Failed to insert vehicle ${vehicle.id}: ${insertErr.message}`);
      }
      console.log(`[Sync][uploadSingleVehicle] INSERT succeeded for ${vehicle.stableKey}`);
    }
  },

  /**
   * Build a mapping from local vehicle IDs to cloud vehicle UUIDs
   * @param {string} userId - User ID
   * @returns {Promise<Map>} Map of local vehicle ID -> cloud vehicle UUID
   */
  async buildVehicleIdMap(userId) {
    console.log('[Sync][buildVehicleIdMap] Building local->cloud vehicle ID map');
    
    const localVehicles = JSON.parse(localStorage.getItem('fueltracker-vehicles-v2') || '[]');
    const { data: cloudVehicles, error: cloudError } = await supabase
      .from('vehicles')
      .select('id, stable_key')
      .eq('user_id', userId)
      .is('deleted_at', null);

    if (cloudError) {
      console.error('[Sync][buildVehicleIdMap] Failed to fetch cloud vehicles:', cloudError.message);
      throw new Error(`Failed to fetch cloud vehicles: ${cloudError.message}`);
    }

    const vehicleIdMap = new Map();
    
    // Map by stable_key (preferred)
    const cloudVehicleByStableKey = new Map();
    (cloudVehicles || []).forEach(cv => {
      if (cv.stable_key) {
        cloudVehicleByStableKey.set(cv.stable_key, cv.id);
      }
    });

    localVehicles.forEach(lv => {
      if (lv.stableKey && cloudVehicleByStableKey.has(lv.stableKey)) {
        // Map by stable_key match
        vehicleIdMap.set(lv.id, cloudVehicleByStableKey.get(lv.stableKey));
        console.log(`[Sync][buildVehicleIdMap] Mapped local vehicle ${lv.id} -> cloud ${cloudVehicleByStableKey.get(lv.stableKey)} by stable_key`);
      } else if (this.isValidUuid(lv.id)) {
        // Direct UUID match (if local ID is already a UUID and exists in cloud)
        const cloudMatch = (cloudVehicles || []).find(cv => cv.id === lv.id);
        if (cloudMatch) {
          vehicleIdMap.set(lv.id, cloudMatch.id);
          console.log(`[Sync][buildVehicleIdMap] Mapped local vehicle ${lv.id} -> cloud ${cloudMatch.id} by direct UUID match`);
        }
      }
    });

    console.log(`[Sync][buildVehicleIdMap] Built map with ${vehicleIdMap.size} mappings`);
    return vehicleIdMap;
  },

  /**
   * Upload a single fill-up to cloud
   * @param {Object} fillup - Local fill-up record
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async uploadSingleFillup(fillup, userId) {
    // Validate inputs before making request
    if (!userId) {
      const error = 'userId is required but was undefined';
      console.error(`[Sync][uploadSingleFillup] Validation failed: ${error}`);
      console.error(`[Sync][uploadSingleFillup] Caller: ${new Error().stack}`);
      throw new Error(error);
    }
    if (!this.isValidUuid(userId)) {
      const error = `userId is not a valid UUID: ${userId}`;
      console.error(`[Sync][uploadSingleFillup] Validation failed: ${error}`);
      throw new Error(error);
    }
    if (!fillup.stableKey) {
      const error = 'stableKey is required but was undefined';
      console.error(`[Sync][uploadSingleFillup] Validation failed: ${error}`);
      throw new Error(error);
    }

    // Preflight validation: vehicle_id must be a valid UUID or mappable
    if (!fillup.vehicleId) {
      const error = 'vehicleId is required but was undefined';
      console.error(`[Sync][uploadSingleFillup] Validation failed: ${error}`);
      throw new Error(error);
    }
    
    // Check if vehicleId is a placeholder like "default"
    if (fillup.vehicleId === 'default' || fillup.vehicleId === '' || !this.isValidUuid(fillup.vehicleId)) {
      // Try to map local vehicle ID to cloud vehicle UUID
      console.log(`[Sync][uploadSingleFillup] vehicleId "${fillup.vehicleId}" is not a valid UUID, attempting to map`);
      const vehicleIdMap = await this.buildVehicleIdMap(userId);
      const cloudVehicleId = vehicleIdMap.get(fillup.vehicleId);
      
      if (!cloudVehicleId) {
        const error = `Cannot map vehicleId "${fillup.vehicleId}" to a valid cloud vehicle UUID. Vehicle must be synced first.`;
        console.error(`[Sync][uploadSingleFillup] Validation failed: ${error}`);
        throw new Error(error);
      }
      
      fillup.vehicleId = cloudVehicleId;
      console.log(`[Sync][uploadSingleFillup] Mapped vehicleId to cloud UUID: ${cloudVehicleId}`);
    }

    console.log(`[Sync][uploadSingleFillup] Starting upload for stable_key: ${fillup.stableKey}, userId: ${userId}, vehicleId: ${fillup.vehicleId}`);

    const now = new Date().toISOString();
    
    // First, check if a row exists with this stable_key and user_id
    const { data: existingRow, error: fetchErr } = await supabase
      .from('fillups')
      .select('id')
      .eq('stable_key', fillup.stableKey)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchErr) {
      console.error(`[Sync][uploadSingleFillup] Fetch existing row failed for ${fillup.stableKey} (code: ${fetchErr.code}):`, fetchErr.message);
      throw new Error(`Failed to check existing fillup ${fillup.id}: ${fetchErr.message}`);
    }

    // Compute total_cost if not provided (required field in Supabase)
    const computedTotalCost =
      fillup.totalCost ??
      ((fillup.liters != null && fillup.pricePerLiter != null)
        ? Number(fillup.liters) * Number(fillup.pricePerLiter)
        : 0);

    const normalized = {
      user_id: userId,
      vehicle_id: fillup.vehicleId,
      date: fillup.date || fillup.timestamp,  // Use date field if available, otherwise use timestamp (actual fill-up date)
      odometer: fillup.odometer,
      liters: fillup.liters,
      price_per_liter: fillup.pricePerLiter,
      total_cost: computedTotalCost,  // Computed if null
      station: fillup.station || null,
      notes: fillup.notes || null,
      full_tank: fillup.fullTank !== undefined ? fillup.fullTank : true,
      stable_key: fillup.stableKey,
      created_at: fillup.createdAt || now,  // When the record was created in the app
      updated_at: fillup.updatedAt || now,
      deleted_at: fillup.deletedAt || null
    };

    console.log(`[Sync][uploadSingleFillup] Payload keys:`, Object.keys(normalized));
    console.log(`[Sync][uploadSingleFillup] Payload for fillup ${fillup.stableKey}:`, JSON.stringify(normalized, null, 2));

    if (existingRow) {
      // Row exists - UPDATE by id (the primary key)
      console.log(`[Sync][uploadSingleFillup] Existing row found with id: ${existingRow.id}, updating by id`);
      const { error: updateErr } = await supabase
        .from('fillups')
        .update(normalized)
        .eq('id', existingRow.id);

      if (updateErr) {
        console.error(`[Sync][uploadSingleFillup] UPDATE failed for ${fillup.stableKey} (code: ${updateErr.code}):`, updateErr.message);
        throw new Error(`Failed to update fillup ${fillup.id}: ${updateErr.message}`);
      }
      console.log(`[Sync][uploadSingleFillup] UPDATE succeeded for ${fillup.stableKey}`);
    } else {
      // Row doesn't exist - INSERT without id (let database generate it)
      console.log(`[Sync][uploadSingleFillup] No existing row for ${fillup.stableKey}, inserting`);
      const { error: insertErr } = await supabase.from('fillups').insert(normalized);
      if (insertErr) {
        console.error(`[Sync][uploadSingleFillup] INSERT failed for ${fillup.stableKey} (code: ${insertErr.code}):`, insertErr.message);
        throw new Error(`Failed to insert fillup ${fillup.id}: ${insertErr.message}`);
      }
      console.log(`[Sync][uploadSingleFillup] INSERT succeeded for ${fillup.stableKey}`);
    }
  },

  /**
   * Upload a single maintenance entry to cloud
   * @param {Object} maintenance - Local maintenance record
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async uploadSingleMaintenance(maintenance, userId) {
  console.log('[Sync][uploadSingleMaintenance] raw maintenance', maintenance);

  if (!userId) {
    const error = 'userId is required but was undefined';
    console.error(`[Sync][uploadSingleMaintenance] Validation failed: ${error}`);
    throw new Error(error);
  }

  if (!this.isValidUuid(userId)) {
    const error = `userId is not a valid UUID: ${userId}`;
    console.error(`[Sync][uploadSingleMaintenance] Validation failed: ${error}`);
    throw new Error(error);
  }

  const recordId = maintenance?.id ?? maintenance?.idx ?? 'unknown';

  if (!maintenance || (!maintenance.id && !maintenance.idx && maintenance.id !== 0)) {
    const error = 'id or idx is required but was undefined';
    console.error(`[Sync][uploadSingleMaintenance] Validation failed: ${error}`, maintenance);
    throw new Error(error);
  }

  let vehicleId = maintenance.vehicleId ?? maintenance.vehicle_id ?? null;
  const stableKey = maintenance.stableKey ?? maintenance.stable_key ?? null;
  const maintenanceDate =
    maintenance.date ??
    maintenance.maintenanceDate ??
    maintenance.maintenance_date ??
    (maintenance.timestamp ? new Date(maintenance.timestamp).toISOString().split('T')[0] : null) ??
    (maintenance.createdAt ? new Date(maintenance.createdAt).toISOString().split('T')[0] : null) ??
    (maintenance.created_at ? new Date(maintenance.created_at).toISOString().split('T')[0] : null) ??
    null;
  const maintenanceType = maintenance.type ?? null;
  const createdAt = maintenance.createdAt ?? maintenance.created_at ?? null;
  const updatedAt = maintenance.updatedAt ?? maintenance.updated_at ?? null;
  const deletedAt = maintenance.deletedAt ?? maintenance.deleted_at ?? null;

  if (!stableKey) {
    console.warn(
      `[Sync][uploadSingleMaintenance] Skipping maintenance ${recordId}: missing stableKey/stable_key`,
      maintenance
    );
    return { skipped: true, reason: 'missing_stable_key', recordId };
  }

  if (!maintenanceDate || String(maintenanceDate).trim() === '') {
    console.warn(
      `[Sync][uploadSingleMaintenance] Skipping maintenance ${recordId}: missing date`,
      maintenance
    );
    return { skipped: true, reason: 'missing_date', recordId, stableKey };
  }

  if (vehicleId) {
    if (vehicleId === 'default' || vehicleId === '' || !this.isValidUuid(vehicleId)) {
      const vehicleIdMap = await this.buildVehicleIdMap(userId);
      const cloudVehicleId = vehicleIdMap.get(vehicleId) ?? null;

      if (!cloudVehicleId || !this.isValidUuid(cloudVehicleId)) {
        console.warn(
          `[Sync][uploadSingleMaintenance] Skipping maintenance ${recordId}: cannot map vehicleId "${vehicleId}"`,
          maintenance
        );
        return { skipped: true, reason: 'unmapped_vehicle', recordId, stableKey };
      }

      vehicleId = cloudVehicleId;
    }
  }

  let nestedMeta = {};
  if (typeof maintenance.metadata === 'string') {
    try {
      nestedMeta = JSON.parse(maintenance.metadata);
    } catch {
      nestedMeta = {};
    }
  } else if (typeof maintenance.metadata === 'object' && maintenance.metadata !== null) {
    nestedMeta = maintenance.metadata;
  }

  const odometerVal =
    maintenance.odometer !== undefined && maintenance.odometer !== null
      ? Number(maintenance.odometer)
      : nestedMeta.odometer !== undefined && nestedMeta.odometer !== null
        ? Number(nestedMeta.odometer)
        : maintenance.current_odometer !== undefined && maintenance.current_odometer !== null
          ? Number(maintenance.current_odometer)
          : null;

  const distanceVal =
    maintenance.distance !== undefined && maintenance.distance !== null
      ? Number(maintenance.distance)
      : nestedMeta.distance !== undefined && nestedMeta.distance !== null
        ? Number(nestedMeta.distance)
        : maintenance.interval !== undefined && maintenance.interval !== null
          ? Number(maintenance.interval)
          : null;

  const safetyVal =
    maintenance.safety !== undefined && maintenance.safety !== null
      ? Number(maintenance.safety)
      : nestedMeta.safety !== undefined && nestedMeta.safety !== null
        ? Number(nestedMeta.safety)
        : null;

  const safeOdometerVal = Number.isNaN(odometerVal) ? null : odometerVal;
  const safeDistanceVal = Number.isNaN(distanceVal) ? null : distanceVal;
  const safeSafetyVal = Number.isNaN(safetyVal) ? null : safetyVal;

  let calculatedNextDueOdometer =
    maintenance.nextDueOdometer ??
    maintenance.next_due_odometer ??
    nestedMeta.next_due_odometer ??
    null;

  if (
    safeOdometerVal !== null &&
    safeDistanceVal !== null &&
    calculatedNextDueOdometer == null
  ) {
    calculatedNextDueOdometer = safeOdometerVal + safeDistanceVal;
  }

  const trackingMetadata = {
    distance: safeDistanceVal,
    safety: safeSafetyVal,
    notes: maintenance.description ?? maintenance.notes ?? ''
  };

  const now = new Date().toISOString();
  const { systems: localMaintenanceSystems, categories: localMaintenanceCategories } = loadLocalMaintenanceTaxonomy();
  const taxonomyMeta = getMaintenanceTaxonomyMetadata(maintenance, localMaintenanceSystems, localMaintenanceCategories);

  const normalized = {
    user_id: userId,
    vehicle_id: vehicleId,
    stable_key: stableKey,
    date: maintenanceDate,
    type: maintenanceType,
    description: JSON.stringify(trackingMetadata),
    cost: maintenance.cost !== undefined && maintenance.cost !== null ? Number(maintenance.cost) : null,
    odometer: safeOdometerVal,
    next_due_date: maintenance.nextDueDate ?? maintenance.next_due_date ?? null,
    next_due_odometer: calculatedNextDueOdometer,
    created_at: createdAt ?? now,
    updated_at: updatedAt ?? now,
    deleted_at: deletedAt,
    subcategory_stable_key: taxonomyMeta.subcategoryStableKey,
    subcategory_type_key: taxonomyMeta.subcategoryTypeKey,
    system_stable_key: taxonomyMeta.systemStableKey,
    subcategory_name_snapshot: taxonomyMeta.subcategoryNameSnapshot
  };

  console.log(
    '[Sync][maintenance] Uploading with structured metadata',
    JSON.stringify(normalized, null, 2)
  );

  const { data: existingRow, error: fetchErr } = await supabase
    .from('maintenance')
    .select('id')
    .eq('stable_key', stableKey)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchErr) {
    console.error(
      `[Sync][uploadSingleMaintenance] Fetch existing row failed for ${recordId} (code: ${fetchErr.code}):`,
      fetchErr.message
    );
    throw new Error(`Failed to check existing maintenance ${recordId}: ${fetchErr.message}`);
  }

  if (existingRow) {
    const { error: updateErr } = await supabase
      .from('maintenance')
      .update(normalized)
      .eq('id', existingRow.id);

    if (updateErr) {
      console.error('[Sync][maintenance] UPDATE ERROR', {
        code: updateErr.code,
        message: updateErr.message,
        maintenance,
        normalized
      });
      throw new Error(`Failed to update maintenance ${recordId}: ${updateErr.message}`);
    }

    return { success: true, action: 'updated', recordId, stableKey };
  } else {
    const { error: insertErr } = await supabase
      .from('maintenance')
      .insert(normalized);

    if (insertErr) {
      console.error('[Sync][maintenance] INSERT ERROR', {
        code: insertErr.code,
        message: insertErr.message,
        maintenance,
        normalized
      });
      throw new Error(`Failed to insert maintenance ${recordId}: ${insertErr.message}`);
    }

    return { success: true, action: 'inserted', recordId, stableKey };
  }
},

  /**
   * Upload a single trip estimate to cloud
   * @param {Object} trip - Local trip estimate record
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async uploadSingleTripEstimate(trip, userId) {
    // Validate inputs before making request
    if (!userId) {
      const error = 'userId is required but was undefined';
      console.error(`[Sync][uploadSingleTripEstimate] Validation failed: ${error}`);
      throw new Error(error);
    }
    if (!this.isValidUuid(userId)) {
      const error = `userId is not a valid UUID: ${userId}`;
      console.error(`[Sync][uploadSingleTripEstimate] Validation failed: ${error}`);
      throw new Error(error);
    }
    if (!trip.id) {
      const error = 'id is required but was undefined';
      console.error(`[Sync][uploadSingleTripEstimate] Validation failed: ${error}`);
      throw new Error(error);
    }

    // Preflight validation: vehicle_id must be a valid UUID or mappable
    if (trip.vehicleId) {
      if (trip.vehicleId === 'default' || trip.vehicleId === '' || !this.isValidUuid(trip.vehicleId)) {
        // Try to map local vehicle ID to cloud vehicle UUID
        
        const vehicleIdMap = await this.buildVehicleIdMap(userId);
        const cloudVehicleId = vehicleIdMap.get(trip.vehicleId);
        
        if (!cloudVehicleId) {
          const error = `Cannot map vehicleId "${trip.vehicleId}" to a valid cloud vehicle UUID. Vehicle must be synced first.`;
          console.error(`[Sync][uploadSingleTripEstimate] Validation failed: ${error}`);
          throw new Error(error);
        }
        
        trip.vehicleId = cloudVehicleId;
        
      }
    }

    const now = new Date().toISOString();
    
    // First, check if a row exists with this id and user_id
    const { data: existingRow, error: fetchErr } = await supabase
      .from('trip_estimates')
      .select('id')
      .eq('id', trip.id)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchErr) {
      console.error(`[Sync][uploadSingleTripEstimate] Fetch existing row failed for ${trip.id} (code: ${fetchErr.code}):`, fetchErr.message);
      throw new Error(`Failed to check existing trip estimate ${trip.id}: ${fetchErr.message}`);
    }

    const normalized = {
      user_id: userId,
      vehicle_id: trip.vehicleId,
      name: trip.name || null,
      distance: trip.distance || null,
      notes: trip.notes || null,
      created_at: trip.createdAt || now,
      updated_at: trip.updatedAt || now,
      deleted_at: trip.deletedAt || null
    };

    if (existingRow) {
      // Row exists - UPDATE by id (the primary key)
      const { error: updateErr } = await supabase
        .from('trip_estimates')
        .update(normalized)
        .eq('id', existingRow.id);

      if (updateErr) {
        console.error(`[Sync][uploadSingleTripEstimate] UPDATE failed for ${trip.id} (code: ${updateErr.code}):`, updateErr.message);
        throw new Error(`Failed to update trip estimate ${trip.id}: ${updateErr.message}`);
      }
    } else {
      // Row doesn't exist - INSERT without id (let database generate it)
      const { error: insertErr } = await supabase.from('trip_estimates').insert(normalized);
      if (insertErr) {
        console.error(`[Sync][uploadSingleTripEstimate] INSERT failed for ${trip.id} (code: ${insertErr.code}):`, insertErr.message);
        throw new Error(`Failed to insert trip estimate ${trip.id}: ${insertErr.message}`);
      }
    }
  },

  /**
   * Download a single fill-up from cloud to local
   * @param {Object} fillup - Cloud fill-up record
   * @returns {void}
   */
  downloadSingleFillup(fillup) {
    const mapped = this.mapCloudFillupToLocal(fillup);

    const fillups = JSON.parse(localStorage.getItem('fueltracker-fillups-v2') || '[]');
    const stableKey = fillup.stable_key || fillup.stableKey;
    const existingIndex = fillups.findIndex((f) =>
      (stableKey && (f.stableKey === stableKey || f.stable_key === stableKey)) ||
      f.id === fillup.id,
    );
    
    if (existingIndex >= 0) {
      fillups[existingIndex] = mapped;
    } else {
      fillups.push(mapped);
    }
    
    localStorage.setItem('fueltracker-fillups-v2', JSON.stringify(fillups));
  },

  mapCloudFillupToLocal(fillup) {
    return {
      id: fillup.id,
      vehicleId: fillup.vehicle_id,
      date: fillup.date,
      odometer: fillup.odometer,
      liters: fillup.liters,
      pricePerLiter: fillup.price_per_liter,
      totalCost: fillup.total_cost,
      station: fillup.station || '',
      notes: fillup.notes || '',
      fullTank: fillup.full_tank,
      timestamp: fillup.date,
      createdAt: fillup.created_at,
      updatedAt: fillup.updated_at,
      stableKey: fillup.stable_key,
      deletedAt: fillup.deleted_at,
      syncStatus: 'synced',
    };
  },

  mapCloudMaintenanceToLocal(cloudMaintenance, existing = {}) {
    let extractedDistance = null;
    let extractedSafety = null;
    let extractedNotes = cloudMaintenance.description || '';

    if (cloudMaintenance.description) {
      try {
        const trimmedDesc = String(cloudMaintenance.description).trim();
        if (trimmedDesc.startsWith('{') && trimmedDesc.endsWith('}')) {
          const parsedConfig = JSON.parse(trimmedDesc);
          extractedDistance = parsedConfig.distance !== undefined ? parsedConfig.distance : null;
          extractedSafety = parsedConfig.safety !== undefined ? parsedConfig.safety : null;
          extractedNotes = parsedConfig.notes || '';
        }
      } catch {
        console.log('[Sync] Description is regular text string.');
      }
    }

    if (
      extractedDistance === null &&
      cloudMaintenance.next_due_odometer &&
      cloudMaintenance.odometer
    ) {
      extractedDistance =
        Number(cloudMaintenance.next_due_odometer) - Number(cloudMaintenance.odometer);
    }

    const parsedOdometer =
      cloudMaintenance.odometer !== null && cloudMaintenance.odometer !== undefined
        ? Number(cloudMaintenance.odometer)
        : 0;

    const parsedNextDueOdometer =
      cloudMaintenance.next_due_odometer !== null && cloudMaintenance.next_due_odometer !== undefined
        ? Number(cloudMaintenance.next_due_odometer)
        : 0;

    const safetyMargin =
      extractedSafety ?? existing.safetyMarginKm ?? existing.safety ?? null;
    const alertODO =
      parsedNextDueOdometer > 0 && safetyMargin !== null
        ? parsedNextDueOdometer - Number(safetyMargin)
        : (existing.alertODO ?? null);
    const stableKey = cloudMaintenance.stable_key || cloudMaintenance.stableKey || existing.stableKey;

    return {
      id: existing.id || cloudMaintenance.id,
      user_id: cloudMaintenance.user_id,
      vehicle_id: cloudMaintenance.vehicle_id,
      vehicleId: cloudMaintenance.vehicle_id,
      date: cloudMaintenance.date,
      type: cloudMaintenance.type,
      cost: cloudMaintenance.cost,
      odometer: parsedOdometer,
      next_due_date: cloudMaintenance.next_due_date,
      nextDueDate: cloudMaintenance.next_due_date,
      next_due_odometer: parsedNextDueOdometer,
      stable_key: stableKey,
      stableKey,
      subcategory_stable_key: cloudMaintenance.subcategory_stable_key,
      subcategoryStableKey: cloudMaintenance.subcategory_stable_key,
      subcategory_type_key: cloudMaintenance.subcategory_type_key,
      subcategoryTypeKey: cloudMaintenance.subcategory_type_key,
      system_stable_key: cloudMaintenance.system_stable_key,
      systemStableKey: cloudMaintenance.system_stable_key,
      subcategory_name_snapshot: cloudMaintenance.subcategory_name_snapshot,
      subcategoryNameSnapshot: cloudMaintenance.subcategory_name_snapshot,
      version: cloudMaintenance.version,
      created_at: cloudMaintenance.created_at,
      updated_at: cloudMaintenance.updated_at,
      deleted_at: cloudMaintenance.deleted_at,
      deletedAt: cloudMaintenance.deleted_at,
      description: cloudMaintenance.description,
      notes: extractedNotes,
      distance: extractedDistance,
      intervalKm: extractedDistance,
      safety: safetyMargin,
      safetyMarginKm: safetyMargin,
      performedAtODO: parsedOdometer,
      nextDueOdometer: parsedNextDueOdometer,
      nextDueODO: parsedNextDueOdometer,
      alertODO,
      createdAt: cloudMaintenance.created_at,
      updatedAt: cloudMaintenance.updated_at,
      timestamp: cloudMaintenance.date || cloudMaintenance.created_at || new Date().toISOString()
    };
  },

  async searchCloudRestoreRecords(userId, options = {}) {
    if (!userId) throw new Error('User ID is required.');

    const {
      types = [],
      startDate,
      endDate,
      includeDeleted = false,
    } = options;

    if (!types.length) throw new Error('Select at least one data type to search.');
    if (!startDate || !endDate) throw new Error('A valid date range is required.');

    const searches = {};

    if (types.includes('fillups')) {
      let query = supabase
        .from('fillups')
        .select('*')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false });

      if (!includeDeleted) {
        query = query.is('deleted_at', null);
      }

      searches.fillups = query;
    }

    if (types.includes('maintenance')) {
      let query = supabase
        .from('maintenance')
        .select('*')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false });

      if (!includeDeleted) {
        query = query.is('deleted_at', null);
      }

      searches.maintenance = query;
    }

    const entries = Object.entries(searches);
    const settled = await Promise.all(
      entries.map(async ([key, query]) => {
        const { data, error } = await query;
        if (error) throw new Error(`Failed to search ${key}: ${error.message}`);
        return [key, data || []];
      }),
    );

    return settled.reduce(
      (acc, [key, records]) => ({
        ...acc,
        [key]: records,
      }),
      { fillups: [], maintenance: [] },
    );
  },

  async getDeletedFillupsByDate(userId, date) {
    if (!userId) throw new Error('User ID is required.');
    if (!date) throw new Error('A date is required.');

    const { data, error } = await supabase
      .from('fillups')
      .select('*')
      .eq('user_id', userId)
      .eq('date', date)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to load deleted fill-ups: ${error.message}`);
    }

    return data || [];
  },

  async restoreDeletedFillup(userId, fillup) {
    if (!userId) throw new Error('User ID is required.');
    if (!fillup?.id) throw new Error('Fill-up ID is required.');

    const now = new Date().toISOString();
    const stableKey = fillup.stable_key || fillup.id;
    const { data, error } = await supabase
      .from('fillups')
      .update({ deleted_at: null, updated_at: now, stable_key: stableKey })
      .eq('id', fillup.id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to restore fill-up: ${error.message}`);
    }

    const restored = this.mapCloudFillupToLocal(data);
    const fillups = JSON.parse(localStorage.getItem('fueltracker-fillups-v2') || '[]');
    const restoredKey = restored.stableKey || restored.id;
    const existingIndex = fillups.findIndex((local) =>
      (restored.stableKey && local.stableKey === restored.stableKey) ||
      local.id === restored.id
    );
    const cleanedRestored = {
      ...restored,
      deletedAt: null,
      pendingDelete: false,
      pendingDeleteRequestedAt: null,
      lastAction: 'UPDATE',
      tombstoneVerifiedAt: null,
    };

    if (existingIndex >= 0) {
      fillups[existingIndex] = {
        ...fillups[existingIndex],
        ...cleanedRestored,
        stableKey: restoredKey,
      };
    } else {
      fillups.push(cleanedRestored);
    }

    localStorage.setItem('fueltracker-fillups-v2', JSON.stringify(fillups));
    window.dispatchEvent(new CustomEvent('local-data-changed', { detail: { entityKey: 'fillups' } }));

    return cleanedRestored;
  },

  async getDeletedMaintenanceByDate(userId, date) {
    if (!userId) throw new Error('User ID is required.');
    if (!date) throw new Error('A date is required.');

    const { data, error } = await supabase
      .from('maintenance')
      .select('*')
      .eq('user_id', userId)
      .eq('date', date)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to load deleted maintenance entries: ${error.message}`);
    }

    return data || [];
  },

  async restoreDeletedMaintenance(userId, maintenance) {
    if (!userId) throw new Error('User ID is required.');
    if (!maintenance?.id) throw new Error('Maintenance entry ID is required.');

    const now = new Date().toISOString();
    const stableKey = maintenance.stable_key || maintenance.id;
    const { data, error } = await supabase
      .from('maintenance')
      .update({ deleted_at: null, updated_at: now, stable_key: stableKey })
      .eq('id', maintenance.id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to restore maintenance entry: ${error.message}`);
    }

    const before = JSON.parse(localStorage.getItem('fueltracker-maintenance-entries-v3') || '[]');
    this.downloadSingleMaintenance(data);
    const after = JSON.parse(localStorage.getItem('fueltracker-maintenance-entries-v3') || '[]');
    const restoredStableKey = data.stable_key || stableKey;
    const restored = after.find((item) =>
      (restoredStableKey && (item.stableKey === restoredStableKey || item.stable_key === restoredStableKey)) ||
      item.id === data.id
    );
    const cleanedRestored = restored ? {
      ...restored,
      deletedAt: null,
      deleted_at: null,
      pendingDelete: false,
      pendingDeleteRequestedAt: null,
      lastAction: 'UPDATE',
      tombstoneVerifiedAt: null,
      updatedAt: now,
      updated_at: now,
      stableKey: restoredStableKey,
      stable_key: restoredStableKey
    } : null;

    if (cleanedRestored) {
      const existingIndex = after.findIndex((item) =>
        (restoredStableKey && (item.stableKey === restoredStableKey || item.stable_key === restoredStableKey)) ||
        item.id === data.id
      );
      if (existingIndex >= 0) {
        after[existingIndex] = cleanedRestored;
        localStorage.setItem('fueltracker-maintenance-entries-v3', JSON.stringify(after));
      }
    } else {
      localStorage.setItem('fueltracker-maintenance-entries-v3', JSON.stringify(before));
    }

    window.dispatchEvent(new CustomEvent('local-data-changed', { detail: { entityKey: 'maintenance' } }));
    window.dispatchEvent(new Event('fueltracker-local-storage-refresh'));

    return cleanedRestored;
  },

  /**
   * Delete a fill-up from cloud (tombstone)
   * @param {Object} fillup - Local fill-up record
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async deleteFillupFromCloud(fillup, userId) {
    const { error } = await supabase
      .from('fillups')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', fillup.id)
      .eq('user_id', userId);
    
    if (error) {
      throw new Error(`Failed to delete fillup ${fillup.id} from cloud: ${error.message}`);
    }
  },

  /**
   * Delete a fill-up from local storage
   * @param {Object} fillup - Fill-up record to delete
   * @returns {void}
   */
  deleteFillupFromLocal(fillup) {
    const fillups = JSON.parse(localStorage.getItem('fueltracker-fillups-v2') || '[]');
    const filtered = fillups.filter(f => f.id !== fillup.id);
    localStorage.setItem('fueltracker-fillups-v2', JSON.stringify(filtered));
  },

  /**
   * Download a single record of any type
   */
  downloadSingle(record, type) {
    switch (type) {
      case 'vehicle': return this.downloadSingleVehicle(record);
      case 'fillup': return this.downloadSingleFillup(record);
      case 'maintenance': return this.downloadSingleMaintenance(record);
      case 'trip': return this.downloadSingleTripEstimate(record);
    }
  },

  /**
   * Download a single vehicle record from cloud to local
   */
  downloadSingleVehicle(cloudVehicle) {
    const localKey = 'fueltracker-vehicles-v2';
    const vehicles = JSON.parse(localStorage.getItem(localKey) || '[]');
    
    const mappedVehicle = {
      id: cloudVehicle.id,
      name: cloudVehicle.name,
      make: cloudVehicle.make,
      model: cloudVehicle.model,
      year: cloudVehicle.year,
      fuelType: cloudVehicle.fuel_type,
      tankCapacity: cloudVehicle.tank_capacity,
      licensePlate: cloudVehicle.license_plate,
      stableKey: cloudVehicle.stable_key,
      tyreSize: {
        width: cloudVehicle.tyre_width || '',
        aspectRatio: cloudVehicle.tyre_ratio || '',
        rimSize: cloudVehicle.tyre_rim || ''
      }
    };
    
    // Replace or add the vehicle
    const index = vehicles.findIndex(v => v.id === cloudVehicle.id);
    if (index >= 0) {
      vehicles[index] = mappedVehicle;
    } else {
      vehicles.push(mappedVehicle);
    }
    
    localStorage.setItem(localKey, JSON.stringify(vehicles));
  },

  /**
   * Download a single maintenance record from cloud to local
   */
  downloadSingleMaintenance(cloudMaintenance) {
  console.log('[Sync][downloadSingleMaintenance] raw maintenance', cloudMaintenance);

  if (!cloudMaintenance?.date) {
    console.error('[Sync][downloadSingleMaintenance] missing date', cloudMaintenance);
  }

  const localKey = 'fueltracker-maintenance-entries-v3';
  const maintenance = JSON.parse(localStorage.getItem(localKey) || '[]');
  const stableKey = cloudMaintenance.stable_key || cloudMaintenance.stableKey;

  const index = maintenance.findIndex(m =>
    (stableKey && (m.stableKey === stableKey || m.stable_key === stableKey)) ||
    (m.id && m.id === cloudMaintenance.id)
  );

  const existing = index >= 0 ? maintenance[index] : null;
  const mappedMaintenance = this.mapCloudMaintenanceToLocal(
    cloudMaintenance,
    existing || {},
  );

  if (index >= 0) {
    maintenance[index] = mappedMaintenance;
  } else {
    maintenance.push(mappedMaintenance);
  }

  localStorage.setItem(localKey, JSON.stringify(maintenance));
},

  /**
   * Download a single trip estimate record from cloud to local
   */
  downloadSingleTripEstimate(cloudTrip) {
    const localKey = 'fueltracker-trip-estimates-v2';
    const trips = JSON.parse(localStorage.getItem(localKey) || '[]');
    
    const mappedTrip = {
      id: cloudTrip.id,
      vehicleId: cloudTrip.vehicle_id,
      name: cloudTrip.name,
      distance: cloudTrip.distance,
      notes: cloudTrip.notes,
      createdAt: cloudTrip.created_at,
      stableKey: cloudTrip.stable_key,
      updatedAt: cloudTrip.updated_at,
      deletedAt: cloudTrip.deleted_at
    };
    
    // Replace or add the trip estimate
    const index = trips.findIndex(t => t.id === cloudTrip.id);
    if (index >= 0) {
      trips[index] = mappedTrip;
    } else {
      trips.push(mappedTrip);
    }
    
    localStorage.setItem(localKey, JSON.stringify(trips));
  },

  /**
   * Delete a single record from cloud
   */
  async deleteFromCloud(record, type, userId) {
    switch (type) {
      case 'vehicle': return this.deleteVehicleFromCloud(record, userId);
      case 'fillup': return this.deleteFillupFromCloud(record, userId);
      case 'maintenance': return this.deleteMaintenanceFromCloud(record, userId);
      case 'trip': return this.deleteTripFromCloud(record, userId);
    }
  },

  /**
   * Delete a vehicle from cloud (tombstone)
   */
  async deleteVehicleFromCloud(vehicle, userId) {
    const { error } = await supabase
      .from('vehicles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', vehicle.id)
      .eq('user_id', userId);
    
    if (error) {
      throw new Error(`Failed to delete vehicle ${vehicle.id} from cloud: ${error.message}`);
    }
  },

  /**
   * Delete a maintenance entry from cloud (tombstone)
   */
  async deleteMaintenanceFromCloud(maintenance, userId) {
    const tombstonePayload = { deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    const stableKey = maintenance.stableKey || maintenance.stable_key;
    let error = null;
    let matched = false;

    if (stableKey) {
      const { data, error: stableKeyError } = await supabase
        .from('maintenance')
        .update(tombstonePayload)
        .eq('stable_key', stableKey)
        .eq('user_id', userId)
        .select('id');

      error = stableKeyError;
      matched = !error && data && data.length > 0;
    }

    if (!error && !matched && maintenance.id) {
      const { data, error: idError } = await supabase
        .from('maintenance')
        .update(tombstonePayload)
        .eq('id', maintenance.id)
        .eq('user_id', userId)
        .select('id');

      error = idError;
      matched = !error && data && data.length > 0;
    }

    if (!error && !matched) {
      error = { message: `No cloud maintenance row matched ${stableKey || maintenance.id}` };
    }

    if (error) {
      throw new Error(`Failed to delete maintenance ${maintenance.id} from cloud: ${error.message}`);
    }
  },

  async hardDeleteMaintenanceFromCloud(maintenance, userId) {
    const { error } = await supabase
      .from('maintenance')
      .delete()
      .eq('id', maintenance.id)
      .eq('user_id', userId);
    
    if (error) {
      throw new Error(`Failed to delete maintenance ${maintenance.id} from cloud: ${error.message}`);
    }
  },

  /**
   * Delete a trip estimate from cloud (tombstone)
   */
  async deleteTripFromCloud(trip, userId) {
    const { error } = await supabase
      .from('trip_estimates')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', trip.id)
      .eq('user_id', userId);
    
    if (error) {
      throw new Error(`Failed to delete trip estimate ${trip.id} from cloud: ${error.message}`);
    }
  },

  /**
   * Delete a single record from local
   */
  deleteFromLocal(record, type) {
    switch (type) {
      case 'vehicle': return this.deleteVehicleFromLocal(record);
      case 'fillup': return this.deleteFillupFromLocal(record);
      case 'maintenance': return this.deleteMaintenanceFromLocal(record);
      case 'trip': return this.deleteTripFromLocal(record);
    }
  },

  /**
   * Delete a vehicle from local storage
   */
  deleteVehicleFromLocal(vehicle) {
    const vehicles = JSON.parse(localStorage.getItem('fueltracker-vehicles-v2') || '[]');
    const filtered = vehicles.filter(v => v.id !== vehicle.id);
    localStorage.setItem('fueltracker-vehicles-v2', JSON.stringify(filtered));
  },

  /**
   * Delete a maintenance entry from local storage
   */
  deleteMaintenanceFromLocal(maintenanceRecord) {
  const localKey = 'fueltracker-maintenance-entries-v3';
  const entries = JSON.parse(localStorage.getItem(localKey) || '[]');

  const targetStableKey =
    maintenanceRecord?.stableKey || maintenanceRecord?.stable_key || null;
  const targetId = maintenanceRecord?.id || null;

  const filtered = entries.filter(m => {
    const sameStableKey =
      targetStableKey &&
      (m.stableKey === targetStableKey || m.stable_key === targetStableKey);

    const sameId = targetId && m.id === targetId;

    return !(sameStableKey || sameId);
  });

  localStorage.setItem(localKey, JSON.stringify(filtered));
},

  /**
   * Delete a trip estimate from local storage
   */
  deleteTripFromLocal(trip) {
    const trips = JSON.parse(localStorage.getItem('fueltracker-trip-estimates-v2') || '[]');
    const filtered = trips.filter(t => t.id !== trip.id);
    localStorage.setItem('fueltracker-trip-estimates-v2', JSON.stringify(filtered));
  },

  /**
   * Upload local changes - local-first push to cloud
   * Enforces dependency ordering: vehicles -> fillups -> maintenance -> trips
   */
  async syncBothSides(userId, resolutionStrategy = null) {
  const result = {
    success: false,
    action: 'sync-both',
    message: '',
    details: [],
    counts: { vehicles: 0, fillups: 0, maintenance: 0, tripEstimates: 0 },
    summary: { uploaded: 0, downloaded: 0, deletedFromCloud: 0, deletedFromLocal: 0, conflictsResolved: 0 }
  };

  try {
    const detailedDiff = await this.getDetailedSyncDiff(userId);

    // 🟢 ONLY TRIGGER EARLY RETURN IF NOT RESOLVING CONFLICTS
    if (detailedDiff.conflicts.length > 0 && !resolutionStrategy) {
      result.needsResolution = true;
      result.conflicts = detailedDiff.conflicts;
      result.nonConflicts = detailedDiff.nonConflicts;
      result.summary.unchanged = detailedDiff.summary.identical;
      result.message = `${detailedDiff.conflicts.length} conflict${detailedDiff.conflicts.length !== 1 ? 's' : ''} detected that require review.`;
      return result;
    }

    const entities = [
      { key: 'vehicles', type: 'vehicle' },
      { key: 'fillups', type: 'fillup' },
      { key: 'maintenance', type: 'maintenance' },
      { key: 'tripEstimates', type: 'trip' }
    ];

    for (const ent of entities) {
      const diff = detailedDiff.entities[ent.key];
      
      // 🟢 PASS THE USER'S CHOICE INTO THE INTERNALS OF APPLYDIFF
      const strategyToApply = resolutionStrategy || 'sync-both';
      const applyResult = await this.applyDiff(diff, strategyToApply, ent.type, userId);
      
      result.summary.uploaded += applyResult.uploaded;
      result.summary.downloaded += applyResult.downloaded;
      result.summary.deletedFromCloud += applyResult.deletedFromCloud;
      result.summary.deletedFromLocal += applyResult.deletedFromLocal;
      result.summary.conflictsResolved += applyResult.conflictsResolved;
      result.counts[ent.key] = applyResult.uploaded + applyResult.downloaded;
      result.details.push(...applyResult.errors);
    }

    result.success = result.details.length === 0;
    result.message = result.success 
      ? `Sync complete: ${result.summary.uploaded} uploaded, ${result.summary.downloaded} downloaded.`
      : 'Sync completed with errors';
  } catch (error) {
    result.success = false;
    result.message = 'Sync failed';
    result.details.push(error.message);
  }

  return result;
},

  /**
   * Replace local data with cloud data - cloud-first pull
   */
  async replaceLocalWithCloud(userId) {
    const result = {
      success: false,
      action: 'replace-local',
      message: '',
      details: [],
      counts: { vehicles: 0, fillups: 0, maintenance: 0, tripEstimates: 0, maintenanceTaxonomy: 0 },
      summary: { uploaded: 0, downloaded: 0, deletedFromCloud: 0, deletedFromLocal: 0, conflictsResolved: 0 }
    };

    try {
      const detailedDiff = await this.getDetailedSyncDiff(userId);
      const entities = [
        { key: 'vehicles', type: 'vehicle' },
        { key: 'fillups', type: 'fillup' },
        { key: 'maintenance', type: 'maintenance' },
        { key: 'tripEstimates', type: 'trip' }
      ];

      for (const ent of entities) {
        const diff = detailedDiff.entities[ent.key];
        const applyResult = await this.applyDiff(diff, 'replace-local', ent.type, userId);
        
        result.summary.downloaded += applyResult.downloaded;
        result.summary.deletedFromLocal += applyResult.deletedFromLocal;
        result.summary.conflictsResolved += applyResult.conflictsResolved;
        result.counts[ent.key] = applyResult.downloaded;
        result.details.push(...applyResult.errors);
      }

      const taxonomyDownload = await this.downloadMaintenanceTaxonomy(userId, new Map(), { clearDirty: true });
      result.details.push(...taxonomyDownload.details);
      result.counts.maintenanceTaxonomy = (taxonomyDownload.systems || 0) + (taxonomyDownload.categories || 0);
      result.summary.downloaded += result.counts.maintenanceTaxonomy;

      result.success = taxonomyDownload.success !== false && !result.details.some((detail) => /failed|error|exception/i.test(detail));
      result.message = result.success 
        ? `Replacement complete: ${result.summary.downloaded} records downloaded.`
        : 'Replacement completed with errors';
    } catch (error) {
      console.error('[Sync][replaceLocalWithCloud] Replacement failed:', error);
      result.success = false;
      result.message = 'Replacement failed';
      result.details.push(error.message);
    }

    return result;
  },


  /**
   * Merge two fill-up records intelligently (last writer wins per field)
   * @param {Object} local - Local fill-up record
   * @param {Object} cloud - Cloud fill-up record
   * @returns {Object} Merged record
   */
  mergeFillupRecords(local, cloud) {
    const merged = { ...local };
    const localTime = new Date(local.updatedAt || local.timestamp).getTime();
    const cloudTime = new Date(cloud.updated_at || cloud.created_at).getTime();
    
    // Field mapping between local and cloud names
    const fieldMap = {
      odometer: 'odometer',
      liters: 'liters',
      pricePerLiter: 'price_per_liter',
      totalCost: 'total_cost',
      station: 'station',
      notes: 'notes',
      fullTank: 'full_tank'
    };
    
    // For each field, use the version with later timestamp
    Object.entries(fieldMap).forEach(([localField, cloudField]) => {
      const localValue = local[localField];
      const cloudValue = cloud[cloudField];
      
      if (localValue !== cloudValue) {
        merged[localField] = localTime > cloudTime ? localValue : cloudValue;
      }
    });
    
    // Set updated_at to the later timestamp
    merged.updatedAt = localTime > cloudTime ? (local.updatedAt || local.timestamp) : (cloud.updated_at || cloud.created_at);
    
    return merged;
  },

  /**
   * Store unresolved conflict for later resolution
   * @param {Object} conflict - Conflict object
   * @returns {void}
   */
  storeUnresolvedConflict(conflict) {
    const unresolved = JSON.parse(localStorage.getItem('fueltracker-unresolved-conflicts') || '[]');
    unresolved.push({
      id: conflict.id,
      type: 'fillup',
      local: conflict.local,
      cloud: conflict.cloud,
      detectedAt: new Date().toISOString()
    });
    localStorage.setItem('fueltracker-unresolved-conflicts', JSON.stringify(unresolved));
  },

  /**
   * Get unresolved conflicts from localStorage
   * @returns {Array} Array of unresolved conflicts
   */
  getUnresolvedConflicts() {
    return JSON.parse(localStorage.getItem('fueltracker-unresolved-conflicts') || '[]');
  },

  /**
   * Apply user resolutions to conflicts and sync non-conflict changes
  /**
   * Apply user-selected conflict resolutions and automatic changes
   * @param {Object} resolutions - Map of stableKey -> chosenResolution
   * @param {Array} conflicts - List of conflict objects
   * @param {Object} nonConflicts - Non-conflict diff categories
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Result summary
   */
  async applyResolutions(resolutions, conflicts, nonConflicts, userId) {
    
    // Validate userId before proceeding
    if (!userId) {
      const error = 'userId is required but was undefined in applyResolutions';
      console.error(`[Sync][applyResolutions] Validation failed: ${error}`);
      console.error(`[Sync][applyResolutions] Caller: ${new Error().stack}`);
      throw new Error(error);
    }
    if (!this.isValidUuid(userId)) {
      const error = `userId is not a valid UUID in applyResolutions: ${userId}`;
      console.error(`[Sync][applyResolutions] Validation failed: ${error}`);
      throw new Error(error);
    }

    const result = {
      resolved: 0,
      skipped: 0,
      uploaded: 0,
      downloaded: 0,
      errors: []
    };
    
    try {
      // 1. Repair record lookup: Use the provided conflicts array
      for (const [recordId, resolution] of Object.entries(resolutions)) {
        const conflict = conflicts.find(c => {
          const cLocal = c.local || {};
          return (cLocal.stableKey || cLocal.id) === recordId || String(cLocal.id) === String(recordId);
        });
        
        if (!conflict) {
          console.warn('[Sync][applyResolutions] Conflict not found for record:', recordId);
          continue;
        }
        
        if (resolution === 'skip') {
          result.skipped++;
        } else {
          try {
            await this.resolveSingleConflict(conflict, resolution, userId);
            result.resolved++;
          } catch (err) {
            result.errors.push(`Failed to resolve ${recordId}: ${err.message}`);
          }
        }
      }
      
      // 2. Apply non-conflict changes automatically
      const entities = [
        { key: 'vehicles', type: 'vehicle' },
        { key: 'fillups', type: 'fillup' },
        { key: 'maintenance', type: 'maintenance' },
        { key: 'tripEstimates', type: 'trip' }
      ];

      for (const ent of entities) {
        const diff = nonConflicts.entities?.[ent.key];
        if (!diff) continue;

        const applyResult = await this.applyDiff(diff, 'sync-both', ent.type, userId);
        result.uploaded += applyResult.uploaded;
        result.downloaded += applyResult.downloaded;
        if (applyResult.errors) result.errors.push(...applyResult.errors);
      }
      
      return result;
    } catch (error) {
      console.error('[Sync][applyResolutions] Global error:', error);
      result.errors.push(error.message);
    }
  },

  /**
   * Resolve a single conflict for any entity
   */
  async resolveSingleConflict(conflict, resolution, userId) {
    
    // Validate userId before proceeding
    if (!userId) {
      const error = 'userId is required but was undefined in resolveSingleConflict';
      console.error(`[Sync][resolveSingleConflict] Validation failed: ${error}`);
      console.error(`[Sync][resolveSingleConflict] Caller: ${new Error().stack}`);
      throw new Error(error);
    }
    if (!this.isValidUuid(userId)) {
      const error = `userId is not a valid UUID in resolveSingleConflict: ${userId}`;
      console.error(`[Sync][resolveSingleConflict] Validation failed: ${error}`);
      throw new Error(error);
    }

    const { local, cloud, type } = conflict;
    
    switch (resolution) {
      case 'keep-local':
        await this.uploadSingle(local, type, userId);
        break;
      case 'keep-cloud':
        this.downloadSingle(cloud, type);
        break;
      case 'merge-auto': {
        // For now, auto-merge is just keep newer, but we could do field-level later
        const localTime = new Date(local.updatedAt || local.updated_at || local.timestamp).getTime();
        const cloudTime = new Date(cloud.updated_at || cloud.created_at).getTime();
        if (localTime >= cloudTime) {
          await this.uploadSingle(local, type, userId);
        } else {
          this.downloadSingle(cloud, type);
        }
        break;
      }
    }
  },

  /**
   * Find conflict by ID in diff
   * @param {string} conflictId - Conflict ID
   * @param {Object} diff - Diff object
   * @returns {Object|null} Conflict object or null
   */
  findConflictById(conflictId, diff) {
    return diff.bothChanged.find(c => c.local.id === conflictId || c.cloud.id === conflictId) || null;
  },

  /**
   * Process queued background sync when online
   * This is called when connectivity is restored
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async processQueuedSync(userId) {
    const lock = localStorage.getItem(BACKGROUND_SYNC_LOCK_KEY);
    if (!lock) {
      return;
    }

    
    localStorage.removeItem(BACKGROUND_SYNC_LOCK_KEY);
    await this.syncAfterMutation(userId);
  }
};
