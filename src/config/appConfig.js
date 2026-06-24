export const APP_ENV = import.meta.env.VITE_APP_ENV || 'development';
export const STORAGE_PREFIX = import.meta.env.VITE_STORAGE_PREFIX || 'sft-dev';
export const CLOUD_ENABLED = import.meta.env.VITE_CLOUD_ENABLED === 'true';
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const IS_DEV_BUILD = APP_ENV !== 'production';
export const CLOUD_CONFIGURED = CLOUD_ENABLED && Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const DEV_USER_ID = '00000000-0000-4000-8000-000000000001';
export const DEV_USER_EMAIL = 'dev-local@simple-fuel-tracker.local';

const LEGACY_UNPREFIXED_KEYS = new Set(['vehicles', 'selectedVehicleId']);

export const storageKey = (key) => {
  if (!key || typeof key !== 'string') return key;
  if (key.startsWith(`${STORAGE_PREFIX}-`)) return key;
  if (key.startsWith('fueltracker-') || LEGACY_UNPREFIXED_KEYS.has(key)) {
    return `${STORAGE_PREFIX}-${key}`;
  }
  return key;
};

export const devCloudDisabledResult = (action = 'sync') => ({
  success: false,
  skipped: true,
  action,
  message: 'Cloud is disabled in this development build. Configure a separate dev Supabase project and set VITE_CLOUD_ENABLED=true to use sync.',
  details: ['No Supabase request was sent. Production cloud data was not touched.'],
  counts: {
    vehicles: 0,
    fillups: 0,
    maintenance: 0,
    tripEstimates: 0,
    maintenanceTaxonomy: 0
  },
  totalUploaded: 0
});
