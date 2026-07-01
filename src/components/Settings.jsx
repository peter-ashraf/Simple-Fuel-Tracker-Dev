import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useFuel } from "../hooks/useFuelContext";
import { useTheme } from "../hooks/useTheme";
import { getVehicleImageRecords } from "../utils/vehicleImageStore";
import { Card, Input, Label, cn, Modal, ConfirmModal, PageWrapper } from "./ui";
import {
  Bell as LucideBell,
  Camera,
  CarFront,
  ChevronDown,
  ChevronRight,
  BarChart3,
  CircleHelp,
  Fuel as LucideFuel,
  Heart,
  Info,
  Lock,
  Ruler,
  UserRound,
  X,
} from "lucide-react";
import {
  GlassCard,
  ScreenHeader,
  SettingsRow,
  VehicleArt,
} from "./PremiumUI";
import {
  Trash,
  Plus,
  Car,
  CurrencyDollar,
  WarningCircle,
  Palette,
  Pencil,
  Check,
  MapPin,
  NavigationArrow,
  Tire,
  Bell,
  Wrench,
  GearSix,
  FloppyDisk,
  Globe,
  DownloadSimple,
  UploadSimple,
  Database,
  SignOut,
  CloudArrowUp,
  User,
  Key,
  ArrowClockwise,
} from "@phosphor-icons/react";
import { useLocationDetection } from "../hooks/useLocationDetection";
import { gasStationService } from "../services/gasStationService";
import { SavedStations } from "./SavedStations";
import { backupService } from "../services/backupService";
import { excelService } from "../services/excelService";
import { cloudSyncService } from "../services/cloudSyncService";
import ImportResolver from "./ImportResolver";
import { useNotifications } from "../hooks/useNotifications";
import { useTranslation } from "react-i18next";
import { authService } from "../services/authService";
import { refreshLocalStorageState } from "../hooks/useLocalStorage";
import "./Settings.css";

const MotionDiv = motion.div;
const MIN_APP_UPDATE_CHECK_MS = 900;
const APP_VERSION = __APP_VERSION__;
const APP_BUILD_NUMBER = __APP_BUILD_NUMBER__;
const APP_BUILD_DATE = __APP_BUILD_DATE__;
const APP_VERSION_LABEL = APP_BUILD_NUMBER
  ? `v${APP_VERSION} (Build ${APP_BUILD_NUMBER})`
  : `v${APP_VERSION}`;
const todayISO = () => new Date().toISOString().substring(0, 10);
const cloudRestoreTypes = [
  { id: "fillups", label: "Fill-ups" },
  { id: "maintenance", label: "Maintenance entries" },
];

const wait = (duration) =>
  new Promise((resolve) => setTimeout(resolve, duration));

const toPositiveNumberOrNull = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const formatAppDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const getCloudRestoreItemKey = (type, record) => `${type}:${record.id}`;

const parseMaintenanceDescription = (description) => {
  if (!description) return { notes: "", interval: null, safety: null };

  try {
    const parsed = JSON.parse(description);
    return {
      notes: parsed.notes || "",
      interval: parsed.distance ?? null,
      safety: parsed.safety ?? null,
    };
  } catch {
    return { notes: description, interval: null, safety: null };
  }
};


