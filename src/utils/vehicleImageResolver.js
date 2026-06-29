import { getVehicleImageRecords } from "./vehicleImageStore";

export const DEFAULT_VEHICLE_IMAGE_SETTINGS = {
  offsetX: 0,
  offsetY: 0,
  zoom: 1,
  rotate: 0,
  flipX: false,
  flipY: false,
};

const clampNumber = (value, min, max, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
};

export const normalizeVehicleImageSettings = (settings = {}) => ({
  offsetX: clampNumber(
    settings.offsetX ??
      settings.x ??
      (settings.positionX != null
        ? (Number(settings.positionX) - 62) * 5
        : DEFAULT_VEHICLE_IMAGE_SETTINGS.offsetX),
    -220,
    220,
    DEFAULT_VEHICLE_IMAGE_SETTINGS.offsetX,
  ),
  offsetY: clampNumber(
    settings.offsetY ??
      settings.y ??
      (settings.positionY != null
        ? (Number(settings.positionY) - 54) * 3
        : DEFAULT_VEHICLE_IMAGE_SETTINGS.offsetY),
    -140,
    140,
    DEFAULT_VEHICLE_IMAGE_SETTINGS.offsetY,
  ),
  zoom: clampNumber(
    settings.zoom ?? settings.scale ?? DEFAULT_VEHICLE_IMAGE_SETTINGS.zoom,
    0.45,
    2.6,
    DEFAULT_VEHICLE_IMAGE_SETTINGS.zoom,
  ),
  rotate: clampNumber(
    settings.rotate ?? settings.rotation ?? DEFAULT_VEHICLE_IMAGE_SETTINGS.rotate,
    -180,
    180,
    DEFAULT_VEHICLE_IMAGE_SETTINGS.rotate,
  ),
  flipX: Boolean(settings.flipX ?? settings.flipHorizontal ?? false),
  flipY: Boolean(settings.flipY ?? settings.flipVertical ?? false),
});

export const scaleVehicleHeroImageSettings = (
  settings = DEFAULT_VEHICLE_IMAGE_SETTINGS,
) => {
  const normalized = normalizeVehicleImageSettings(settings);

  return {
    offsetX: normalized.offsetX * 0.44,
    offsetY: normalized.offsetY * 0.36,
    zoom: clampNumber(0.96 + (normalized.zoom - 1) * 0.72, 0.45, 2.6, 1),
    rotate: normalized.rotate,
    flipX: normalized.flipX,
    flipY: normalized.flipY,
  };
};

export const getDefaultVehicleImage = () => {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.endsWith("/") ? base : `${base}/`}vehicle-images/vehicle-hero-default.png`;
};

const normalizeImageValue = (value) => {
  if (!value) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (
      trimmed.startsWith("data:image/") ||
      trimmed.startsWith("blob:") ||
      trimmed.startsWith("http") ||
      trimmed.startsWith("/")
    ) {
      return trimmed;
    }

    try {
      return normalizeImageValue(JSON.parse(trimmed));
    } catch {
      return trimmed;
    }
  }

  if (typeof value === "object") {
    return (
      value.dataUrl ||
      value.src ||
      value.url ||
      value.image ||
      value.photo ||
      value.heroImageUrl ||
      value.hero_image_url ||
      value.vehicleImageUrl ||
      value.vehicle_image_url ||
      null
    );
  }

  return null;
};

const getVehicleLookupIds = (vehicle) => {
  if (!vehicle) return [];
  return [
    vehicle.id,
    vehicle.stableId,
    vehicle.stable_id,
    vehicle.stableKey,
    vehicle.stable_key,
  ]
    .filter(Boolean)
    .map(String);
};

const getVehicleObjectImage = (vehicle) =>
  normalizeImageValue(
    vehicle?.vehicleImageUrl ||
      vehicle?.vehicle_image_url ||
      vehicle?.heroImageUrl ||
      vehicle?.hero_image_url ||
      vehicle?.imageUrl ||
      vehicle?.image_url ||
      vehicle?.photoUrl ||
      vehicle?.photo_url ||
      vehicle?.vehicleImage ||
      vehicle?.heroImage ||
      vehicle?.image ||
      vehicle?.photo,
  );

const getActiveEntryKey = (vehicleId) => `sft_vehicle_image_active_${vehicleId}`;
const getSettingsKey = (vehicleId) => `sft_vehicle_image_settings_${vehicleId}`;

const readStoredSettings = (vehicle) => {
  if (typeof window === "undefined") return DEFAULT_VEHICLE_IMAGE_SETTINGS;

  for (const id of getVehicleLookupIds(vehicle)) {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(getSettingsKey(id)) || "null");
      if (parsed) return normalizeVehicleImageSettings(parsed);
    } catch {
      // Ignore malformed legacy image settings.
    }
  }

  return DEFAULT_VEHICLE_IMAGE_SETTINGS;
};

const readLocalStorageImage = (vehicle) => {
  if (typeof window === "undefined") return null;

  for (const id of getVehicleLookupIds(vehicle)) {
    const directKeys = [
      `sft_vehicle_image_${id}`,
      `vehicle_image_${id}`,
      `vehicleHeroImage:${id}`,
      `vehicle-image-${id}`,
    ];

    for (const key of directKeys) {
      const found = normalizeImageValue(window.localStorage.getItem(key));
      if (found) return found;
    }
  }

  for (const key of ["sft_vehicle_images", "vehicle_images"]) {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
      if (!parsed || typeof parsed !== "object") continue;

      for (const id of getVehicleLookupIds(vehicle)) {
        const found = normalizeImageValue(parsed[id]);
        if (found) return found;
      }
    } catch {
      // Ignore malformed legacy collections.
    }
  }

  return null;
};

const readIndexedVehicleImage = async (vehicle) => {
  for (const id of getVehicleLookupIds(vehicle)) {
    try {
      const records = await getVehicleImageRecords(id);
      if (!records.length) continue;

      const activeEntryId =
        typeof window !== "undefined"
          ? window.localStorage.getItem(getActiveEntryKey(id))
          : null;
      const activeRecord = activeEntryId
        ? records.find((record) => record.id === activeEntryId)
        : null;
      const record = activeRecord || records[0];
      const dataUrl = normalizeImageValue(record);
      if (dataUrl) {
        return {
          src: dataUrl,
          settings: normalizeVehicleImageSettings(record.settings),
          isDefault: false,
        };
      }
    } catch {
      // IndexedDB may be unavailable in private/sandboxed contexts.
    }
  }

  return null;
};

export const resolveVehicleImage = async (vehicle) => {
  const storedSettings = readStoredSettings(vehicle);
  const indexed = await readIndexedVehicleImage(vehicle);

  if (indexed?.src) {
    return {
      ...indexed,
      settings: indexed.settings || storedSettings,
    };
  }

  const localImage = readLocalStorageImage(vehicle) || getVehicleObjectImage(vehicle);
  if (localImage) {
    return {
      src: localImage,
      settings: storedSettings,
      isDefault: false,
    };
  }

  return {
    src: getDefaultVehicleImage(),
    settings: DEFAULT_VEHICLE_IMAGE_SETTINGS,
    isDefault: true,
  };
};
