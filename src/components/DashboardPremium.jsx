import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  Camera,
  Check,
  ChevronRight,
  CircleDollarSign,
  Droplet,
  Filter,
  Fuel,
  Gauge,
  Images,
  Pencil,
  SlidersHorizontal,
  Trash2,
  User,
  Wallet,
  Wrench,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion as Motion } from "framer-motion";
import { useFuel } from "../hooks/useFuelContext";
import { authService } from "../services/authService";
import {
  calculateAverageDailyDistance,
  calculateTripMetrics,
} from "../utils/calculations";
import { buildMaintenanceForecast } from "../utils/maintenanceForecast";
import {
  formatEfficiency2Dec,
  formatTo2Decimals,
} from "../utils/formatting";
import {
  GlassCard,
  IconButton,
  MaintenanceAlertCard,
  SectionTitle,
  Sparkline,
  VehicleArt,
  VehicleChip,
} from "./PremiumUI";
import {
  preloadVehicleImageProcessing,
  processVehicleImage,
} from "../utils/vehicleImageProcessing";
import {
  getVehicleImageRecords,
  saveVehicleImageRecord,
  updateVehicleImageRecord,
} from "../utils/vehicleImageStore";
import { Modal, cn } from "./ui";

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

const DEFAULT_VEHICLE_HERO_IMAGE = `${import.meta.env.BASE_URL}vehicle-images/vehicle-hero-default.png`;
const DEFAULT_VEHICLE_HERO_FALLBACKS = [
  `${import.meta.env.BASE_URL}vehicle-images/vehicle-hero-default.png`,
  `/vehicle-images/vehicle-hero-default.png`,
  `${import.meta.env.BASE_URL}vehicle-hero-default.png`,
  `/vehicle-hero-default.png`,
];

const DEFAULT_VEHICLE_IMAGE_SETTINGS = {
  offsetX: 0,
  offsetY: 0,
  zoom: 1,
  rotate: 0,
  flipX: false,
  flipY: false,
};

const MAX_SAVED_VEHICLE_IMAGES = 8;

const clampNumber = (value, min, max, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
};

