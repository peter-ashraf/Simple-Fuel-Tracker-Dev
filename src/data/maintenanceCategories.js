export const MAINTENANCE_CATEGORIES = {
  OIL_CHANGE: {
    id: 'oil_change',
    name: 'Oil Change',
    icon: 'oil',
    defaultInterval: { type: 'distance', value: 10000 },
    defaultSafetyMarginKm: 1500,
    color: '#8b5cf6'
  },
  TIRE_ROTATION: {
    id: 'tire_rotation',
    name: 'Tire Rotation',
    icon: 'rotate',
    defaultInterval: { type: 'distance', value: 10000 },
    defaultSafetyMarginKm: 1500,
    color: '#3b82f6'
  },
  TIRE_REPLACEMENT: {
    id: 'tire_replacement',
    name: 'Tire Replacement',
    icon: 'tire',
    defaultInterval: { type: 'distance', value: 40000 },
    defaultSafetyMarginKm: 4000,
    color: '#ef4444'
  },
  BRAKE_SERVICE: {
    id: 'brake_service',
    name: 'Brake Service',
    icon: 'brake',
    defaultInterval: { type: 'distance', value: 20000 },
    defaultSafetyMarginKm: 2000,
    color: '#f59e0b'
  },
  BRAKE_PADS: {
    id: 'brake_pads',
    name: 'Brake Pads',
    icon: 'brake',
    defaultInterval: { type: 'distance', value: 30000 },
    defaultSafetyMarginKm: 3000,
    color: '#dc2626'
  },
  AIR_FILTER: {
    id: 'air_filter',
    name: 'Air Filter',
    icon: 'filter',
    defaultInterval: { type: 'distance', value: 15000 },
    defaultSafetyMarginKm: 1500,
    color: '#10b981'
  },
  AC_FILTER: {
    id: 'ac_filter',
    name: 'AC Filter',
    icon: 'filter',
    defaultInterval: { type: 'distance', value: 20000 },
    defaultSafetyMarginKm: 2000,
    color: '#06b6d4'
  },
  FUEL_FILTER: {
    id: 'fuel_filter',
    name: 'Fuel Filter',
    icon: 'filter',
    defaultInterval: { type: 'distance', value: 30000 },
    defaultSafetyMarginKm: 3000,
    color: '#06b6d4'
  },
  SPARK_PLUGS: {
    id: 'spark_plugs',
    name: 'Spark Plugs',
    icon: 'spark',
    defaultInterval: { type: 'distance', value: 45000 },
    defaultSafetyMarginKm: 4000,
    color: '#f97316'
  },
  COOLANT_FLUSH: {
    id: 'coolant_flush',
    name: 'Coolant Flush',
    icon: 'coolant',
    defaultInterval: { type: 'distance', value: 40000 },
    defaultSafetyMarginKm: 4000,
    color: '#14b8a6'
  },
  TRANSMISSION_SERVICE: {
    id: 'transmission_service',
    name: 'Transmission Service',
    icon: 'gear',
    defaultInterval: { type: 'distance', value: 60000 },
    defaultSafetyMarginKm: 5000,
    color: '#a855f7'
  },
  BATTERY: {
    id: 'battery',
    name: 'Battery',
    icon: 'battery',
    defaultInterval: { type: 'distance', value: 50000 },
    defaultSafetyMarginKm: 5000,
    color: '#eab308'
  },
  GENERAL_INSPECTION: {
    id: 'general_inspection',
    name: 'General Inspection',
    icon: 'check',
    defaultInterval: { type: 'distance', value: 10000 },
    defaultSafetyMarginKm: 1000,
    color: '#64748b'
  },
  CUSTOM: {
    id: 'custom',
    name: 'Custom',
    icon: 'custom',
    defaultInterval: { type: 'distance', value: 10000 },
    defaultSafetyMarginKm: 1000,
    color: '#64748b'
  }
};


export const getMaintenanceCategory = (categoryId) => {
  if (!categoryId) return MAINTENANCE_CATEGORIES.CUSTOM;
  return MAINTENANCE_CATEGORIES[categoryId.toUpperCase()] || MAINTENANCE_CATEGORIES.CUSTOM;
};

export const getAllCategories = () => {
  return Object.values(MAINTENANCE_CATEGORIES);
};