const getSettingsDefaultVehicleImage = () => {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.endsWith("/") ? base : `${base}/`}vehicle-images/vehicle-hero-default.png`;
};

const DEFAULT_SETTINGS_VEHICLE_IMAGE_SETTINGS = {
  offsetX: 0,
  offsetY: 0,
  zoom: 1,
  rotate: 0,
  flipX: false,
  flipY: false,
};

const clampSettingsNumber = (value, min, max, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
};

const normalizeSettingsVehicleImageSettings = (settings = {}) => ({
  offsetX: clampSettingsNumber(
    settings.offsetX ??
      settings.x ??
      (settings.positionX != null
        ? (Number(settings.positionX) - 62) * 5
        : DEFAULT_SETTINGS_VEHICLE_IMAGE_SETTINGS.offsetX),
    -220,
    220,
    DEFAULT_SETTINGS_VEHICLE_IMAGE_SETTINGS.offsetX,
  ),
  offsetY: clampSettingsNumber(
    settings.offsetY ??
      settings.y ??
      (settings.positionY != null
        ? (Number(settings.positionY) - 54) * 3
        : DEFAULT_SETTINGS_VEHICLE_IMAGE_SETTINGS.offsetY),
    -140,
    140,
    DEFAULT_SETTINGS_VEHICLE_IMAGE_SETTINGS.offsetY,
  ),
  zoom: clampSettingsNumber(
    settings.zoom ?? settings.scale ?? DEFAULT_SETTINGS_VEHICLE_IMAGE_SETTINGS.zoom,
    0.45,
    2.6,
    DEFAULT_SETTINGS_VEHICLE_IMAGE_SETTINGS.zoom,
  ),
  rotate: clampSettingsNumber(
    settings.rotate ?? settings.rotation ?? DEFAULT_SETTINGS_VEHICLE_IMAGE_SETTINGS.rotate,
    -180,
    180,
    DEFAULT_SETTINGS_VEHICLE_IMAGE_SETTINGS.rotate,
  ),
  flipX: Boolean(settings.flipX ?? settings.flipHorizontal ?? false),
  flipY: Boolean(settings.flipY ?? settings.flipVertical ?? false),
});

const scaleSettingsHeroImageSettings = (settings = DEFAULT_SETTINGS_VEHICLE_IMAGE_SETTINGS) => {
  const normalized = normalizeSettingsVehicleImageSettings(settings);

  return {
    offsetX: normalized.offsetX * 0.44,
    offsetY: normalized.offsetY * 0.36,
    zoom: clampSettingsNumber(0.96 + (normalized.zoom - 1) * 0.72, 0.45, 2.6, 1),
    rotate: normalized.rotate,
    flipX: normalized.flipX,
    flipY: normalized.flipY,
  };
};

const normalizeSettingsImageValue = (value) => {
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
      return normalizeSettingsImageValue(JSON.parse(trimmed));
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

const getSettingsVehicleLookupIds = (vehicle) => {
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

const getSettingsVehicleObjectImage = (vehicle) =>
  normalizeSettingsImageValue(
    vehicle?.heroImageUrl ||
      vehicle?.hero_image_url ||
      vehicle?.imageUrl ||
      vehicle?.image_url ||
      vehicle?.photoUrl ||
      vehicle?.photo_url ||
      vehicle?.vehicleImageUrl ||
      vehicle?.vehicle_image_url ||
      vehicle?.heroImage ||
      vehicle?.vehicleImage ||
      vehicle?.image ||
      vehicle?.photo,
  );

const getSettingsStoredVehicleImage = (vehicle) => {
  if (!vehicle || typeof window === "undefined") return null;

  const ids = getSettingsVehicleLookupIds(vehicle);
  const directKeys = ids.flatMap((id) => [
    `sft_vehicle_image_${id}`,
    `vehicle_image_${id}`,
    `vehicleHeroImage:${id}`,
    `vehicle-image-${id}`,
  ]);

  for (const key of directKeys) {
    const value = normalizeSettingsImageValue(window.localStorage.getItem(key));
    if (value) return value;
  }

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const storageKey = window.localStorage.key(index);
    if (!storageKey) continue;
    if (!directKeys.some((key) => storageKey === key || storageKey.endsWith(key))) continue;
    const value = normalizeSettingsImageValue(window.localStorage.getItem(storageKey));
    if (value) return value;
  }

  for (const key of ["sft_vehicle_images", "vehicle_images"]) {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) || "{}");
      for (const id of ids) {
        const value = normalizeSettingsImageValue(parsed?.[id]);
        if (value) return value;
      }
    } catch {
      // Ignore legacy malformed values.
    }
  }

  return null;
};

const getSettingsVehicleImageActiveEntryKey = (vehicleId) => `sft_vehicle_image_active_${vehicleId}`;
const getSettingsVehicleImageSettingsKey = (vehicleId) => `sft_vehicle_image_settings_${vehicleId}`;

const getStoredSettingsVehicleImageSettings = (vehicle) => {
  if (!vehicle || typeof window === "undefined") {
    return DEFAULT_SETTINGS_VEHICLE_IMAGE_SETTINGS;
  }

  const ids = getSettingsVehicleLookupIds(vehicle);

  for (const id of ids) {
    const directKey = getSettingsVehicleImageSettingsKey(id);
    const directValue = window.localStorage.getItem(directKey);
    if (directValue) {
      try {
        return normalizeSettingsVehicleImageSettings(JSON.parse(directValue));
      } catch {
        return DEFAULT_SETTINGS_VEHICLE_IMAGE_SETTINGS;
      }
    }

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const storageKey = window.localStorage.key(index);
      if (!storageKey || (storageKey !== directKey && !storageKey.endsWith(directKey))) continue;

      try {
        const value = window.localStorage.getItem(storageKey);
        if (value) return normalizeSettingsVehicleImageSettings(JSON.parse(value));
      } catch {
        return DEFAULT_SETTINGS_VEHICLE_IMAGE_SETTINGS;
      }
    }
  }

  return DEFAULT_SETTINGS_VEHICLE_IMAGE_SETTINGS;
};

const getStoredSettingsVehicleImageActiveEntryId = (vehicleId) => {
  if (!vehicleId || typeof window === "undefined") return null;

  const key = getSettingsVehicleImageActiveEntryKey(vehicleId);
  const direct = window.localStorage.getItem(key);
  if (direct) return direct;

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const storageKey = window.localStorage.key(index);
    if (!storageKey || (!storageKey.endsWith(key) && storageKey !== key)) continue;
    const value = window.localStorage.getItem(storageKey);
    if (value) return value;
  }

  return null;
};

const getIndexedSettingsVehicleImage = async (vehicle) => {
  const ids = getSettingsVehicleLookupIds(vehicle);

  for (const id of ids) {
    try {
      const records = await getVehicleImageRecords(id);
      if (!records?.length) continue;

      const activeEntryId = getStoredSettingsVehicleImageActiveEntryId(id);
      const activeRecord =
        records.find((record) => record.id === activeEntryId) || records[0];
      const dataUrl = normalizeSettingsImageValue(activeRecord?.dataUrl);
      if (dataUrl) {
        return {
          dataUrl,
          settings: normalizeSettingsVehicleImageSettings(activeRecord?.settings),
        };
      }
    } catch (error) {
      console.warn("[Settings] Could not load active vehicle image.", error);
    }
  }

  return null;
};

export default function Settings() {
  const {
    vehicles,
    selectedVehicleId,
    setSelectedVehicleId,
    fuelPrices,
    setFuelPrices,
    addVehicle,
    editVehicle,
    deleteVehicle,
    activeVehicle,
  } = useFuel();
  const { theme, setTheme, textSize, setTextSize } = useTheme();
  const { t, i18n } = useTranslation();

  const [newVehicleName, setNewVehicleName] = useState("");
  const [editingVehicleId, setEditingVehicleId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [editingTyreSize, setEditingTyreSize] = useState({
    width: 205,
    aspectRatio: 55,
    rimSize: 16,
  });
  const [editingTankCapacity, setEditingTankCapacity] = useState("");
  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    vehicleId: null,
    vehicleName: "",
  });
  const [factoryResetModal, setFactoryResetModal] = useState(false);
  const [factoryResetPassword, setFactoryResetPassword] = useState("");
  const [factoryResetError, setFactoryResetError] = useState("");
  const [factoryResetLoading, setFactoryResetLoading] = useState(false);
  const [validationModal, setValidationModal] = useState({ isOpen: false });
  const [formatModal, setFormatModal] = useState({
    isOpen: false,
    type: "export",
  });

  // Fuel Price Form State
  const [priceForm, setPriceForm] = useState({ 92: "", 95: "", diesel: "" });

  useEffect(() => {
    if (fuelPrices) {
      setPriceForm({
        92: fuelPrices[92] || "",
        95: fuelPrices[95] || "",
        diesel: fuelPrices.diesel || "",
      });
    }
  }, [fuelPrices]);

  const handleSavePrices = () => {
    setFuelPrices({
      92: Number(priceForm[92]),
      95: Number(priceForm[95]),
      diesel: Number(priceForm.diesel),
    });
    showToast(t("prices_saved"));
  };

  // Active Vehicle Form State
  const [activeVehicleForm, setActiveVehicleForm] = useState(null);

  useEffect(() => {
    if (activeVehicle) {
      setActiveVehicleForm({
        tyreSize: activeVehicle.tyreSize || {
          width: "",
          aspectRatio: "",
          rimSize: "",
        },
        tankCapacity: activeVehicle.tankCapacity || "",
      });
    }
  }, [activeVehicle]);

  // Location detection state
  const [locationEnabled, setLocationEnabled] = useState(true);
  const { clearLocation } = useLocationDetection();

  // Notifications
  const {
    notificationsEnabled,
    permissionState,
    isNotificationSupported,
    toggleNotifications,
  } = useNotifications();

  const [importAnalysis, setImportAnalysis] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState(null);

  // Manual sync modal state
  const [manualSyncModalOpen, setManualSyncModalOpen] = useState(false);
  const [syncSummary, setSyncSummary] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const [syncConfirmModal, setSyncConfirmModal] = useState({
    isOpen: false,
    action: null,
  });
  const [cloudRestoreOpen, setCloudRestoreOpen] = useState(false);
  const [cloudRestoreFilters, setCloudRestoreFilters] = useState({
    fillups: true,
    maintenance: true,
  });
  const [cloudRestoreDateMode, setCloudRestoreDateMode] = useState("single");
  const [cloudRestoreDates, setCloudRestoreDates] = useState({
    single: todayISO(),
    start: todayISO(),
    end: todayISO(),
  });
  const [cloudRestoreIncludeDeleted, setCloudRestoreIncludeDeleted] =
    useState(false);
  const [cloudRestoreResults, setCloudRestoreResults] = useState({
    fillups: [],
    maintenance: [],
  });
  const [cloudRestoreSelected, setCloudRestoreSelected] = useState([]);
  const [cloudRestoreLoading, setCloudRestoreLoading] = useState(false);
  const [cloudRestoreRestoring, setCloudRestoreRestoring] = useState(false);
  const [cloudRestoreHasSearched, setCloudRestoreHasSearched] = useState(false);
  const [cloudRestoreError, setCloudRestoreError] = useState("");
  const [cloudRestoreSummary, setCloudRestoreSummary] = useState("");
  const [accountForm, setAccountForm] = useState({
    username: "",
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [oldPasswordReadOnly, setOldPasswordReadOnly] = useState(true);
  const [accountSaving, setAccountSaving] = useState(false);
  const [usernameError, setUsernameError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [notificationError, setNotificationError] = useState("");
  const [isCheckingAppUpdate, setIsCheckingAppUpdate] = useState(false);
  const [appUpdateCheckModal, setAppUpdateCheckModal] = useState({
    isOpen: false,
    status: null,
    registration: null,
    checkedAt: null,
  });
  const [activeSettingsSection, setActiveSettingsSection] = useState(null);
  const [activeSettingsTitle, setActiveSettingsTitle] = useState("");
  const [activeVehicleImage, setActiveVehicleImage] = useState(null);
  const [activeVehicleImageSettings, setActiveVehicleImageSettings] = useState(
    DEFAULT_SETTINGS_VEHICLE_IMAGE_SETTINGS,
  );
  const [settingsVehicleImages, setSettingsVehicleImages] = useState({});

  useEffect(() => {
    let cancelled = false;

    const loadActiveVehicleImage = async () => {
      if (!activeVehicle) {
        setActiveVehicleImage(null);
        setActiveVehicleImageSettings(DEFAULT_SETTINGS_VEHICLE_IMAGE_SETTINGS);
        return;
      }

      const indexedImage = await getIndexedSettingsVehicleImage(activeVehicle);
      const storedSettings = getStoredSettingsVehicleImageSettings(activeVehicle);
      const image =
        indexedImage?.dataUrl ||
        getSettingsStoredVehicleImage(activeVehicle) ||
        getSettingsVehicleObjectImage(activeVehicle) ||
        null;

      if (!cancelled) {
        setActiveVehicleImage(image);
        setActiveVehicleImageSettings(indexedImage?.settings || storedSettings);
      }
    };

    loadActiveVehicleImage();

    if (typeof window !== "undefined") {
      window.addEventListener("storage", loadActiveVehicleImage);
      window.addEventListener("focus", loadActiveVehicleImage);
    }

    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("storage", loadActiveVehicleImage);
        window.removeEventListener("focus", loadActiveVehicleImage);
      }
    };
  }, [activeVehicle]);

  useEffect(() => {
    let cancelled = false;

    const loadVehicleImages = async () => {
      const nextImages = {};

      await Promise.all(
        vehicles.map(async (vehicle) => {
          const indexedImage = await getIndexedSettingsVehicleImage(vehicle);
          const image =
            indexedImage?.dataUrl ||
            getSettingsStoredVehicleImage(vehicle) ||
            getSettingsVehicleObjectImage(vehicle);

          if (image) nextImages[vehicle.id] = image;
        }),
      );

      if (!cancelled) setSettingsVehicleImages(nextImages);
    };

    loadVehicleImages();

    if (typeof window !== "undefined") {
      window.addEventListener("storage", loadVehicleImages);
      window.addEventListener("focus", loadVehicleImages);
    }

    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("storage", loadVehicleImages);
        window.removeEventListener("focus", loadVehicleImages);
      }
    };
  }, [vehicles]);

  useEffect(() => {
    let cancelled = false;

    authService
      .getProfile()
      .then((profile) => {
        if (!cancelled && profile?.username) {
          setAccountForm((prev) => ({ ...prev, username: profile.username }));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const [toastMessage, setToastMessage] = useState("");
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 2500);
  };

  const handleCreateVehicle = (e) => {
    e.preventDefault();
    if (newVehicleName.trim()) {
      addVehicle({ name: newVehicleName.trim(), type: "car" });
      setNewVehicleName("");
      showToast(t("vehicle_added"));
    }
  };

  const handleSaveEdit = (id) => {
    if (editingName.trim()) {
      editVehicle(id, {
        name: editingName.trim(),
        tyreSize: {
          width: toPositiveNumberOrNull(editingTyreSize.width),
          aspectRatio: toPositiveNumberOrNull(editingTyreSize.aspectRatio),
          rimSize: toPositiveNumberOrNull(editingTyreSize.rimSize),
        },
        tankCapacity: toPositiveNumberOrNull(editingTankCapacity),
      });
      showToast(t("updated"));
    }
    setEditingVehicleId(null);
  };

  const startEditing = (vehicle) => {
    setEditingVehicleId(vehicle.id);
    setEditingName(vehicle.name);
    setEditingTyreSize(
      vehicle.tyreSize || { width: 205, aspectRatio: 55, rimSize: 16 },
    );
    setEditingTankCapacity(vehicle.tankCapacity || "");
  };

  const confirmFactoryReset = async () => {
    setFactoryResetError("");
    if (!factoryResetPassword) {
      setFactoryResetError("Enter your password to reset the app.");
      return;
    }

    setFactoryResetLoading(true);
    try {
      await authService.verifyCurrentPassword(factoryResetPassword);
      window.localStorage.clear();
      window.location.reload();
    } catch (error) {
      setFactoryResetError(error.message || "Password verification failed.");
    } finally {
      setFactoryResetLoading(false);
    }
  };

  const handleClearLocationCache = () => {
    gasStationService.clearCache();
    clearLocation();
  };

  const handleToggleNotifications = async () => {
    setNotificationError("");

    const enabled = await toggleNotifications();

    if (enabled) {
      showToast("Notifications enabled");
      return;
    }

    if (notificationsEnabled) {
      showToast("Notifications disabled");
      return;
    }

    if (!isNotificationSupported) {
      setNotificationError("This browser does not support notifications.");
      return;
    }

    if (permissionState === "denied" || Notification.permission === "denied") {
      setNotificationError(
        "Notifications are blocked. Enable them from browser or PWA settings.",
      );
      return;
    }

    setNotificationError("Notification permission was not granted.");
  };

  const showAppUpdateCheckModal = (status, extra = {}) => {
    setAppUpdateCheckModal({
      isOpen: true,
      status,
      registration: null,
      checkedAt: new Date().toISOString(),
      ...extra,
    });
  };

  const waitForWaitingServiceWorker = (registration) =>
    new Promise((resolve) => {
      if (registration.waiting) {
        resolve(registration);
        return;
      }

      const timeout = setTimeout(() => {
        registration.removeEventListener("updatefound", handleUpdateFound);
        resolve(null);
      }, 5000);

      function finish(result) {
        clearTimeout(timeout);
        registration.removeEventListener("updatefound", handleUpdateFound);
        resolve(result);
      }

      function handleUpdateFound() {
        const worker = registration.installing;

        if (!worker) {
          finish(null);
          return;
        }

        worker.addEventListener("statechange", () => {
          if (worker.state === "installed") {
            finish(registration.waiting ? registration : null);
          }
        });
      }

      registration.addEventListener("updatefound", handleUpdateFound);
    });

  const handleManualAppUpdateCheck = async () => {
    if (isCheckingAppUpdate) return;

    setIsCheckingAppUpdate(true);
    setAppUpdateCheckModal({ isOpen: true, status: "checking" });
    const minimumCheckingTime = wait(MIN_APP_UPDATE_CHECK_MS);

    try {
      if (!("serviceWorker" in navigator)) {
        await minimumCheckingTime;
        showAppUpdateCheckModal("error");
        return;
      }

      const registration = await navigator.serviceWorker.getRegistration();

      if (!registration) {
        await minimumCheckingTime;
        showAppUpdateCheckModal("none");
        return;
      }

      if (registration.waiting) {
        await minimumCheckingTime;
        showAppUpdateCheckModal("available", { registration });
        return;
      }

      const waitingForUpdate = waitForWaitingServiceWorker(registration);
      await registration.update();

      const updatedRegistration = await waitingForUpdate;

      if (updatedRegistration?.waiting) {
        await minimumCheckingTime;
        showAppUpdateCheckModal("available", { registration: updatedRegistration });
        return;
      }

      await minimumCheckingTime;
      showAppUpdateCheckModal("none");
    } catch (error) {
      console.error("[Settings][update-check] Manual app update check failed:", error);
      await minimumCheckingTime;
      showAppUpdateCheckModal("error");
    } finally {
      setIsCheckingAppUpdate(false);
    }
  };

  const handleApplyCheckedAppUpdate = () => {
    const registration = appUpdateCheckModal.registration;
    setAppUpdateCheckModal((prev) => ({ ...prev, status: "applying" }));

    const reloadOnce = () => {
      window.location.reload();
    };

    if (registration?.waiting) {
      navigator.serviceWorker?.addEventListener("controllerchange", reloadOnce, {
        once: true,
      });
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
      setTimeout(reloadOnce, 2500);
      return;
    }

    window.location.reload();
  };

  const handleExport = async (type = "json") => {
    if (type === "excel") await excelService.exportData();
    else backupService.exportData();
  };

  const handleImportClick = (type = "json") => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = type === "excel" ? ".xlsx, .xls" : ".json";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      setIsImporting(true);
      try {
        const analysis =
          type === "excel"
            ? await excelService.analyzeImport(file)
            : await backupService.analyzeImport(file);
        setImportAnalysis(analysis);
      } catch (err) {
        setImportError(err.message);
      } finally {
        setIsImporting(false);
      }
    };
    input.click();
  };

  const handleApplyImport = (resolutions, newRecords) => {
    backupService.applyImport(importAnalysis.payload, resolutions, newRecords);
    setImportAnalysis(null);
  };

  const handleLogout = async () => {
    try {
      await authService.signOut();
      window.location.reload();
    } catch (error) {
      console.error("Logout error:", error);
      showToast("Logout failed");
    }
  };

  const handleSaveUsername = async () => {
    setUsernameError("");
    setPasswordError("");
    setAccountSaving(true);

    try {
      const profile = await authService.updateUsername(accountForm.username);
      setAccountForm((prev) => ({ ...prev, username: profile.username }));
      showToast("Username updated");
    } catch (error) {
      setUsernameError(error.message || "Failed to update username.");
    } finally {
      setAccountSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError("");
    setUsernameError("");

    if (!accountForm.oldPassword) {
      setPasswordError("Please enter your current password.");
      return;
    }

    if (accountForm.newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }

    if (accountForm.newPassword !== accountForm.confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setAccountSaving(true);

    try {
      await authService.updatePassword(accountForm.oldPassword, accountForm.newPassword);
      setAccountForm((prev) => ({
        ...prev,
        oldPassword: "",
        newPassword: "",
        confirmPassword: "",
      }));
      showToast("Password updated");
    } catch (error) {
      setPasswordError(error.message || "Failed to update password.");
    } finally {
      setAccountSaving(false);
    }
  };

  const handleOpenManualSync = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const userId = await cloudSyncService.getUserId();
      if (!userId) {
        showToast("You must be logged in to sync data.");
        setIsSyncing(false);
        return;
      }

      const summary = await cloudSyncService.getSyncStatus(userId);
      setSyncSummary(summary);
      setManualSyncModalOpen(true);
      setRefreshCount((prev) => prev + 1);
    } catch (error) {
      console.error("Failed to fetch sync summary:", error);
      showToast("Failed to fetch sync status.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCloseManualSync = () => {
    setManualSyncModalOpen(false);
    setSyncSummary(null);
    setSyncResult(null);
    setRefreshCount(0);
  };

  const handleManualSyncAction = async (action) => {
    // Show confirmation for destructive actions
    if (action === "download") {
      setSyncConfirmModal({
        isOpen: true,
        action: "download",
        title: "Download Cloud Data",
        message:
          "This will replace all local data on this device with your cloud data. Any unsynced local changes will be lost.",
        confirmText: "Download",
      });
      return;
    } else if (action === "merge") {
      setSyncConfirmModal({
        isOpen: true,
        action: "merge",
        title: "Merge Data",
        message:
          "This will merge local and cloud data. Conflicts will be resolved by keeping the most recent version of each record.",
        confirmText: "Merge",
      });
      return;
    }

    // Upload is non-destructive, proceed directly
    performSyncAction(action);
  };

  const performSyncAction = async (action) => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const userId = await cloudSyncService.getUserId();
      if (!userId) {
        setSyncResult({
          success: false,
          message: "You must be logged in to sync data.",
        });
        setIsSyncing(false);
        return;
      }

      let result;
      switch (action) {
        case "upload":
          result = await cloudSyncService.uploadLocalDataToCloud(userId);
          break;
        case "download":
          result = await cloudSyncService.downloadCloudDataToLocal(userId);
          break;
        case "merge":
          result = await cloudSyncService.mergeLocalDataToCloud(userId);
          break;
        default:
          throw new Error("Unknown sync action");
      }

      setSyncResult(result);
      if (result.success) {
        if (action === "download" || action === "merge") {
          refreshLocalStorageState();
        }
        showToast("Sync completed successfully");
      }
    } catch (error) {
      setSyncResult({
        success: false,
        message: "Sync failed due to an unexpected error.",
        details: [error.message],
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const getCloudRestoreRange = () => {
    if (cloudRestoreDateMode === "single") {
      return {
        startDate: cloudRestoreDates.single,
        endDate: cloudRestoreDates.single,
      };
    }

    return {
      startDate: cloudRestoreDates.start,
      endDate: cloudRestoreDates.end,
    };
  };

  const getSelectedCloudRestoreTypes = () =>
    Object.entries(cloudRestoreFilters)
      .filter(([, selected]) => selected)
      .map(([type]) => type);

  const getCloudRestoreResultsList = () => [
    ...cloudRestoreResults.fillups.map((record) => ({
      type: "fillups",
      record,
    })),
    ...cloudRestoreResults.maintenance.map((record) => ({
      type: "maintenance",
      record,
    })),
  ];

  const handleCloudRestoreSearch = async () => {
    const selectedTypes = getSelectedCloudRestoreTypes();
    const { startDate, endDate } = getCloudRestoreRange();

    setCloudRestoreError("");
    setCloudRestoreSummary("");

    if (!selectedTypes.length) {
      setCloudRestoreError("Select at least one data type to search.");
      return;
    }

    if (!startDate || !endDate) {
      setCloudRestoreError("Select a valid date or date interval.");
      return;
    }

    if (startDate > endDate) {
      setCloudRestoreError("Start date must be before or equal to end date.");
      return;
    }

    setCloudRestoreLoading(true);
    setCloudRestoreSelected([]);

    try {
      const userId = await cloudSyncService.getUserId();
      if (!userId) {
        setCloudRestoreError("You must be logged in to restore cloud data.");
        return;
      }

      const results = await cloudSyncService.searchCloudRestoreRecords(userId, {
        types: selectedTypes,
        startDate,
        endDate,
        includeDeleted: cloudRestoreIncludeDeleted,
      });

      setCloudRestoreResults(results);
      setCloudRestoreHasSearched(true);
    } catch (error) {
      setCloudRestoreError(error.message || "Failed to search cloud records.");
    } finally {
      setCloudRestoreLoading(false);
    }
  };

  const toggleCloudRestoreSelection = (type, record) => {
    const key = getCloudRestoreItemKey(type, record);
    setCloudRestoreSelected((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    );
  };

  const selectAllCloudRestoreResults = () => {
    setCloudRestoreSelected(
      getCloudRestoreResultsList().map(({ type, record }) =>
        getCloudRestoreItemKey(type, record),
      ),
    );
  };

  const restoreCloudRecord = async (userId, type, record) => {
    if (type === "fillups") {
      if (record.deleted_at) {
        await cloudSyncService.restoreDeletedFillup(userId, record);
        return "restored";
      }

      cloudSyncService.downloadSingleFillup(record);
      return "downloaded";
    }

    if (type === "maintenance") {
      if (record.deleted_at) {
        await cloudSyncService.restoreDeletedMaintenance(userId, record);
        return "restored";
      }

      cloudSyncService.downloadSingleMaintenance(record);
      return "downloaded";
    }

    return "skipped";
  };

  const handleRestoreCloudRecords = async (records) => {
    if (!records.length) return;

    setCloudRestoreError("");
    setCloudRestoreSummary("");
    setCloudRestoreRestoring(true);

    try {
      const userId = await cloudSyncService.getUserId();
      if (!userId) {
        setCloudRestoreError("You must be logged in to restore cloud data.");
        return;
      }

      const counts = { restored: 0, downloaded: 0, skipped: 0 };

      for (const { type, record } of records) {
        const result = await restoreCloudRecord(userId, type, record);
        counts[result] = (counts[result] || 0) + 1;
      }

      refreshLocalStorageState();
      window.dispatchEvent(new Event("fueltracker-local-storage-refresh"));
      setCloudRestoreSelected([]);
      setCloudRestoreSummary(
        `Restore complete: ${counts.restored + counts.downloaded} records restored, ${counts.skipped} skipped.`,
      );
      showToast("Cloud restore complete");
    } catch (error) {
      setCloudRestoreError(error.message || "Failed to restore cloud records.");
    } finally {
      setCloudRestoreRestoring(false);
    }
  };

  const handleRestoreSelectedCloudRecords = () => {
    const selected = getCloudRestoreResultsList().filter(({ type, record }) =>
      cloudRestoreSelected.includes(getCloudRestoreItemKey(type, record)),
    );
    handleRestoreCloudRecords(selected);
  };

  const handleSaveActiveVehicleDetails = () => {
    if (!activeVehicleForm) return;
    const { tyreSize, tankCapacity } = activeVehicleForm;
    const isMissingTyre =
      !tyreSize.width || !tyreSize.aspectRatio || !tyreSize.rimSize;
    const isMissingTank = !tankCapacity;

    if (isMissingTyre || isMissingTank) {
      setValidationModal({ isOpen: true, isMissingTyre, isMissingTank });
    } else {
      // Check if anything actually changed
      const currentTyre = activeVehicle.tyreSize || {};
      const nextTyre = {
        width: toPositiveNumberOrNull(tyreSize.width),
        aspectRatio: toPositiveNumberOrNull(tyreSize.aspectRatio),
        rimSize: toPositiveNumberOrNull(tyreSize.rimSize),
      };
      const hasTyreChanged =
        nextTyre.width !== Number(currentTyre.width) ||
        nextTyre.aspectRatio !== Number(currentTyre.aspectRatio) ||
        nextTyre.rimSize !== Number(currentTyre.rimSize);

      const hasTankChanged =
        toPositiveNumberOrNull(tankCapacity) !== Number(activeVehicle.tankCapacity);

      if (!hasTyreChanged && !hasTankChanged) {
        showToast(t("no_changes"));
        return;
      }

      confirmSaveActiveVehicleDetails();
    }
  };

  const confirmSaveActiveVehicleDetails = () => {
    if (!activeVehicleForm) return;
    editVehicle(activeVehicle.id, {
      tyreSize: {
        width: toPositiveNumberOrNull(activeVehicleForm.tyreSize?.width),
        aspectRatio: toPositiveNumberOrNull(activeVehicleForm.tyreSize?.aspectRatio),
        rimSize: toPositiveNumberOrNull(activeVehicleForm.tyreSize?.rimSize),
      },
      tankCapacity: toPositiveNumberOrNull(activeVehicleForm.tankCapacity),
    });
    setValidationModal({ isOpen: false });
    showToast(t("details_saved"));
  };

  const currentLanguage = i18n.language.startsWith("ar") ? "ar" : "en";
  const selectedTextSize = ["compact", "default", "large"].includes(textSize)
    ? textSize
    : "default";
  const cloudRestoreResultsList = getCloudRestoreResultsList();
  const cloudRestoreResultCount = cloudRestoreResultsList.length;
  const cloudRestoreSelectedCount = cloudRestoreSelected.length;
  const getCloudVehicleName = (vehicleId) =>
    vehicles.find((vehicle) => vehicle.id === vehicleId)?.name ||
    "Unknown vehicle";
  const profileUsername = accountForm.username?.trim();
  const profileName =
    profileUsername && profileUsername !== "dev-local"
      ? profileUsername
      : "Peter Ashraf";
  const profileHandle =
    profileUsername && profileUsername !== "dev-local"
      ? profileUsername
      : "peter.ashraf16";
  const profileVehicleName = activeVehicle?.name || "Vehicle";
  const profileVehicleImage =
    activeVehicleImage ||
    getSettingsStoredVehicleImage(activeVehicle) ||
    getSettingsVehicleObjectImage(activeVehicle) ||
    getSettingsDefaultVehicleImage();
  const profileVehicleImageSettings = scaleSettingsHeroImageSettings(
    activeVehicleImageSettings,
  );
  const settingsRows = [
    {
      title: "My Profile",
      subtitle: "Personal information and account",
      section: "account",
      icon: UserRound,
      tone: "green",
    },
    {
      title: "My Vehicles",
      subtitle: "Manage your vehicles",
      section: "vehicles",
      icon: CarFront,
      tone: "blue",
    },
    {
      title: "Fuel Preferences",
      subtitle: "Fuel types, prices & efficiency",
      section: "fuel",
      icon: LucideFuel,
      tone: "orange",
    },
    {
      title: "Reminders",
      subtitle: "Set alerts and notifications",
      section: "reminders",
      icon: LucideBell,
      tone: "purple",
    },
    {
      title: "Appearance & Language",
      subtitle: "Theme, language and visual preferences",
      section: "display",
      icon: BarChart3,
      tone: "teal",
    },
    {
      title: "Privacy",
      subtitle: "Manage your data and privacy",
      section: "privacy",
      icon: Lock,
      tone: "blue",
    },
    {
      title: "Help & Support",
      subtitle: "FAQs, contact us and troubleshooting",
      section: "support",
      icon: CircleHelp,
      tone: "violet",
    },
    {
      title: "About Simple Fuel Tracker",
      subtitle: "App info, terms and policies",
      section: "about",
      icon: Info,
      tone: "green",
    },
  ];
  const openSettingsPanel = (row) => {
    setActiveSettingsSection(row.section);
    setActiveSettingsTitle(row.title);
  };
  const closeSettingsPanel = () => {
    setActiveSettingsSection(null);
    setActiveSettingsTitle("");
  };

  return (
    <div className="settings-premium-screen">
      <div className="settings-fixed-zone">
        <header className="settings-page-header" aria-label="Settings header">
          <h1>{t("settings") || "Settings"}</h1>
        </header>

        <section className="settings-profile-hero" aria-label="Profile summary">
          <div className="settings-profile-avatar-wrap">
            <div className="settings-profile-avatar" aria-hidden="true">
              <div className="settings-avatar-face">
                <span className="settings-avatar-hair" />
                <span className="settings-avatar-head" />
                <span className="settings-avatar-neck" />
                <span className="settings-avatar-shirt" />
              </div>
            </div>
            <button
              type="button"
              className="settings-avatar-camera"
              aria-label="Change profile photo"
              onClick={() => openSettingsPanel(settingsRows[0])}
            >
              <Camera className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>

          <div className="settings-profile-copy">
            <h2>{profileName}</h2>
            <p>{profileHandle}</p>
            <div className="settings-profile-vehicle-line">
              <CarFront className="h-4 w-4" strokeWidth={1.8} />
              <span>{profileVehicleName}</span>
              <strong>Active</strong>
            </div>
          </div>

          <div className="settings-profile-car" aria-hidden="true">
            <VehicleArt
              src={profileVehicleImage}
              alt={profileVehicleName}
              objectPosition="center right"
              imageOffsetX={profileVehicleImageSettings.offsetX}
              imageOffsetY={profileVehicleImageSettings.offsetY}
              imageZoom={profileVehicleImageSettings.zoom}
              imageRotate={profileVehicleImageSettings.rotate}
              imageFlipX={profileVehicleImageSettings.flipX}
              imageFlipY={profileVehicleImageSettings.flipY}
              className="settings-profile-car-art"
            />
          </div>
        </section>
      </div>

      <div className="settings-premium-scroll">
        <section className="settings-menu-card" aria-label="Settings sections">
          {settingsRows.map((row) => {
            const RowIcon = row.icon;
            return (
              <button
                key={row.title}
                type="button"
                className="settings-menu-row"
                onClick={() => openSettingsPanel(row)}
              >
                <span className={`settings-menu-icon settings-menu-icon-${row.tone}`} aria-hidden="true">
                  <RowIcon className="h-6 w-6" strokeWidth={1.85} />
                </span>
                <span className="settings-menu-copy">
                  <span className="settings-menu-label">{row.title}</span>
                  <span className="settings-menu-subtitle">{row.subtitle}</span>
                </span>
                <ChevronRight className="settings-menu-chevron" strokeWidth={2} />
              </button>
            );
          })}
        </section>

        <section className="settings-eco-card" aria-label="Savings encouragement">
          <div className="settings-plant-art" aria-hidden="true">
            <span className="settings-leaf settings-leaf-1" />
            <span className="settings-leaf settings-leaf-2" />
            <span className="settings-leaf settings-leaf-3" />
            <span className="settings-leaf settings-leaf-4" />
            <span className="settings-stem" />
            <span className="settings-pot" />
          </div>
          <div className="settings-eco-copy">
            <h3>You&apos;re all set!</h3>
            <p>We&apos;ll help you save more every day.</p>
          </div>
          <span className="settings-eco-heart-wrap" aria-hidden="true">
            <Heart className="settings-eco-heart" strokeWidth={2.4} />
          </span>
        </section>

        <button
          type="button"
          onClick={handleLogout}
          className="settings-logout-button"
        >
          <span className="settings-logout-icon" aria-hidden="true">
            <SignOut size={22} weight="bold" />
          </span>
          <span className="settings-logout-copy">
            <span>{t("logout") || "Logout"}</span>
            <small>Sign out from your account</small>
          </span>
        </button>
      </div>

      <AnimatePresence>
        {Boolean(activeSettingsSection) && (
          <div className="settings-sheet-layer" role="presentation">
            <MotionDiv
              className="settings-sheet-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={closeSettingsPanel}
            />
            <MotionDiv
              className="settings-sheet"
              role="dialog"
              aria-modal="true"
              aria-label={activeSettingsTitle || t("settings")}
              initial={{ opacity: 0, y: 32, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.985 }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            >
              <div className="settings-sheet-header">
                <h2>{activeSettingsTitle || t("settings")}</h2>
                <button
                  type="button"
                  className="settings-sheet-close"
                  onClick={closeSettingsPanel}
                  aria-label={t("close") || "Close"}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <MotionDiv
                key={`${activeSettingsSection}-${activeSettingsTitle}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className="settings-sheet-body"
              >

      {activeSettingsSection === "vehicles" && (
        <section className="settings-panel-stack settings-panel-stack-vehicles">
          <div className="settings-section-heading blue">
            <CarFront className="h-4 w-4" strokeWidth={1.8} />
            <span>Your Garage</span>
          </div>

          <div className="settings-vehicle-list">
            {vehicles.map((vehicle) => {
              const selected = vehicle.id === selectedVehicleId;
              const editing = editingVehicleId === vehicle.id;
              const tyreSize = vehicle.tyreSize || {};
              const tyreLabel = `${tyreSize.width || "-"}/${tyreSize.aspectRatio || "-"} R${tyreSize.rimSize || "-"}`;
              const vehicleThumb =
                selected && profileVehicleImage
                  ? profileVehicleImage
                  : settingsVehicleImages[vehicle.id]
                    ? settingsVehicleImages[vehicle.id]
                  : getSettingsVehicleObjectImage(vehicle) ||
                    getSettingsStoredVehicleImage(vehicle) ||
                    getSettingsDefaultVehicleImage();

              return (
                <article
                  key={vehicle.id}
                  className={cn("settings-vehicle-card", selected && "is-active")}
                >
                  <button
                    type="button"
                    className="settings-vehicle-select"
                    onClick={() => setSelectedVehicleId(vehicle.id)}
                    aria-label={`Select ${vehicle.name}`}
                  >
                    <span className="settings-vehicle-thumb">
                      <img src={vehicleThumb} alt="" />
                    </span>
                    <span className="settings-vehicle-main">
                      {editing ? (
                        <Input
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          className="settings-inline-input"
                          autoFocus
                        />
                      ) : (
                        <strong>{vehicle.name}</strong>
                      )}
                      <small><Tire size={14} weight="duotone" /> {tyreLabel}</small>
                    </span>
                    <span className={cn("settings-active-dot", selected && "is-selected")}>
                      {selected && <Check size={14} weight="bold" />}
                    </span>
                  </button>

                  {editing && (
                    <div className="settings-vehicle-edit-grid">
                      <label>
                        <span>Width</span>
                        <Input
                          type="number"
                          inputMode="numeric"
                          step="1"
                          value={editingTyreSize.width ?? ""}
                          onChange={(event) =>
                            setEditingTyreSize((prev) => ({ ...prev, width: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        <span>Ratio</span>
                        <Input
                          type="number"
                          inputMode="numeric"
                          step="1"
                          value={editingTyreSize.aspectRatio ?? ""}
                          onChange={(event) =>
                            setEditingTyreSize((prev) => ({ ...prev, aspectRatio: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        <span>Rim</span>
                        <Input
                          type="number"
                          inputMode="numeric"
                          step="1"
                          value={editingTyreSize.rimSize ?? ""}
                          onChange={(event) =>
                            setEditingTyreSize((prev) => ({ ...prev, rimSize: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        <span>Tank</span>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.1"
                          value={editingTankCapacity ?? ""}
                          onChange={(event) => setEditingTankCapacity(event.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        className="settings-secondary-action"
                        onClick={() => setEditingVehicleId(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="settings-primary-action compact"
                        onClick={() => handleSaveEdit(vehicle.id)}
                      >
                        <FloppyDisk size={15} weight="duotone" /> Save Vehicle
                      </button>
                    </div>
                  )}

                  <div className="settings-vehicle-actions">
                    <button type="button" onClick={() => startEditing(vehicle)}>
                      <Pencil size={16} weight="duotone" /> Edit
                    </button>
                    <button
                      type="button"
                      className="danger"
                      disabled={vehicles.length <= 1}
                      onClick={() =>
                        setDeleteModal({
                          isOpen: true,
                          vehicleId: vehicle.id,
                          vehicleName: vehicle.name,
                        })
                      }
                    >
                      <Trash size={16} weight="duotone" /> Delete
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <form className="settings-add-vehicle-card" onSubmit={handleCreateVehicle}>
            <Input
              value={newVehicleName}
              onChange={(event) => setNewVehicleName(event.target.value)}
              placeholder="New vehicle name"
              className="settings-add-vehicle-input"
            />
            <button type="submit" aria-label="Add vehicle">
              <Plus size={20} weight="bold" />
            </button>
          </form>

          {activeVehicle && activeVehicleForm && (
            <div className="settings-active-details-card">
              <div className="settings-section-title-row">
                <div>
                  <span className="settings-section-kicker">Active Vehicle Details</span>
                  <h3>{activeVehicle.name}</h3>
                </div>
                <button type="button" className="settings-primary-pill" onClick={handleSaveActiveVehicleDetails}>
                  Save Details
                </button>
              </div>

              <div className="settings-form-grid four">
                <label className="settings-field">
                  <span>Width</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    step="1"
                    value={activeVehicleForm.tyreSize?.width ?? ""}
                    onChange={(event) =>
                      setActiveVehicleForm((prev) => ({
                        ...prev,
                        tyreSize: { ...prev.tyreSize, width: event.target.value },
                      }))
                    }
                  />
                </label>
                <label className="settings-field">
                  <span>Ratio</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    step="1"
                    value={activeVehicleForm.tyreSize?.aspectRatio ?? ""}
                    onChange={(event) =>
                      setActiveVehicleForm((prev) => ({
                        ...prev,
                        tyreSize: { ...prev.tyreSize, aspectRatio: event.target.value },
                      }))
                    }
                  />
                </label>
                <label className="settings-field">
                  <span>Rim</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    step="1"
                    value={activeVehicleForm.tyreSize?.rimSize ?? ""}
                    onChange={(event) =>
                      setActiveVehicleForm((prev) => ({
                        ...prev,
                        tyreSize: { ...prev.tyreSize, rimSize: event.target.value },
                      }))
                    }
                  />
                </label>
                <label className="settings-field">
                  <span>Liters</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={activeVehicleForm.tankCapacity ?? ""}
                    onChange={(event) =>
                      setActiveVehicleForm((prev) => ({ ...prev, tankCapacity: event.target.value }))
                    }
                  />
                </label>
              </div>

              <div className="settings-photo-note">
                <Camera className="h-4 w-4" strokeWidth={1.8} />
                <span>Vehicle photo and position are shared with the Dashboard photo manager.</span>
              </div>
            </div>
          )}
        </section>
      )}

      {activeSettingsSection === "fuel" && (
        <section className="settings-panel-stack">
          <div className="settings-section-heading green">
            <NavigationArrow size={17} weight="duotone" />
            <span>Location Services</span>
          </div>
          <div className="settings-panel-card compact">
            <div className="settings-panel-row no-border">
              <span className="settings-panel-icon green"><MapPin size={17} weight="duotone" /></span>
              <div className="settings-panel-copy">
                <h3>Station detection</h3>
                <p>Suggest nearby or saved stations during fill-up entry.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={locationEnabled}
                onClick={() => setLocationEnabled((value) => !value)}
                className={cn("settings-switch", locationEnabled && "is-on")}
              >
                <span />
              </button>
            </div>
            <button type="button" className="settings-text-action" onClick={handleClearLocationCache}>
              Clear cached location and station suggestions
            </button>
          </div>

          <div className="settings-section-heading orange">
            <CurrencyDollar size={17} weight="duotone" />
            <span>Global Fuel Prices</span>
          </div>
          <div className="settings-panel-card fuel-prices-card">
            <div className="settings-form-grid">
              <label className="settings-field">
                <span>Petrol 92</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={priceForm[92]}
                  onChange={(event) =>
                    setPriceForm((prev) => ({ ...prev, 92: event.target.value }))
                  }
                />
              </label>
              <label className="settings-field">
                <span>Petrol 95</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={priceForm[95]}
                  onChange={(event) =>
                    setPriceForm((prev) => ({ ...prev, 95: event.target.value }))
                  }
                />
              </label>
              <label className="settings-field wide">
                <span>Diesel</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={priceForm.diesel}
                  onChange={(event) =>
                    setPriceForm((prev) => ({ ...prev, diesel: event.target.value }))
                  }
                />
              </label>
            </div>
            <button type="button" className="settings-primary-action" onClick={handleSavePrices}>
              <FloppyDisk size={16} weight="duotone" /> Save Prices
            </button>
          </div>
        </section>
      )}

      {activeSettingsSection === "reminders" && (
        <section className="settings-panel-stack">
          <div className="settings-panel-card compact">
            <div className="settings-panel-row no-border">
              <span className="settings-panel-icon amber"><LucideBell className="h-4 w-4" strokeWidth={1.8} /></span>
              <div className="settings-panel-copy">
                <h3>App Notifications</h3>
                <p>{notificationsEnabled ? "Maintenance and app reminders are enabled." : "Enable reminders for maintenance and alerts."}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={notificationsEnabled}
                onClick={handleToggleNotifications}
                className={cn("settings-switch", notificationsEnabled && "is-on")}
              >
                <span />
              </button>
            </div>
            {notificationError && <p className="settings-panel-warning">{notificationError}</p>}
            {!isNotificationSupported && <p className="settings-panel-warning">This browser does not support notifications.</p>}
            <p className="settings-panel-note">Permission: {permissionState || "default"}</p>
          </div>

          <div className="settings-panel-card compact">
            <div className="settings-panel-row no-border">
              <span className="settings-panel-icon purple"><Wrench size={17} weight="duotone" /></span>
              <div className="settings-panel-copy">
                <h3>Maintenance Reminders</h3>
                <p>Maintenance due-soon logic is controlled from the Maintenance section.</p>
              </div>
            </div>
            <p className="settings-panel-note">This keeps reminder rules connected to real systems, categories, intervals and safety margins.</p>
          </div>
        </section>
      )}

      {activeSettingsSection === "display" && (
        <section className="settings-panel-stack">
          <div className="settings-panel-card">
            <div className="settings-section-title-row flat">
              <div>
                <span className="settings-section-kicker">Display</span>
                <h3>Theme</h3>
              </div>
              <Palette size={18} weight="duotone" />
            </div>
            <div className="settings-segmented-control">
              {[
                { id: "light", label: "Light" },
                { id: "dark", label: "Dark" },
                { id: "system", label: "System" },
              ].map((themeOption) => (
                <button
                  key={themeOption.id}
                  type="button"
                  className={cn("settings-segment", theme === themeOption.id && "is-active")}
                  onClick={() => {
                    setTheme(themeOption.id);
                    showToast(t("updated") || "Updated");
                  }}
                >
                  {themeOption.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-panel-card">
            <div className="settings-section-title-row flat">
              <div>
                <span className="settings-section-kicker">Display</span>
                <h3>Text Size</h3>
              </div>
              <Ruler size={18} weight="duotone" />
            </div>
            <div className="settings-segmented-control">
              {[
                { id: "compact", label: "Compact" },
                { id: "default", label: "Default" },
                { id: "large", label: "Large" },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={cn("settings-segment", selectedTextSize === option.id && "is-active")}
                  onClick={() => {
                    setTextSize(option.id);
                    showToast(t("updated") || "Updated");
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="settings-panel-note">
              Adjusts app typography for denser screens or easier reading.
            </p>
          </div>

          <div className="settings-panel-card">
            <div className="settings-section-title-row flat">
              <div>
                <span className="settings-section-kicker">Language</span>
                <h3>App Language</h3>
              </div>
              <Globe size={18} weight="duotone" />
            </div>
            <div className="settings-segmented-control two">
              {[
                { id: "en", label: "English" },
                { id: "ar", label: "Arabic" },
              ].map((lang) => (
                <button
                  key={lang.id}
                  type="button"
                  className={cn("settings-segment", currentLanguage === lang.id && "is-active")}
                  onClick={() => {
                    i18n.changeLanguage(lang.id);
                    showToast(t("updated") || "Updated");
                  }}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-panel-card compact muted">
            <p className="settings-panel-note">
              Unit conversion is intentionally not exposed here yet. When km/miles, liters/gallons,
              currency, and efficiency formats are added, they must be wired across Dashboard, Add Fill-up,
              History, Analytics, exports, and calculations.
            </p>
          </div>
        </section>
      )}

      {activeSettingsSection === "privacy" && (
        <section className="settings-panel-stack">
          <div className="settings-section-heading green">
            <Database size={17} weight="duotone" />
            <span>Data Management</span>
          </div>
          <div className="settings-panel-card compact">
            <div className="settings-action-grid">
              <button type="button" onClick={() => setFormatModal({ isOpen: true, type: "export" })}>
                <DownloadSimple weight="duotone" className="h-4 w-4" /> Export
              </button>
              <button type="button" onClick={() => setFormatModal({ isOpen: true, type: "import" })}>
                <UploadSimple weight="duotone" className="h-4 w-4" /> Import
              </button>
            </div>
            <button type="button" className="settings-primary-action" onClick={handleOpenManualSync}>
              <CloudArrowUp weight="duotone" className="h-4 w-4" /> Manual Cloud Sync
            </button>
            <button type="button" className="settings-secondary-action" onClick={() => setCloudRestoreOpen(true)}>
              Cloud Restore
            </button>
          </div>

          <div className="settings-panel-card danger compact">
            <div className="settings-panel-row no-border">
              <span className="settings-panel-icon danger"><WarningCircle size={17} weight="duotone" /></span>
              <div className="settings-panel-copy">
                <h3>Factory Reset</h3>
                <p>Clear local app data after password confirmation.</p>
              </div>
            </div>
            <button type="button" className="settings-danger-action" onClick={() => setFactoryResetModal(true)}>
              Factory Reset
            </button>
          </div>
        </section>
      )}

      {activeSettingsSection === "support" && (
        <section className="settings-panel-stack">
          <div className="settings-panel-card compact">
            <div className="settings-panel-row no-border">
              <span className="settings-panel-icon purple"><CircleHelp className="h-4 w-4" strokeWidth={1.8} /></span>
              <div className="settings-panel-copy">
                <h3>Help & Support</h3>
                <p>Quick troubleshooting and app maintenance tools.</p>
              </div>
            </div>
            <button type="button" className="settings-primary-action" onClick={handleManualAppUpdateCheck}>
              <ArrowClockwise size={16} weight="duotone" /> Check for app updates
            </button>
            <button type="button" className="settings-secondary-action" onClick={() => showToast("Support contact is not configured yet.")}>Contact support</button>
          </div>

          <div className="settings-panel-card compact">
            <h3 className="settings-panel-title">Troubleshooting</h3>
            <p className="settings-panel-note">If a PWA update is stuck, use Check for app updates first. If data looks stale, try Manual Cloud Sync from Privacy.</p>
          </div>
        </section>
      )}

      {activeSettingsSection === "about" && (
        <section className="settings-panel-stack">
          <div className="settings-panel-card compact">
            <div className="settings-about-logo">SFT</div>
            <h3 className="settings-about-title">Simple Fuel Tracker</h3>
            <p className="settings-panel-note">A compact fuel, maintenance, and ownership tracker.</p>
            <div className="settings-info-grid">
              <div>
                <span>Version</span>
                <strong>{APP_VERSION_LABEL}</strong>
              </div>
              <div>
                <span>Build Date</span>
                <strong>{formatAppDate(APP_BUILD_DATE)}</strong>
              </div>
            </div>
            <button type="button" className="settings-primary-action" onClick={handleManualAppUpdateCheck}>
              <ArrowClockwise size={16} weight="duotone" /> Check for app updates
            </button>
          </div>
        </section>
      )}

      {activeSettingsSection === "account" && (
        <section className="settings-panel-stack">
          <div className="settings-panel-card compact">
            <div className="settings-panel-row no-border">
              <span className="settings-panel-icon green"><User size={17} weight="duotone" /></span>
              <div className="settings-panel-copy">
                <h3>Profile</h3>
                <p>Update your username and account basics.</p>
              </div>
            </div>
            <label className="settings-field wide">
              <span>Username</span>
              <Input
                value={accountForm.username}
                onChange={(event) => setAccountForm((prev) => ({ ...prev, username: event.target.value }))}
              />
            </label>
            <button
              type="button"
              className="settings-primary-action"
              onClick={handleSaveUsername}
              disabled={accountSaving || !accountForm.username.trim()}
            >
              Save Username
            </button>
            {usernameError && <p className="settings-panel-warning">{usernameError}</p>}
          </div>

          <div className="settings-panel-card compact">
            <div className="settings-panel-row no-border">
              <span className="settings-panel-icon blue"><Key size={17} weight="duotone" /></span>
              <div className="settings-panel-copy">
                <h3>Password</h3>
                <p>Change your account password.</p>
              </div>
            </div>
            <div className="settings-form-grid">
              <label className="settings-field wide">
                <span>Current Password</span>
                <Input
                  type="password"
                  value={accountForm.oldPassword}
                  readOnly={oldPasswordReadOnly}
                  onFocus={() => setOldPasswordReadOnly(false)}
                  onChange={(event) => setAccountForm((prev) => ({ ...prev, oldPassword: event.target.value }))}
                />
              </label>
              <label className="settings-field">
                <span>New Password</span>
                <Input
                  type="password"
                  value={accountForm.newPassword}
                  onChange={(event) => setAccountForm((prev) => ({ ...prev, newPassword: event.target.value }))}
                />
              </label>
              <label className="settings-field">
                <span>Confirm</span>
                <Input
                  type="password"
                  value={accountForm.confirmPassword}
                  onChange={(event) => setAccountForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                />
              </label>
            </div>
            <button
              type="button"
              className="settings-secondary-action settings-account-password-action"
              onClick={handleChangePassword}
              disabled={accountSaving || !accountForm.oldPassword || !accountForm.newPassword || !accountForm.confirmPassword}
            >
              Update Password
            </button>
            {passwordError && <p className="settings-panel-warning">{passwordError}</p>}
          </div>
        </section>
      )}
              </MotionDiv>
            </MotionDiv>
          </div>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false })}
        onConfirm={() => deleteVehicle(deleteModal.vehicleId)}
        title={t("delete") + " " + t("active_vehicle")}
        message={t("sure_question")}
        confirmText={t("delete")}
        variant="danger"
      />
      <Modal
        isOpen={factoryResetModal}
        onClose={() => {
          if (factoryResetLoading) return;
          setFactoryResetModal(false);
          setFactoryResetPassword("");
          setFactoryResetError("");
        }}
        title={t("reset_app")}
        size="sm"
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
            This will clear all local app data on this device. Enter your password to continue.
          </div>
          {factoryResetError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
              {factoryResetError}
            </div>
          )}
          <Input
            type="password"
            value={factoryResetPassword}
            onChange={(event) => setFactoryResetPassword(event.target.value)}
            placeholder="Current password"
            disabled={factoryResetLoading}
            autoComplete="current-password"
          />
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setFactoryResetModal(false);
                setFactoryResetPassword("");
                setFactoryResetError("");
              }}
              disabled={factoryResetLoading}
              className="rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-700 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={confirmFactoryReset}
              disabled={factoryResetLoading}
              className="rounded-2xl bg-red-500 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {factoryResetLoading ? "Verifying..." : t("delete")}
            </button>
          </div>
        </div>
      </Modal>

      {/* Validation Modal for Active Vehicle Details */}
      <Modal
        isOpen={validationModal.isOpen}
        onClose={() => setValidationModal({ isOpen: false })}
        title={t("active_vehicle_details")}
        size="sm"
      >
        <div className="p-1 space-y-4">
          <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-500/10 rounded-2xl border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400">
            <WarningCircle
              weight="duotone"
              className="w-5 h-5 shrink-0 mt-0.5"
            />
            <div className="space-y-2 text-xs font-bold leading-relaxed">
              {validationModal.isMissingTank && (
                <p>{t("missing_tank_warning")}</p>
              )}
              {validationModal.isMissingTyre && (
                <p>{t("missing_tyre_warning")}</p>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setValidationModal({ isOpen: false })}
              className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-bold text-xs"
            >
              {t("cancel")}
            </button>
            <button
              onClick={confirmSaveActiveVehicleDetails}
              className="flex-1 py-3 bg-emerald-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-emerald-500/20"
            >
              {t("save_anyway")}
            </button>
          </div>
        </div>
      </Modal>

      {/* Backup Format Modal */}
      <Modal
        isOpen={formatModal.isOpen}
        onClose={() => setFormatModal({ isOpen: false })}
        title={
          formatModal.type === "export" ? t("export_data") : t("import_data")
        }
        size="sm"
      >
        <div className="space-y-4 p-2">
          <div className="rounded-2xl bg-slate-50 p-4 text-xs font-semibold leading-relaxed text-slate-500 dark:bg-white/[0.04] dark:text-slate-400">
            Both formats include vehicles, fill-ups, maintenance entries, maintenance systems, subcategories, maintenance settings, app preferences, trips, tire comparisons, stations, and prices.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                setFormatModal({ isOpen: false });
                if (formatModal.type === "export") handleExport("json");
                else handleImportClick("json");
              }}
              className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 flex flex-col items-center gap-2 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
            >
              <Database weight="duotone" className="text-blue-500" />
              <span className="text-xs font-bold">JSON</span>
              <span className="text-[10px] font-semibold text-slate-400">Best for restore</span>
            </button>
            <button
              onClick={() => {
                setFormatModal({ isOpen: false });
                if (formatModal.type === "export") handleExport("excel");
                else handleImportClick("excel");
              }}
              className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 flex flex-col items-center gap-2 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
            >
              <Database weight="duotone" className="text-emerald-500" />
              <span className="text-xs font-bold">{t("excel")}</span>
              <span className="text-[10px] font-semibold text-slate-400">Best for review</span>
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={appUpdateCheckModal.isOpen}
        onClose={() =>
          setAppUpdateCheckModal({
            isOpen: false,
            status: null,
            registration: null,
            checkedAt: null,
          })
        }
        title={
          appUpdateCheckModal.status === "checking"
            ? t("checking_updates")
            : appUpdateCheckModal.status === "available"
            ? t("app_update_available_title")
            : appUpdateCheckModal.status === "applying"
            ? t("reloading")
            : appUpdateCheckModal.status === "error"
            ? t("app_update_check_failed_title")
            : t("app_update_none_title")
        }
        size="sm"
      >
        <div className="space-y-5 p-1">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
            {appUpdateCheckModal.status === "checking" ? (
              <div className="flex items-center gap-3">
                <ArrowClockwise
                  weight="duotone"
                  className="h-5 w-5 animate-spin text-emerald-500"
                />
                <p className="text-sm font-semibold leading-relaxed text-slate-600 dark:text-slate-300">
                  {t("app_update_checking_description")}
                </p>
              </div>
            ) : appUpdateCheckModal.status === "available" ? (
              <div className="space-y-4">
                <p className="text-sm font-semibold leading-relaxed text-slate-700 dark:text-slate-200">
                  {t("app_update_available_description")}
                </p>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                  <p className="text-xs font-bold leading-relaxed text-emerald-800 dark:text-emerald-200">
                    {t("app_update_available_details")}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-white p-3 dark:bg-slate-900">
                    <p className="font-black uppercase tracking-wider text-slate-400">
                      {t("current_app_version")}
                    </p>
                    <p className="mt-1 font-bold text-slate-800 dark:text-slate-100">
                      {APP_VERSION_LABEL}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white p-3 dark:bg-slate-900">
                    <p className="font-black uppercase tracking-wider text-slate-400">
                      {t("app_update_checked_at")}
                    </p>
                    <p className="mt-1 font-bold text-slate-800 dark:text-slate-100">
                      {formatAppDate(appUpdateCheckModal.checkedAt)}
                    </p>
                  </div>
                </div>
              </div>
            ) : appUpdateCheckModal.status === "applying" ? (
              <div className="flex items-center gap-3">
                <ArrowClockwise
                  weight="duotone"
                  className="h-5 w-5 animate-spin text-emerald-500"
                />
                <p className="text-sm font-semibold leading-relaxed text-slate-600 dark:text-slate-300">
                  {t("app_update_applying_description")}
                </p>
              </div>
            ) : (
              <p className="text-sm font-semibold leading-relaxed text-slate-600 dark:text-slate-300">
                {appUpdateCheckModal.status === "error"
                  ? t("app_update_check_failed_description")
                  : t("app_update_none_description")}
              </p>
            )}
          </div>

          {appUpdateCheckModal.status === "available" && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  setAppUpdateCheckModal({
                    isOpen: false,
                    status: null,
                    registration: null,
                    checkedAt: null,
                  })
                }
                className="rounded-xl bg-slate-100 py-3 text-xs font-bold text-slate-600 transition-colors dark:bg-slate-800 dark:text-slate-300"
              >
                {t("update_later")}
              </button>
              <button
                type="button"
                onClick={handleApplyCheckedAppUpdate}
                className="rounded-xl bg-emerald-500 py-3 text-xs font-bold text-white transition-colors"
              >
                {t("update_now")}
              </button>
            </div>
          )}

          {appUpdateCheckModal.status !== "checking" &&
            appUpdateCheckModal.status !== "available" &&
            appUpdateCheckModal.status !== "applying" && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  setAppUpdateCheckModal({
                    isOpen: false,
                    status: null,
                    registration: null,
                    checkedAt: null,
                  })
                }
                className="rounded-xl bg-slate-100 py-3 text-xs font-bold text-slate-600 transition-colors dark:bg-slate-800 dark:text-slate-300"
              >
                {t("close")}
              </button>
              <button
                type="button"
                onClick={handleManualAppUpdateCheck}
                disabled={isCheckingAppUpdate}
                className="rounded-xl bg-emerald-500 py-3 text-xs font-bold text-white transition-colors disabled:opacity-60"
              >
                {isCheckingAppUpdate ? t("checking_updates") : t("try_again")}
              </button>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={cloudRestoreOpen}
        onClose={() => setCloudRestoreOpen(false)}
        title="Cloud Restore"
        size="lg"
      >
        <div className="flex max-h-[75vh] min-h-[65vh] flex-col overflow-hidden">
          <div className="shrink-0 space-y-4 border-b border-slate-200 pb-4 dark:border-slate-800">
            <p className="text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400">
              Choose what to search in cloud, pick a date or interval, then restore selected records to this device.
            </p>

            <div className="space-y-2">
              <Label>Data types</Label>
              <div className="grid grid-cols-2 gap-2">
                {cloudRestoreTypes.map((type) => (
                  <label
                    key={type.id}
                    className={cn(
                      "flex items-center gap-2 rounded-2xl border px-3 py-3 text-xs font-bold transition",
                      cloudRestoreFilters[type.id]
                        ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:text-emerald-300"
                        : "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={cloudRestoreFilters[type.id]}
                      onChange={(event) =>
                        setCloudRestoreFilters((prev) => ({
                          ...prev,
                          [type.id]: event.target.checked,
                        }))
                      }
                      className="h-4 w-4 accent-emerald-500"
                    />
                    {type.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 dark:bg-slate-900">
              {[
                { id: "single", label: "Single day" },
                { id: "range", label: "Date interval" },
              ].map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setCloudRestoreDateMode(mode.id)}
                  className={cn(
                    "rounded-xl px-3 py-2 text-xs font-black transition",
                    cloudRestoreDateMode === mode.id
                      ? "bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-white"
                      : "text-slate-500 dark:text-slate-400",
                  )}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {cloudRestoreDateMode === "single" ? (
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={cloudRestoreDates.single}
                  onChange={(event) =>
                    setCloudRestoreDates((prev) => ({
                      ...prev,
                      single: event.target.value,
                    }))
                  }
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>Start date</Label>
                  <Input
                    type="date"
                    value={cloudRestoreDates.start}
                    onChange={(event) =>
                      setCloudRestoreDates((prev) => ({
                        ...prev,
                        start: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>End date</Label>
                  <Input
                    type="date"
                    value={cloudRestoreDates.end}
                    onChange={(event) =>
                      setCloudRestoreDates((prev) => ({
                        ...prev,
                        end: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={cloudRestoreIncludeDeleted}
                  onChange={(event) =>
                    setCloudRestoreIncludeDeleted(event.target.checked)
                  }
                  className="h-4 w-4 accent-amber-500"
                />
                Include deleted records
              </label>
              <button
                type="button"
                onClick={handleCloudRestoreSearch}
                disabled={cloudRestoreLoading || cloudRestoreRestoring}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-black text-white disabled:opacity-50 dark:bg-white dark:text-slate-950"
              >
                {cloudRestoreLoading ? "Searching..." : "Search"}
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto py-4">
            {cloudRestoreError && (
              <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                {cloudRestoreError}
              </div>
            )}

            {cloudRestoreSummary && (
              <div className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                {cloudRestoreSummary}
              </div>
            )}

            {cloudRestoreLoading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  Searching cloud records...
                </p>
              </div>
            ) : cloudRestoreHasSearched && cloudRestoreResultCount === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
                <p className="text-sm font-black text-slate-900 dark:text-white">
                  No cloud records found
                </p>
                <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Try a different date range, data type, or include deleted records.
                </p>
              </div>
            ) : !cloudRestoreHasSearched ? (
              <div className="rounded-3xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
                <p className="text-sm font-black text-slate-900 dark:text-white">
                  Search cloud data
                </p>
                <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Results will appear here grouped by data type.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-400">
                    {cloudRestoreResultCount} result{cloudRestoreResultCount === 1 ? "" : "s"} / {cloudRestoreSelectedCount} selected
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={selectAllCloudRestoreResults}
                      className="text-xs font-bold text-emerald-600 dark:text-emerald-400"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => setCloudRestoreSelected([])}
                      className="text-xs font-bold text-slate-500"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {cloudRestoreResults.fillups.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Fill-ups
                    </p>
                    {cloudRestoreResults.fillups.map((fillup) => {
                      const itemKey = getCloudRestoreItemKey("fillups", fillup);
                      const selected = cloudRestoreSelected.includes(itemKey);

                      return (
                        <label
                          key={itemKey}
                          className={cn(
                            "block rounded-2xl border p-4 transition",
                            selected
                              ? "border-emerald-400 bg-emerald-50 dark:border-emerald-500/50 dark:bg-emerald-500/10"
                              : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/70",
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() =>
                                toggleCloudRestoreSelection("fillups", fillup)
                              }
                              className="mt-1 h-4 w-4 accent-emerald-500"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <p className="text-sm font-black text-slate-900 dark:text-white">
                                  {getCloudVehicleName(fillup.vehicle_id)}
                                </p>
                                {fillup.deleted_at && (
                                  <span className="rounded-full bg-red-100 px-2 py-1 text-[10px] font-black text-red-600 dark:bg-red-500/10 dark:text-red-300">
                                    Deleted
                                  </span>
                                )}
                              </div>
                              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                {fillup.date} - {Number(fillup.odometer || 0).toLocaleString()} km
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {fillup.liters} L
                                {fillup.total_cost != null
                                  ? ` - ${Number(fillup.total_cost).toFixed(2)} ${t("currency")}`
                                  : ""}
                                {fillup.full_tank ? " - Full tank" : ""}
                              </p>
                              {fillup.station && (
                                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                  {fillup.station}
                                </p>
                              )}
                              {fillup.deleted_at && (
                                <p className="text-[10px] font-semibold text-red-400">
                                  Deleted {new Date(fillup.deleted_at).toLocaleString()}
                                </p>
                              )}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}

                {cloudRestoreResults.maintenance.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Maintenance
                    </p>
                    {cloudRestoreResults.maintenance.map((entry) => {
                      const itemKey = getCloudRestoreItemKey("maintenance", entry);
                      const selected = cloudRestoreSelected.includes(itemKey);
                      const description = parseMaintenanceDescription(entry.description);

                      return (
                        <label
                          key={itemKey}
                          className={cn(
                            "block rounded-2xl border p-4 transition",
                            selected
                              ? "border-emerald-400 bg-emerald-50 dark:border-emerald-500/50 dark:bg-emerald-500/10"
                              : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/70",
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() =>
                                toggleCloudRestoreSelection("maintenance", entry)
                              }
                              className="mt-1 h-4 w-4 accent-emerald-500"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <p className="text-sm font-black text-slate-900 dark:text-white">
                                  {t(entry.type) || entry.type || "Maintenance"}
                                </p>
                                {entry.deleted_at && (
                                  <span className="rounded-full bg-red-100 px-2 py-1 text-[10px] font-black text-red-600 dark:bg-red-500/10 dark:text-red-300">
                                    Deleted
                                  </span>
                                )}
                              </div>
                              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                {entry.date} - {Number(entry.odometer || 0).toLocaleString()} km
                                {entry.cost != null
                                  ? ` - ${Number(entry.cost).toFixed(2)} ${t("currency")}`
                                  : ""}
                              </p>
                              {(description.interval || description.safety) && (
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {description.interval
                                    ? `${Number(description.interval).toLocaleString()} km`
                                    : ""}
                                  {description.interval && description.safety ? " / " : ""}
                                  {description.safety
                                    ? `${Number(description.safety).toLocaleString()} km safety`
                                    : ""}
                                </p>
                              )}
                              {description.notes && (
                                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                  {description.notes}
                                </p>
                              )}
                              {entry.deleted_at && (
                                <p className="text-[10px] font-semibold text-red-400">
                                  Deleted {new Date(entry.deleted_at).toLocaleString()}
                                </p>
                              )}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid shrink-0 grid-cols-3 gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setCloudRestoreOpen(false)}
              className="rounded-xl bg-slate-100 py-3 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleRestoreSelectedCloudRecords}
              disabled={
                cloudRestoreRestoring ||
                cloudRestoreLoading ||
                cloudRestoreSelectedCount === 0
              }
              className="rounded-xl bg-emerald-500 py-3 text-xs font-black text-white disabled:opacity-50"
            >
              {cloudRestoreRestoring ? "Restoring..." : "Restore Selected"}
            </button>
            <button
              type="button"
              onClick={() => handleRestoreCloudRecords(cloudRestoreResultsList)}
              disabled={
                cloudRestoreRestoring ||
                cloudRestoreLoading ||
                cloudRestoreResultCount === 0
              }
              className="rounded-xl bg-amber-500 py-3 text-xs font-black text-white disabled:opacity-50"
            >
              Restore All
            </button>
          </div>
        </div>
      </Modal>

      {/* Import Process Components */}
      {isImporting && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="font-bold text-slate-900 dark:text-white">
              {t("analyzing_file")}
            </p>
          </div>
        </div>
      )}

      {importAnalysis && (
        <ImportResolver
          analysis={importAnalysis}
          onCancel={() => setImportAnalysis(null)}
          onApply={handleApplyImport}
        />
      )}

      {importError && (
        <ConfirmModal
          isOpen={true}
          onClose={() => setImportError(null)}
          onConfirm={() => setImportError(null)}
          title={t("error")}
          message={importError}
          confirmText="OK"
          variant="danger"
        />
      )}


      {/* Manual Sync Modal */}
      <Modal
        isOpen={manualSyncModalOpen}
        onClose={handleCloseManualSync}
        title="Manual Sync"
        size="sm"
      >
        <div className="p-1 space-y-4">
          {/* Sync Summary */}
          {syncSummary && !syncResult && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                    Local Data
                  </p>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                      <span className="text-slate-700 dark:text-slate-300">
                        {syncSummary.localCounts?.vehicles || 0} Vehicles
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                      <span className="text-slate-700 dark:text-slate-300">
                        {syncSummary.localCounts?.fillups || 0} Fill-ups
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                      <span className="text-slate-700 dark:text-slate-300">
                        {syncSummary.localCounts?.maintenance || 0} Maintenance
                      </span>
                    </div>
                  </div>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                    Cloud Data
                  </p>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full" />
                      <span className="text-slate-700 dark:text-slate-300">
                        {syncSummary.cloudCounts?.vehicles || 0} Vehicles
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full" />
                      <span className="text-slate-700 dark:text-slate-300">
                        {syncSummary.cloudCounts?.fillups || 0} Fill-ups
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full" />
                      <span className="text-slate-700 dark:text-slate-300">
                        {syncSummary.cloudCounts?.maintenance || 0} Maintenance
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Sync Actions */}
          {/* Sync Actions */}
          {!syncResult &&
            !isSyncing &&
            (() => {
              const diff = syncSummary?.detailedDiff?.summary;
              const diffsMatch = (diff?.total || 0) === 0;
              const conflictsMatch =
                (syncSummary?.detailedDiff?.conflicts?.length || 0) === 0;

              const localCounts = syncSummary?.localCounts || {};
              const cloudCounts = syncSummary?.cloudCounts || {};

              const vehiclesMatch =
                (localCounts.vehicles || 0) === (cloudCounts.vehicles || 0);
              const fillupsMatch =
                (localCounts.fillups || 0) === (cloudCounts.fillups || 0);
              const maintenanceMatch =
                (localCounts.maintenance || 0) ===
                (cloudCounts.maintenance || 0);
              const tripsMatch =
                (localCounts.tripEstimates || 0) ===
                (cloudCounts.tripEstimates || 0);

              const isInSync =
                diffsMatch &&
                conflictsMatch &&
                vehiclesMatch &&
                fillupsMatch &&
                maintenanceMatch &&
                tripsMatch &&
                !syncSummary?.taxonomyDirty;

              const showActionsAnyway = refreshCount >= 4;
              const pendingChangeLines = [];

              if (syncSummary?.taxonomyDirty) {
                pendingChangeLines.push("Maintenance systems, categories, or rules changed locally.");
              }

              if ((diff?.localOnly || 0) > 0) {
                pendingChangeLines.push(`${diff.localOnly} local record${diff.localOnly !== 1 ? "s" : ""} not in cloud.`);
              }
              if ((diff?.cloudOnly || 0) > 0) {
                pendingChangeLines.push(`${diff.cloudOnly} cloud record${diff.cloudOnly !== 1 ? "s" : ""} not on this device.`);
              }
              if ((diff?.bothChanged || 0) > 0) {
                pendingChangeLines.push(`${diff.bothChanged} record${diff.bothChanged !== 1 ? "s" : ""} changed in both places.`);
              }
              if ((diff?.localDeleted || 0) > 0) {
                pendingChangeLines.push(`${diff.localDeleted} local deletion${diff.localDeleted !== 1 ? "s" : ""} pending upload.`);
              }
              if ((diff?.cloudDeleted || 0) > 0) {
                pendingChangeLines.push(`${diff.cloudDeleted} cloud deletion${diff.cloudDeleted !== 1 ? "s" : ""} pending download.`);
              }

              if (isInSync && !showActionsAnyway) {
                return (
                  <div className="flex flex-col space-y-4">
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/30 p-5 rounded-3xl">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white">
                          <Check weight="bold" />
                        </div>
                        <h4 className="font-bold text-emerald-900 dark:text-emerald-100 italic">
                          Everything in Sync
                        </h4>
                      </div>
                      <p className="text-sm text-emerald-700 dark:text-emerald-300 leading-relaxed">
                        Your data already matches on both local and cloud
                        storage. No synchronization is currently needed. Click
                        Refresh to re-check if you've made changes on another
                        device.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <button
                        onClick={handleOpenManualSync}
                        disabled={isSyncing}
                        className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-2xl transition shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                      >
                        {isSyncing ? (
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : null}
                        Refresh Status
                      </button>
                      <button
                        onClick={handleCloseManualSync}
                        className="w-full py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-2xl transition"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div className="flex flex-col space-y-4">
                  {showActionsAnyway && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30 p-3 rounded-2xl mb-1">
                      <p className="text-xs text-amber-700 dark:text-amber-300 font-medium text-center">
                        Force Sync Mode enabled via repeated refresh.
                      </p>
                    </div>
                  )}

                  {!showActionsAnyway && pendingChangeLines.length > 0 && (
                    <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 p-4 rounded-2xl">
                      <p className="text-xs font-black uppercase tracking-wider text-blue-600 dark:text-blue-300 mb-2">
                        Pending Changes
                      </p>
                      <div className="space-y-1">
                        {pendingChangeLines.map((line) => (
                          <p key={line} className="text-sm text-blue-900 dark:text-blue-100">
                            - {line}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3">
                    <button
                      onClick={() => handleManualSyncAction("merge")}
                      className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition shadow-lg shadow-blue-500/25 flex flex-col items-center justify-center text-center px-4"
                    >
                      <span className="text-base">Merge Data</span>
                      <span className="text-[10px] opacity-80 font-normal mt-0.5">
                        Combine local and cloud records (Recommended)
                      </span>
                    </button>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => handleManualSyncAction("upload")}
                        className="py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-2xl transition shadow-md shadow-emerald-500/20 text-sm"
                      >
                        Upload to Cloud
                      </button>
                      <button
                        onClick={() => handleManualSyncAction("download")}
                        className="py-3.5 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-2xl transition shadow-md shadow-indigo-500/20 text-sm"
                      >
                        Download from Cloud
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-2">
                      <button
                        onClick={handleOpenManualSync}
                        disabled={isSyncing}
                        className="py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-2xl transition text-sm flex items-center justify-center gap-2"
                      >
                        {isSyncing ? (
                          <div className="w-4 h-4 border-2 border-slate-400 border-t-slate-600 rounded-full animate-spin" />
                        ) : null}
                        Refresh
                      </button>
                      <button
                        onClick={handleCloseManualSync}
                        className="py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-2xl transition text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

          {/* Sync Loading */}
          {isSyncing && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="font-bold text-slate-900 dark:text-white">
                Syncing...
              </p>
            </div>
          )}

          {/* Sync Result */}
          {syncResult && (
            <div className="space-y-4">
              <div
                className={`flex items-start gap-3 p-4 rounded-2xl border ${syncResult.success ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20" : "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20"}`}
              >
                {syncResult.success ? (
                  <Check
                    weight="duotone"
                    className="text-emerald-500 w-6 h-6 mt-0.5 flex-shrink-0"
                  />
                ) : (
                  <WarningCircle
                    weight="duotone"
                    className="text-red-500 w-6 h-6 mt-0.5 flex-shrink-0"
                  />
                )}
                <div>
                  <p
                    className={`font-semibold mb-1 ${syncResult.success ? "text-emerald-900 dark:text-emerald-400" : "text-red-900 dark:text-red-400"}`}
                  >
                    {syncResult.message}
                  </p>
                  {syncResult.counts &&
                    (syncResult.counts.vehicles > 0 ||
                      syncResult.counts.fillups > 0 ||
                      syncResult.counts.maintenance > 0 ||
                      syncResult.counts.tripEstimates > 0 ||
                      syncResult.counts.maintenanceTaxonomy > 0) && (
                      <div className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                        <div className="space-y-1">
                          {syncResult.counts.vehicles > 0 && (
                            <div>
                              • {syncResult.counts.vehicles} vehicle
                              {syncResult.counts.vehicles !== 1 ? "s" : ""}
                            </div>
                          )}
                          {syncResult.counts.fillups > 0 && (
                            <div>
                              • {syncResult.counts.fillups} fill-up
                              {syncResult.counts.fillups !== 1 ? "s" : ""}
                            </div>
                          )}
                          {syncResult.counts.maintenance > 0 && (
                            <div>
                              • {syncResult.counts.maintenance} maintenance
                              record
                              {syncResult.counts.maintenance !== 1 ? "s" : ""}
                            </div>
                          )}
                          {syncResult.counts.tripEstimates > 0 && (
                            <div>
                              • {syncResult.counts.tripEstimates} trip estimate
                              {syncResult.counts.tripEstimates !== 1 ? "s" : ""}
                            </div>
                          )}
                          {syncResult.counts.maintenanceTaxonomy > 0 && (
                            <div>
                              - {syncResult.counts.maintenanceTaxonomy} maintenance
                              taxonomy record
                              {syncResult.counts.maintenanceTaxonomy !== 1 ? "s" : ""}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                </div>
              </div>
              <button
                onClick={handleCloseManualSync}
                className="w-full py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-bold text-xs"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </Modal>

      {/* Sync Confirmation Modal */}
      <ConfirmModal
        isOpen={syncConfirmModal.isOpen}
        onClose={() => setSyncConfirmModal({ isOpen: false, action: null })}
        onConfirm={() => {
          setSyncConfirmModal({ isOpen: false, action: null });
          performSyncAction(syncConfirmModal.action);
        }}
        title={syncConfirmModal.title}
        message={syncConfirmModal.message}
        confirmText={syncConfirmModal.confirmText}
        variant="danger"
      />

      {/* Global Setting Toast */}
      <AnimatePresence>
        {toastMessage && (
          <MotionDiv
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="settings-floating-toast"
          >
            {toastMessage}
          </MotionDiv>
        )}
      </AnimatePresence>
    </div>
  );
}