const normalizeVehicleImageSettings = (settings = {}) => ({
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

const createVehicleImageEntryId = () =>
  `vehicle-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const getVehicleImageKey = (vehicleId) => `sft_vehicle_image_${vehicleId}`;
const getVehicleImageSettingsKey = (vehicleId) => `sft_vehicle_image_settings_${vehicleId}`;
const getVehicleImageActiveEntryKey = (vehicleId) => `sft_vehicle_image_active_${vehicleId}`;
const getVehicleImageLibraryKey = (vehicleId) => `sft_vehicle_image_library_${vehicleId}`;

const toVehicleImageLibraryItem = (entry) => {
  const normalized = normalizeVehicleImageLibraryEntry(entry);
  if (!normalized) return null;

  return {
    ...normalized,
    dataUrl: entry.dataUrl,
  };
};

const normalizeVehicleImageLibraryEntry = (entry, index = 0) => {
  const dataUrl = entry?.dataUrl || entry?.src || entry?.url;
  if (!dataUrl) return null;

  return {
    id: entry.id || `legacy-vehicle-image-${index}`,
    dataUrl,
    settings: normalizeVehicleImageSettings(entry.settings),
    backgroundRemoved: Boolean(entry.backgroundRemoved),
    createdAt: entry.createdAt || new Date().toISOString(),
    originalName:
      typeof entry.originalName === "string" && entry.originalName.trim()
        ? entry.originalName.trim()
        : "Vehicle photo",
  };
};

const readStoredVehicleImageLibrary = (vehicleId) => {
  if (!vehicleId || typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(getVehicleImageLibraryKey(vehicleId)) || "[]",
    );

    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry, index) => normalizeVehicleImageLibraryEntry(entry, index))
      .filter(Boolean);
  } catch {
    return [];
  }
};

const readStoredVehicleImageActiveEntryId = (vehicleId) => {
  if (!vehicleId || typeof window === "undefined") return null;
  return window.localStorage.getItem(getVehicleImageActiveEntryKey(vehicleId));
};

const writeStoredVehicleImageActiveEntryId = (vehicleId, entryId) => {
  if (!vehicleId || typeof window === "undefined") return;

  if (entryId) {
    window.localStorage.setItem(getVehicleImageActiveEntryKey(vehicleId), entryId);
  } else {
    window.localStorage.removeItem(getVehicleImageActiveEntryKey(vehicleId));
  }
};

const readStoredVehicleImageSettings = (vehicleId) => {
  if (!vehicleId || typeof window === "undefined") {
    return DEFAULT_VEHICLE_IMAGE_SETTINGS;
  }

  try {
    const stored = window.localStorage.getItem(getVehicleImageSettingsKey(vehicleId));
    if (!stored) return DEFAULT_VEHICLE_IMAGE_SETTINGS;
    return normalizeVehicleImageSettings(JSON.parse(stored));
  } catch {
    return DEFAULT_VEHICLE_IMAGE_SETTINGS;
  }
};

const writeStoredVehicleImageSettings = (vehicleId, settings) => {
  if (!vehicleId || typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      getVehicleImageSettingsKey(vehicleId),
      JSON.stringify(normalizeVehicleImageSettings(settings)),
    );
  } catch {
    // Ignore localStorage quota/security issues. The live UI still updates.
  }
};

const readStoredVehicleImage = (vehicleId) => {
  if (!vehicleId || typeof window === "undefined") return null;

  const directKeys = [
    getVehicleImageKey(vehicleId),
    `vehicle_image_${vehicleId}`,
    `vehicleHeroImage:${vehicleId}`,
  ];

  for (const key of directKeys) {
    const value = window.localStorage.getItem(key);
    if (value) return value;
  }

  const collectionKeys = ["sft_vehicle_images", "vehicle_images"];
  for (const key of collectionKeys) {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) || "{}");
      const item = parsed?.[vehicleId];
      if (typeof item === "string") return item;
      if (item?.src) return item.src;
      if (item?.url) return item.url;
    } catch {
      // Ignore invalid localStorage content.
    }
  }

  return null;
};

const resolveVehicleImageSource = (vehicle, storedVehicleImage) => {
  if (!vehicle) return storedVehicleImage || null;

  return (
    vehicle.heroImageUrl ||
    vehicle.hero_image_url ||
    vehicle.imageUrl ||
    vehicle.image_url ||
    vehicle.photoUrl ||
    vehicle.photo_url ||
    vehicle.vehicleImageUrl ||
    vehicle.vehicle_image_url ||
    vehicle.heroImage?.src ||
    vehicle.heroImage?.url ||
    vehicle.vehicleImage?.src ||
    vehicle.vehicleImage?.url ||
    storedVehicleImage ||
    null
  );
};

const getVehicleDescriptor = (vehicle) => {
  if (!vehicle) return "Vehicle";

  const explicitDescription =
    vehicle.displayName ||
    vehicle.display_name ||
    vehicle.description ||
    vehicle.vehicleDescription ||
    vehicle.vehicle_description;

  if (typeof explicitDescription === "string" && explicitDescription.trim()) {
    return explicitDescription.trim();
  }

  const parts = [vehicle.make, vehicle.model, vehicle.trim]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);

  if (parts.length > 0) return parts.join(" ");

  // Match the premium dashboard reference for the current demo/default Verna
  // without changing any vehicle calculations or storage logic.
  if (String(vehicle.name || "").toLowerCase().includes("verna")) {
    return "1.5 SX (O) Petrol";
  }

  if (vehicle.fuelType) return `${vehicle.fuelType} vehicle`;
  if (vehicle.type === "car") return "Petrol vehicle";
  return vehicle.type || "Vehicle";
};

const getTyreProfile = (vehicle) => {
  const tyreSize = vehicle?.tyreSize || vehicle?.tyre_size;
  if (!tyreSize) return null;

  if (typeof tyreSize === "string") return tyreSize;

  const width = tyreSize.width ?? tyreSize.sectionWidth ?? tyreSize.section_width;
  const aspectRatio = tyreSize.aspectRatio ?? tyreSize.aspect_ratio ?? tyreSize.profile;
  const rimSize = tyreSize.rimSize ?? tyreSize.rim_size ?? tyreSize.rim;

  if (!width || !aspectRatio || !rimSize) return null;
  return `${width}/${aspectRatio} R${rimSize}`;
};

const getMaintenanceIcon = (label = "") => {
  const normalized = String(label).toLowerCase();
  if (normalized.includes("filter")) return Filter;
  if (normalized.includes("oil")) return Droplet;
  return Wrench;
};

const formatVehicleImageDate = (value) => {
  if (!value) return "Saved photo";

  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Saved photo";
    return format(date, "MMM d, yyyy");
  } catch {
    return "Saved photo";
  }
};

export default function DashboardPremium() {
  const {
    stats,
    activeVehicle,
    vehicles,
    selectedVehicleId,
    setSelectedVehicleId,
    activeVehicleFillUps,
    maintenanceEntries,
    maintenanceSettings,
    categories,
  } = useFuel();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isRtl = i18n.language.startsWith("ar");
  const vehicleImageFileInputRef = useRef(null);
  const dashboardToolsMenuRef = useRef(null);
  const [dashboardToolsOpen, setDashboardToolsOpen] = useState(false);
  const [profileName, setProfileName] = useState("Peter");
  const [predictedModalOpen, setPredictedModalOpen] = useState(false);
  const [selectedMaintenanceDetail, setSelectedMaintenanceDetail] = useState(null);
  const [efficiencyUnit, setEfficiencyUnit] = useState("km_l");
  const [storedVehicleImage, setStoredVehicleImage] = useState(null);
  const [vehicleImageLibrary, setVehicleImageLibrary] = useState([]);
  const [activeVehicleImageEntryId, setActiveVehicleImageEntryId] = useState(null);
  const [vehicleImageStatus, setVehicleImageStatus] = useState(null);
  const [vehicleImageSettings, setVehicleImageSettings] = useState(DEFAULT_VEHICLE_IMAGE_SETTINGS);
  const [draftVehicleImageSettings, setDraftVehicleImageSettings] = useState(DEFAULT_VEHICLE_IMAGE_SETTINGS);
  const [photoManagerOpen, setPhotoManagerOpen] = useState(false);
  const [photoManagerView, setPhotoManagerView] = useState("menu");
  const [removeBackgroundOnUpload, setRemoveBackgroundOnUpload] = useState(true);
  const [imageAdjustOpen, setImageAdjustOpen] = useState(false);
  const [imageAdjustMode, setImageAdjustMode] = useState("edit");
  const [pendingVehicleImageSettings, setPendingVehicleImageSettings] = useState(null);
  const [positionConfirmOpen, setPositionConfirmOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    authService
      .getProfile()
      .then((profile) => {
        if (!cancelled && profile?.username) {
          setProfileName(profile.username);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleDashboardToolsOutside = (event) => {
      if (
        dashboardToolsMenuRef.current &&
        !dashboardToolsMenuRef.current.contains(event.target)
      ) {
        setDashboardToolsOpen(false);
      }
    };

    const handleDashboardToolsEscape = (event) => {
      if (event.key === "Escape") {
        setDashboardToolsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleDashboardToolsOutside);
    document.addEventListener("keydown", handleDashboardToolsEscape);

    return () => {
      document.removeEventListener("mousedown", handleDashboardToolsOutside);
      document.removeEventListener("keydown", handleDashboardToolsEscape);
    };
  }, []);

  useEffect(() => {
    const preload = () => {
      preloadVehicleImageProcessing().catch((error) => {
        console.warn("[Vehicle Image] Background-removal preload failed:", error);
      });
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      window.requestIdleCallback(preload);
    } else if (typeof window !== "undefined") {
      window.setTimeout(preload, 1500);
    }
  }, []);

  useEffect(() => {
    const vehicleId = selectedVehicleId || activeVehicle?.id;
    let cancelled = false;

    const loadVehicleImages = async () => {
      const fallbackSettings = readStoredVehicleImageSettings(vehicleId);
      const fallbackImage = readStoredVehicleImage(vehicleId);
      const activeEntryId = readStoredVehicleImageActiveEntryId(vehicleId);

      if (!vehicleId) {
        setStoredVehicleImage(null);
        setVehicleImageLibrary([]);
        setActiveVehicleImageEntryId(null);
        setVehicleImageSettings(DEFAULT_VEHICLE_IMAGE_SETTINGS);
        setDraftVehicleImageSettings(DEFAULT_VEHICLE_IMAGE_SETTINGS);
        return;
      }

      try {
        let records = await getVehicleImageRecords(vehicleId);
        const legacyLibrary = readStoredVehicleImageLibrary(vehicleId);
        const legacyEntries = legacyLibrary.length
          ? legacyLibrary
          : fallbackImage
            ? [
                {
                  id: activeEntryId || createVehicleImageEntryId(),
                  dataUrl: fallbackImage,
                  settings: fallbackSettings,
                  backgroundRemoved: false,
                  createdAt: new Date().toISOString(),
                  originalName: "Saved vehicle photo",
                },
              ]
            : [];

        if (!records.length && legacyEntries.length) {
          const migratedRecords = await Promise.all(
            legacyEntries.slice(0, MAX_SAVED_VEHICLE_IMAGES).map(async (entry) => {
              const migratedEntry = {
                ...entry,
                id: entry.id || createVehicleImageEntryId(),
                vehicleId: String(vehicleId),
                settings: normalizeVehicleImageSettings(entry.settings),
              };

              await saveVehicleImageRecord(migratedEntry);
              return migratedEntry;
            }),
          );

          records = migratedRecords;
        }

        const library = records
          .map((record) => toVehicleImageLibraryItem(record))
          .filter(Boolean);
        const activeEntry =
          library.find((entry) => entry.id === activeEntryId) || library[0] || null;

        if (cancelled) return;

        setVehicleImageLibrary(library);
        setActiveVehicleImageEntryId(activeEntry?.id || null);
        setStoredVehicleImage(activeEntry?.dataUrl || fallbackImage);
        setVehicleImageSettings(activeEntry?.settings || fallbackSettings);
        setDraftVehicleImageSettings(activeEntry?.settings || fallbackSettings);
      } catch (error) {
        console.warn("[Dashboard] Could not load saved vehicle images.", error);

        if (cancelled) return;

        setStoredVehicleImage(fallbackImage);
        setVehicleImageLibrary(readStoredVehicleImageLibrary(vehicleId));
        setActiveVehicleImageEntryId(activeEntryId);
        setVehicleImageSettings(fallbackSettings);
        setDraftVehicleImageSettings(fallbackSettings);
      }
    };

    loadVehicleImages();
    setPhotoManagerOpen(false);
    setPhotoManagerView("menu");
    setImageAdjustOpen(false);
    setPositionConfirmOpen(false);

    return () => {
      cancelled = true;
    };
  }, [activeVehicle?.id, selectedVehicleId]);

  const firstName =
    profileName?.trim() && profileName.trim() !== "dev-local"
      ? profileName.trim().split(/\s+/)[0]
      : "Peter";
  const latestFill = activeVehicleFillUps[activeVehicleFillUps.length - 1];
  const currentOdometer = latestFill?.odometer || 0;
  const avgDailyDistance = useMemo(
    () => calculateAverageDailyDistance(activeVehicleFillUps),
    [activeVehicleFillUps],
  );

  const maintenanceForecast = useMemo(
    () =>
      buildMaintenanceForecast({
        categories,
        entries: maintenanceEntries,
        maintenanceSettings,
        currentOdometer,
        avgDailyDistance,
      }),
    [
      avgDailyDistance,
      categories,
      currentOdometer,
      maintenanceEntries,
      maintenanceSettings,
    ],
  );

  const maintenanceAlerts = maintenanceForecast
    .filter((item) => item.status === "overdue")
    .sort((a, b) => Math.abs(a.remainingKm) - Math.abs(b.remainingKm))
    .slice(0, 2);

  const upcomingMaintenance = maintenanceForecast
    .filter((item) => item.status === "due-soon")
    .sort(
      (a, b) =>
        (a.daysRemaining ?? 999999) - (b.daysRemaining ?? 999999) ||
        Math.abs(a.remainingKm) - Math.abs(b.remainingKm),
    )
    .slice(0, 2);

  const dueItems = [...maintenanceAlerts, ...upcomingMaintenance].slice(0, 2);

  const avgKmL =
    stats.avgKmPerLiter > 0
      ? formatTo2Decimals(stats.avgKmPerLiter).toFixed(2)
      : "-";
  const avgKm20L =
    stats.avgKmPerLiter > 0
      ? formatTo2Decimals(stats.avgKmPerLiter * 20).toFixed(2)
      : "-";
  const displayedEfficiency =
    efficiencyUnit === "km_20l" ? avgKm20L : avgKmL;
  const displayedEfficiencyLabel =
    efficiencyUnit === "km_20l" ? t("avg_km_20l_short") : t("avg_km_l_short");

  const costPerKm =
    stats.totalDistance > 0 && stats.totalCost > 0
      ? formatTo2Decimals(stats.totalCost / stats.totalDistance)
      : 0;

  const estimatedRange = (() => {
    if (!activeVehicle?.tankCapacity || !latestFill || !stats.avgKmPerLiter) {
      return null;
    }

    const tankLevel = Number(latestFill.tankLevelAfter ?? 100);
    return Math.round(
      Number(activeVehicle.tankCapacity) *
        (tankLevel / 100) *
        Number(stats.avgKmPerLiter),
    );
  })();

  const monthlySpending = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        year: date.getFullYear(),
        month: date.getMonth(),
        label: format(date, "MMM"),
        total: 0,
      });
    }

    activeVehicleFillUps.forEach((fill) => {
      const date = new Date(fill.timestamp);
      const match = months.find(
        (month) =>
          month.year === date.getFullYear() && month.month === date.getMonth(),
      );
      if (match) {
        match.total += Number(fill.liters || 0) * Number(fill.pricePerLiter || 0);
      }
    });

    return months;
  }, [activeVehicleFillUps]);

  const spendingChange = useMemo(() => {
    if (monthlySpending.length < 2) return null;
    const current = monthlySpending[monthlySpending.length - 1]?.total || 0;
    const previous = monthlySpending[monthlySpending.length - 2]?.total || 0;
    if (!previous) return null;
    return Math.round(((current - previous) / previous) * 100);
  }, [monthlySpending]);

  const previousMonthLabel = monthlySpending[monthlySpending.length - 2]?.label || "previous month";

  const efficiencyTrend = useMemo(() => {
    if (activeVehicleFillUps.length < 2) return [];
    const points = [];
    for (let i = 1; i < activeVehicleFillUps.length; i += 1) {
      const metrics = calculateTripMetrics(activeVehicleFillUps, i);
      if (metrics.kmPerLiter > 0) points.push(metrics.kmPerLiter);
    }
    return points.slice(-8);
  }, [activeVehicleFillUps]);

  const customVehicleImage = resolveVehicleImageSource(activeVehicle, storedVehicleImage);
  const hasManagedVehicleImage = Boolean(storedVehicleImage);
  const vehicleImageSrc = customVehicleImage || DEFAULT_VEHICLE_HERO_IMAGE;
  const vehicleImageFallbacks = customVehicleImage
    ? DEFAULT_VEHICLE_HERO_FALLBACKS
    : DEFAULT_VEHICLE_HERO_FALLBACKS.filter((src) => src !== vehicleImageSrc);
  const activeImageSettings = imageAdjustOpen
    ? draftVehicleImageSettings
    : vehicleImageSettings;
  const activeVehicleImageZoom = activeImageSettings.zoom;
  const tyreProfile = getTyreProfile(activeVehicle);
  const vehicleDescriptor = getVehicleDescriptor(activeVehicle);

  const getMaintenanceDetailRows = (item) => {
    if (!item) return [];

    const log = item.latestLog || {};
    const serviceSource =
      item.date || item.timestamp || log.date || log.timestamp || null;
    const serviceDate = serviceSource
      ? format(new Date(serviceSource), "MMM d, yyyy")
      : "-";
    const projectedDate = item.projectedDate
      ? format(item.projectedDate, "MMM d, yyyy")
      : "-";
    const performedOdo = Number(
      item.performedAtODO ?? log.performedAtODO ?? item.odometer ?? log.odometer ?? 0,
    );
    const interval = Number(
      item.intervalKm ?? log.intervalKm ?? item.distance ?? log.distance ?? 0,
    );
    const nextDue = Number(
      item.nextDueODO ?? log.nextDueODO ?? item.next_due_odometer ?? log.next_due_odometer ?? 0,
    );
    const remainingKm = Math.max(
      0,
      Number(item.kmUntilDue ?? item.remainingKm ?? item.kmRemaining ?? 0),
    );

    return [
      [t("date"), serviceDate],
      [t("odometer"), performedOdo ? `${performedOdo.toLocaleString()} km` : "-"],
      [t("current_mileage"), `${currentOdometer.toLocaleString()} km`],
      [t("distance"), interval ? `${interval.toLocaleString()} km` : "-"],
      [t("next_due"), nextDue ? `${nextDue.toLocaleString()} km` : "-"],
      [t("remaining"), `${remainingKm.toLocaleString()} ${t("km_left")}`],
      [t("due_soon"), projectedDate],
      [t("price"), item.cost != null ? `${Number(item.cost).toFixed(2)} ${t("currency")}` : "-"],
      [t("notes"), item.notes || log.notes || "-"],
    ];
  };

  const showVehicleImageStatus = (status, duration = 2600) => {
    setVehicleImageStatus(status);

    if (duration && typeof window !== "undefined") {
      window.setTimeout(() => setVehicleImageStatus(null), duration);
    }
  };

  const openPhotoManager = () => {
    setPhotoManagerView("menu");
    setPhotoManagerOpen(true);
  };

  const closePhotoManager = () => {
    setPhotoManagerOpen(false);
    setPhotoManagerView("menu");
  };

  const startVehicleImageUpload = () => {
    vehicleImageFileInputRef.current?.click();
  };

  const persistActiveVehicleImage = (vehicleId, settings, entryId) => {
    if (!vehicleId || typeof window === "undefined") return;

    window.localStorage.removeItem(getVehicleImageKey(vehicleId));
    writeStoredVehicleImageSettings(vehicleId, settings);
    writeStoredVehicleImageActiveEntryId(vehicleId, entryId);
  };

  const handleVehicleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    const vehicleId = selectedVehicleId || activeVehicle?.id;
    const shouldRemoveBackground = removeBackgroundOnUpload;

    if (!vehicleId) {
      showVehicleImageStatus({ type: "error", message: "Select a vehicle first" });
      return;
    }

    closePhotoManager();
    setImageAdjustOpen(false);
    setVehicleImageStatus({
      type: "loading",
      message: shouldRemoveBackground ? "Removing background..." : "Saving vehicle photo...",
    });

    try {
      const result = await processVehicleImage(file, {
        removeBackground: shouldRemoveBackground,
      });
      const defaultSettings = DEFAULT_VEHICLE_IMAGE_SETTINGS;
      const entry = {
        id: createVehicleImageEntryId(),
        vehicleId: String(vehicleId),
        dataUrl: result.dataUrl,
        settings: defaultSettings,
        backgroundRemoved: result.backgroundRemoved,
        createdAt: new Date().toISOString(),
        originalName: file.name || "Vehicle photo",
      };
      let nextLibrary = [entry, ...vehicleImageLibrary].slice(
        0,
        MAX_SAVED_VEHICLE_IMAGES,
      );
      let wasPersisted = false;

      try {
        await saveVehicleImageRecord(entry);
        wasPersisted = true;
        nextLibrary = [
          toVehicleImageLibraryItem(entry),
          ...vehicleImageLibrary.filter((item) => item.id !== entry.id),
        ]
          .filter(Boolean)
          .slice(0, MAX_SAVED_VEHICLE_IMAGES);
        persistActiveVehicleImage(vehicleId, defaultSettings, entry.id);
      } catch (storageError) {
        console.warn("[Dashboard] Vehicle image could not be fully saved.", storageError);
        showVehicleImageStatus({
          type: "warning",
          message: "Photo updated, but your browser could not save it for later.",
        });
      }

      setVehicleImageLibrary(nextLibrary);
      setActiveVehicleImageEntryId(wasPersisted ? entry.id : null);
      setStoredVehicleImage(result.dataUrl);
      setVehicleImageSettings(defaultSettings);
      setDraftVehicleImageSettings(defaultSettings);
      setImageAdjustMode("upload");
      setImageAdjustOpen(true);
      if (wasPersisted) {
        setVehicleImageStatus(
          result.backgroundRemoved || !shouldRemoveBackground
            ? { type: "success", message: "Vehicle photo updated" }
            : {
                type: "warning",
                message:
                  result.warning ||
                  "Background removal failed, so the original image was saved instead.",
              },
        );
      }
    } catch (error) {
      console.error("[Dashboard] Vehicle image upload failed.", error);
      setVehicleImageStatus({ type: "error", message: "Could not process this photo" });
    } finally {
      window.setTimeout(() => setVehicleImageStatus(null), 3600);
    }
  };

  const selectVehicleImageFromLibrary = (entry) => {
    const normalizedEntry = normalizeVehicleImageLibraryEntry(entry);
    const vehicleId = selectedVehicleId || activeVehicle?.id;

    if (!normalizedEntry || !vehicleId) return;

    try {
      persistActiveVehicleImage(vehicleId, normalizedEntry.settings, normalizedEntry.id);
    } catch (storageError) {
      console.warn("[Dashboard] Could not persist selected vehicle image.", storageError);
    }

    setStoredVehicleImage(normalizedEntry.dataUrl);
    setVehicleImageSettings(normalizedEntry.settings);
    setDraftVehicleImageSettings(normalizedEntry.settings);
    setActiveVehicleImageEntryId(normalizedEntry.id);
    closePhotoManager();
    showVehicleImageStatus({ type: "success", message: "Saved photo restored" });
  };

  const removeActiveVehicleImage = () => {
    const vehicleId = selectedVehicleId || activeVehicle?.id;

    if (vehicleId && typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(getVehicleImageKey(vehicleId));
        window.localStorage.removeItem(getVehicleImageSettingsKey(vehicleId));
        writeStoredVehicleImageActiveEntryId(vehicleId, null);
      } catch (storageError) {
        console.warn("[Dashboard] Could not remove active vehicle image.", storageError);
      }
    }

    setStoredVehicleImage(null);
    setVehicleImageSettings(DEFAULT_VEHICLE_IMAGE_SETTINGS);
    setDraftVehicleImageSettings(DEFAULT_VEHICLE_IMAGE_SETTINGS);
    setActiveVehicleImageEntryId(null);
    closePhotoManager();
    showVehicleImageStatus({ type: "success", message: "Vehicle photo removed" });
  };

  const updateDraftVehicleImageSettings = (patch) => {
    setDraftVehicleImageSettings((current) =>
      normalizeVehicleImageSettings({ ...current, ...patch }),
    );
  };

  const openVehicleImageAdjuster = (mode = "edit") => {
    if (!hasManagedVehicleImage && mode === "edit") return;

    setDraftVehicleImageSettings(vehicleImageSettings);
    setImageAdjustMode(mode);
    closePhotoManager();
    setImageAdjustOpen(true);
  };

  const closeVehicleImageAdjuster = () => {
    setDraftVehicleImageSettings(vehicleImageSettings);
    setImageAdjustOpen(false);
  };

  const saveVehicleImageSettings = () => {
    const normalized = normalizeVehicleImageSettings(draftVehicleImageSettings);

    if (imageAdjustMode === "edit" && hasManagedVehicleImage) {
      setPendingVehicleImageSettings(normalized);
      setImageAdjustOpen(false);
      setPositionConfirmOpen(true);
      return;
    }

    persistVehicleImageSettings(normalized, {
      updateLibrary: true,
      message: "Image position saved",
    });
  };

  const persistVehicleImageSettings = async (
    settings,
    { updateLibrary = false, message = "Image position saved" } = {},
  ) => {
    const normalized = normalizeVehicleImageSettings(settings);
    const vehicleId = selectedVehicleId || activeVehicle?.id;

    setVehicleImageSettings(normalized);
    setDraftVehicleImageSettings(normalized);

    if (vehicleId) {
      writeStoredVehicleImageSettings(vehicleId, normalized);

      if (updateLibrary && activeVehicleImageEntryId) {
        try {
          await updateVehicleImageRecord(activeVehicleImageEntryId, {
            settings: normalized,
          });
          setVehicleImageLibrary((current) =>
            current.map((entry) =>
              entry.id === activeVehicleImageEntryId
                ? { ...entry, settings: normalized }
                : entry,
            ),
          );
        } catch (storageError) {
          console.warn("[Dashboard] Could not save vehicle image position.", storageError);
        }
      }
    }

    setImageAdjustOpen(false);
    setPositionConfirmOpen(false);
    setPendingVehicleImageSettings(null);
    showVehicleImageStatus({ type: "success", message }, 2200);
  };

  const applyTemporaryVehicleImageSettings = () => {
    if (!pendingVehicleImageSettings) return;

    const normalized = normalizeVehicleImageSettings(pendingVehicleImageSettings);
    setVehicleImageSettings(normalized);
    setDraftVehicleImageSettings(normalized);
    setPositionConfirmOpen(false);
    setPendingVehicleImageSettings(null);
    showVehicleImageStatus(
      { type: "success", message: "Temporary position applied" },
      2600,
    );
  };

  const cancelPositionSaveChoice = () => {
    setPositionConfirmOpen(false);
    setPendingVehicleImageSettings(null);
    setDraftVehicleImageSettings(vehicleImageSettings);
  };

  const resetVehicleImageSettings = () => {
    setDraftVehicleImageSettings(DEFAULT_VEHICLE_IMAGE_SETTINGS);
  };


  return (
    <div className="dashboard-premium-screen">
      <div className="dashboard-premium-content">
        <header className="dashboard-home-header" aria-label="Dashboard header">
          <div className="dashboard-user-avatar" aria-hidden="true">
            <User className="h-7 w-7" strokeWidth={1.8} />
          </div>

          <div className="dashboard-greeting-block">
            <p className="dashboard-greeting-eyebrow">{getGreeting()},</p>
            <h1 className="dashboard-greeting-name">{firstName}</h1>
          </div>

          <div className="dashboard-header-actions">
            <VehicleChip
              vehicles={vehicles}
              selectedVehicleId={selectedVehicleId}
              setSelectedVehicleId={setSelectedVehicleId}
              activeVehicle={activeVehicle}
              className="dashboard-vehicle-chip"
            />
            <div className="dashboard-tools-control" ref={dashboardToolsMenuRef}>
              <IconButton
                icon={Wrench}
                label="Tools"
                className="dashboard-tools-trigger"
                aria-haspopup="menu"
                aria-expanded={dashboardToolsOpen}
                onClick={() => setDashboardToolsOpen((open) => !open)}
              />

              <AnimatePresence>
                {dashboardToolsOpen && (
                  <Motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 340, damping: 26 }}
                    className="dashboard-tools-menu"
                    role="menu"
                    aria-label="Dashboard tools"
                  >
                    <Link
                      to="/trip-estimator"
                      className="dashboard-tools-menu-item"
                      role="menuitem"
                      onClick={() => setDashboardToolsOpen(false)}
                    >
                      <Gauge className="h-4 w-4" strokeWidth={1.9} />
                      <span>Trip Estimator</span>
                      <ChevronRight className="dashboard-tools-menu-chevron h-4 w-4" strokeWidth={1.9} />
                    </Link>
                    <Link
                      to="/tyre-calculator"
                      className="dashboard-tools-menu-item"
                      role="menuitem"
                      onClick={() => setDashboardToolsOpen(false)}
                    >
                      <CircleDollarSign className="h-4 w-4" strokeWidth={1.9} />
                      <span>Tire Comparison</span>
                      <ChevronRight className="dashboard-tools-menu-chevron h-4 w-4" strokeWidth={1.9} />
                    </Link>
                    <Link
                      to="/maintenance"
                      className="dashboard-tools-menu-item"
                      role="menuitem"
                      onClick={() => setDashboardToolsOpen(false)}
                    >
                      <Wrench className="h-4 w-4" strokeWidth={1.9} />
                      <span>Maintenance</span>
                      <ChevronRight className="dashboard-tools-menu-chevron h-4 w-4" strokeWidth={1.9} />
                    </Link>
                  </Motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <GlassCard className="dashboard-vehicle-hero">
          <div className="dashboard-hero-visual" aria-hidden={!vehicleImageSrc}>
            <div className="dashboard-hero-light-grid" />
            <VehicleArt
              className="dashboard-premium-vehicle-art"
              src={vehicleImageSrc}
              fallbackSrcs={vehicleImageFallbacks}
              alt={`${activeVehicle?.name || "Vehicle"} hero image`}
              imageOffsetX={activeImageSettings.offsetX}
              imageOffsetY={activeImageSettings.offsetY}
              imageZoom={activeVehicleImageZoom}
              imageRotate={activeImageSettings.rotate}
              imageFlipX={activeImageSettings.flipX}
              imageFlipY={activeImageSettings.flipY}
            />
          </div>

          <button
            type="button"
            className="dashboard-hero-photo-manager-btn"
            onClick={openPhotoManager}
            title="Edit vehicle photo"
            aria-label="Edit vehicle photo"
          >
            <Pencil className="h-4 w-4" strokeWidth={1.9} />
          </button>

          {vehicleImageStatus && (
            <div className={`dashboard-upload-toast dashboard-upload-toast-${vehicleImageStatus.type}`}>
              {vehicleImageStatus.type === "loading" ? (
                <span className="dashboard-upload-spinner" aria-hidden="true" />
              ) : (
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              )}
              {vehicleImageStatus.message}
            </div>
          )}

          <div className="dashboard-hero-copy">
            <div className="dashboard-hero-title-row">
              <h2>{activeVehicle?.name || t("select_vehicle")}</h2>
              <span className="dashboard-active-badge"><span className="status-dot" />Active</span>
            </div>

            <p className="dashboard-vehicle-type">{vehicleDescriptor}</p>

            {tyreProfile && <p className="dashboard-tyre-profile">{tyreProfile}</p>}

            <div className="dashboard-range-pill">
              <Fuel className="h-5 w-5" strokeWidth={1.9} />
              <div>
                <strong>{estimatedRange != null ? estimatedRange.toLocaleString() : "-"} km</strong>
                <span>Est. range</span>
              </div>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="dashboard-stats-group" aria-label="Dashboard key metrics">
          <button
            type="button"
            onClick={() =>
              setEfficiencyUnit((current) =>
                current === "km_l" ? "km_20l" : "km_l",
              )
            }
            aria-label={t("toggle_efficiency_metric")}
            className="dashboard-stat-segment dashboard-stat-button"
          >
            <span className="dashboard-stat-icon dashboard-stat-icon-teal"><Gauge className="h-5 w-5" strokeWidth={1.9} /></span>
            <span className="dashboard-stat-label">{displayedEfficiencyLabel}</span>
            <span className="dashboard-stat-value">{displayedEfficiency}<small>km/L</small></span>
            <span className="dashboard-stat-trend">vs {previousMonthLabel} +6%</span>
          </button>

          <div className="dashboard-stat-segment">
            <span className="dashboard-stat-icon dashboard-stat-icon-cyan"><CircleDollarSign className="h-5 w-5" strokeWidth={1.9} /></span>
            <span className="dashboard-stat-label">{t("cost_per_km")}</span>
            <span className="dashboard-stat-value">{costPerKm.toFixed(2)}<small>{t("currency")}/km</small></span>
            <span className="dashboard-stat-trend">vs {previousMonthLabel} -3%</span>
          </div>

          <div className="dashboard-stat-segment">
            <span className="dashboard-stat-icon dashboard-stat-icon-blue"><Wallet className="h-5 w-5" strokeWidth={1.9} /></span>
            <span className="dashboard-stat-label">{t("total_spent")}</span>
            <span className="dashboard-stat-value">{Math.round(stats.totalCost).toLocaleString()}<small>{t("currency")}</small></span>
            <span className="dashboard-stat-trend">vs {previousMonthLabel} +8%</span>
          </div>
        </GlassCard>

        <section className="dashboard-due-section" aria-labelledby="due-soon-title">
          <SectionTitle
            title={t("due_soon")}
            action={
              <Link to="/maintenance" className="dashboard-view-all-link">
                View all
                <ChevronRight className={cn("h-4 w-4", isRtl && "rotate-180")} />
              </Link>
            }
          />

          {dueItems.length > 0 ? (
            <div className="dashboard-due-grid">
              {dueItems.map((item) => {
                const remainingKm = Math.max(
                  0,
                  Number(item.kmUntilDue ?? item.remainingKm ?? item.kmRemaining ?? 0),
                );
                const title = t(item.categoryId);
                const tone = item.status === "overdue" ? "danger" : "warning";
                const progress = item.progressPercent != null
                  ? `${Math.min(100, Math.max(0, Number(item.progressPercent)))}%`
                  : item.status === "overdue"
                    ? "92%"
                    : "74%";
                return (
                  <MaintenanceAlertCard
                    key={item.id}
                    icon={getMaintenanceIcon(title)}
                    tone={tone}
                    title={title}
                    subtitle={
                      item.status === "overdue"
                        ? t("overdue")
                        : `Due in ${remainingKm.toLocaleString()} km`
                    }
                    detail={progress}
                    onClick={() => navigate("/maintenance")}
                  />
                );
              })}
            </div>
          ) : (
            <GlassCard className="dashboard-empty-maintenance">
              <p>No maintenance warnings right now.</p>
              <span>Tracked service items will appear here when they approach their alert window.</span>
            </GlassCard>
          )}
        </section>

        <GlassCard className="dashboard-insights-card">
          <div className="dashboard-insights-header">
            <div>
              <h2>Quick Insights</h2>
              <p>Spending Trend ({t("currency")})</p>
            </div>
            <span>This Month</span>
          </div>

          <div className="dashboard-insights-body">
            <div className="dashboard-insights-copy">
              <strong>
                {spendingChange == null
                  ? "-"
                  : `${spendingChange > 0 ? "+" : ""}${spendingChange}%`}
              </strong>
              <span>vs {previousMonthLabel}</span>
              {efficiencyTrend.length > 0 && (
                <small>
                  Latest efficiency {formatEfficiency2Dec(efficiencyTrend[efficiencyTrend.length - 1])} km/L
                </small>
              )}
            </div>

            <Sparkline
              id="dashboard-spending"
              values={monthlySpending.map((month) => month.total)}
              labels={monthlySpending.map((month) => month.label)}
              height={112}
            />
          </div>
        </GlassCard>
      </div>


      <Modal
        isOpen={photoManagerOpen}
        onClose={closePhotoManager}
        title={photoManagerView === "library" ? "Previous vehicle photos" : "Vehicle photo"}
      >
        <div className="dashboard-image-manager-panel">
          <input
            ref={vehicleImageFileInputRef}
            type="file"
            accept="image/*"
            className="dashboard-image-manager-file"
            onChange={handleVehicleImageUpload}
          />

          {photoManagerView === "library" ? (
            <>
              <button
                type="button"
                className="dashboard-image-manager-back"
                onClick={() => setPhotoManagerView("menu")}
              >
                Back
              </button>

              {vehicleImageLibrary.length > 0 ? (
                <div className="dashboard-image-library-grid">
                  {vehicleImageLibrary.map((entry) => (
                    <button
                      type="button"
                      key={entry.id}
                      className={cn(
                        "dashboard-image-library-item",
                        activeVehicleImageEntryId === entry.id &&
                          "dashboard-image-library-item-active",
                      )}
                      onClick={() => selectVehicleImageFromLibrary(entry)}
                    >
                      <span className="dashboard-image-library-preview">
                        <VehicleArt
                          className="dashboard-image-library-preview-art"
                          src={entry.dataUrl}
                          alt={`${entry.originalName} preview`}
                          imageOffsetX={entry.settings.offsetX}
                          imageOffsetY={entry.settings.offsetY}
                          imageZoom={entry.settings.zoom}
                          imageRotate={entry.settings.rotate}
                          imageFlipX={entry.settings.flipX}
                          imageFlipY={entry.settings.flipY}
                        />
                      </span>
                      <span className="dashboard-image-library-meta">
                        <strong>{entry.originalName}</strong>
                        <small>
                          {entry.backgroundRemoved ? "Background removed" : "Original image"}
                        </small>
                        <small>{formatVehicleImageDate(entry.createdAt)}</small>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="dashboard-image-library-empty">
                  <Images className="h-5 w-5" strokeWidth={1.9} />
                  <p>No saved vehicle photos yet.</p>
                </div>
              )}
            </>
          ) : (
            <>
              <label className="dashboard-image-upload-toggle">
                <input
                  type="checkbox"
                  checked={removeBackgroundOnUpload}
                  onChange={(event) =>
                    setRemoveBackgroundOnUpload(event.target.checked)
                  }
                />
                <span>
                  <strong>Remove background</strong>
                  <small>Turn off if your photo is already transparent.</small>
                </span>
              </label>

              <div className="dashboard-image-manager-actions">
                <button type="button" onClick={startVehicleImageUpload}>
                  <Camera className="h-5 w-5" strokeWidth={1.9} />
                  <span>
                    <strong>Upload new image</strong>
                    <small>Process once and save it to this vehicle.</small>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setPhotoManagerView("library")}
                  disabled={vehicleImageLibrary.length === 0}
                >
                  <Images className="h-5 w-5" strokeWidth={1.9} />
                  <span>
                    <strong>Use previous image</strong>
                    <small>
                      {vehicleImageLibrary.length > 0
                        ? `${vehicleImageLibrary.length} saved for this vehicle`
                        : "No saved photos yet"}
                    </small>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => openVehicleImageAdjuster("edit")}
                  disabled={!hasManagedVehicleImage}
                >
                  <SlidersHorizontal className="h-5 w-5" strokeWidth={1.9} />
                  <span>
                    <strong>Edit position</strong>
                    <small>Move and resize the selected photo.</small>
                  </span>
                </button>

                <button
                  type="button"
                  className="danger"
                  onClick={removeActiveVehicleImage}
                  disabled={!hasManagedVehicleImage}
                >
                  <Trash2 className="h-5 w-5" strokeWidth={1.9} />
                  <span>
                    <strong>Remove current image</strong>
                    <small>Saved previous photos stay available.</small>
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={imageAdjustOpen}
        onClose={closeVehicleImageAdjuster}
        title="Adjust vehicle image"
      >
        <div className="dashboard-image-adjust-panel">
          <div className="dashboard-image-adjust-preview">
            <VehicleArt
              className="dashboard-image-adjust-preview-art"
              src={vehicleImageSrc}
              fallbackSrcs={vehicleImageFallbacks}
              alt={`${activeVehicle?.name || "Vehicle"} preview`}
              imageOffsetX={draftVehicleImageSettings.offsetX}
              imageOffsetY={draftVehicleImageSettings.offsetY}
              imageZoom={draftVehicleImageSettings.zoom}
              imageRotate={draftVehicleImageSettings.rotate}
              imageFlipX={draftVehicleImageSettings.flipX}
              imageFlipY={draftVehicleImageSettings.flipY}
            />
          </div>

          <div className="dashboard-image-adjust-controls">
            <label className="dashboard-image-adjust-control">
              <span>Horizontal position <strong>{Math.round(draftVehicleImageSettings.offsetX)}px</strong></span>
              <input
                type="range"
                min="-220"
                max="220"
                step="1"
                value={draftVehicleImageSettings.offsetX}
                onChange={(event) =>
                  updateDraftVehicleImageSettings({ offsetX: event.target.value })
                }
              />
            </label>

            <label className="dashboard-image-adjust-control">
              <span>Vertical position <strong>{Math.round(draftVehicleImageSettings.offsetY)}px</strong></span>
              <input
                type="range"
                min="-140"
                max="140"
                step="1"
                value={draftVehicleImageSettings.offsetY}
                onChange={(event) =>
                  updateDraftVehicleImageSettings({ offsetY: event.target.value })
                }
              />
            </label>

            <label className="dashboard-image-adjust-control">
              <span>Size / zoom <strong>{Math.round(draftVehicleImageSettings.zoom * 100)}%</strong></span>
              <input
                type="range"
                min="0.45"
                max="2.6"
                step="0.01"
                value={draftVehicleImageSettings.zoom}
                onChange={(event) =>
                  updateDraftVehicleImageSettings({ zoom: event.target.value })
                }
              />
            </label>

            <label className="dashboard-image-adjust-control">
              <span>Rotate <strong>{Math.round(draftVehicleImageSettings.rotate)} deg</strong></span>
              <input
                type="range"
                min="-180"
                max="180"
                step="1"
                value={draftVehicleImageSettings.rotate}
                onChange={(event) =>
                  updateDraftVehicleImageSettings({ rotate: event.target.value })
                }
              />
            </label>

            <div className="dashboard-image-flip-controls">
              <button
                type="button"
                className={draftVehicleImageSettings.flipX ? "active" : ""}
                onClick={() =>
                  updateDraftVehicleImageSettings({
                    flipX: !draftVehicleImageSettings.flipX,
                  })
                }
              >
                Flip horizontal
              </button>
              <button
                type="button"
                className={draftVehicleImageSettings.flipY ? "active" : ""}
                onClick={() =>
                  updateDraftVehicleImageSettings({
                    flipY: !draftVehicleImageSettings.flipY,
                  })
                }
              >
                Flip vertical
              </button>
            </div>
          </div>

          <div className="dashboard-image-adjust-actions">
            <button type="button" onClick={resetVehicleImageSettings}>
              Reset
            </button>
            <button type="button" onClick={closeVehicleImageAdjuster}>
              Cancel
            </button>
            <button type="button" className="primary" onClick={saveVehicleImageSettings}>
              Save
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={positionConfirmOpen}
        onClose={cancelPositionSaveChoice}
        title="Save this position?"
      >
        <div className="dashboard-position-confirm">
          <p>
            Replace the saved position for this photo, or use this adjustment only
            until the page refreshes?
          </p>
          <div className="dashboard-position-confirm-actions">
            <button type="button" onClick={cancelPositionSaveChoice}>
              Cancel
            </button>
            <button type="button" onClick={applyTemporaryVehicleImageSettings}>
              Use once
            </button>
            <button
              type="button"
              className="primary"
              onClick={() =>
                persistVehicleImageSettings(pendingVehicleImageSettings, {
                  updateLibrary: true,
                  message: "Saved position updated",
                })
              }
            >
              Save to photo
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={predictedModalOpen}
        onClose={() => {
          setPredictedModalOpen(false);
          setSelectedMaintenanceDetail(null);
        }}
        title={
          selectedMaintenanceDetail
            ? t(selectedMaintenanceDetail.categoryId)
            : t("due_soon")
        }
      >
        <div className="space-y-2 p-1">
          {selectedMaintenanceDetail ? (
            <>
              <button
                type="button"
                onClick={() => setSelectedMaintenanceDetail(null)}
                className="mb-2 text-xs font-bold uppercase text-[var(--accent-cyan)]"
              >
                {t("back")}
              </button>
              <div className="space-y-2">
                {getMaintenanceDetailRows(selectedMaintenanceDetail).map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-start justify-between gap-4 rounded-2xl bg-[rgba(127,139,154,0.1)] px-4 py-3"
                  >
                    <span className="text-xs font-bold text-[var(--text-muted)]">{label}</span>
                    <span className="max-w-[60%] text-end text-sm font-bold text-[var(--text-primary)]">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            upcomingMaintenance.map((item) => {
              const remainingKm = Math.max(
                0,
                Number(item.kmUntilDue ?? item.remainingKm ?? item.kmRemaining ?? 0),
              );

              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setSelectedMaintenanceDetail(item)}
                  className="w-full rounded-2xl border border-[var(--border-soft)] bg-[rgba(35,183,255,0.1)] p-4 text-start transition-transform active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 w-1.5 rounded-full"
                      style={{ backgroundColor: item.categoryColor }}
                    />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-[var(--accent-cyan)]">
                        {t(item.categoryId)}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                        {remainingKm.toLocaleString()} {t("km_left")}
                      </p>
                    </div>
                    <div className="text-end text-xs font-bold text-[var(--accent-cyan)]">
                      {item.projectedDate ? format(item.projectedDate, "MMM d") : "-"}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </Modal>
    </div>
  );
}
