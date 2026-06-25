import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useFuel } from "../hooks/useFuelContext";
import { useTheme } from "../hooks/useTheme";
import { Card, Input, Label, cn, Modal, ConfirmModal, PageWrapper } from "./ui";
import {
  Bell as LucideBell,
  Camera,
  CarFront,
  CircleHelp,
  Fuel as LucideFuel,
  Heart,
  Info,
  Lock,
  Ruler,
  UserRound,
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
  const { theme, setTheme } = useTheme();
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language.startsWith("ar");

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
  const [accountError, setAccountError] = useState("");
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
        tyreSize: editingTyreSize,
        tankCapacity: editingTankCapacity ? Number(editingTankCapacity) : null,
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
    setAccountError("");
    setAccountSaving(true);

    try {
      const profile = await authService.updateUsername(accountForm.username);
      setAccountForm((prev) => ({ ...prev, username: profile.username }));
      showToast("Username updated");
    } catch (error) {
      setAccountError(error.message || "Failed to update username.");
    } finally {
      setAccountSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setAccountError("");

    if (!accountForm.oldPassword) {
      setAccountError("Please enter your current password.");
      return;
    }

    if (accountForm.newPassword.length < 6) {
      setAccountError("Password must be at least 6 characters.");
      return;
    }

    if (accountForm.newPassword !== accountForm.confirmPassword) {
      setAccountError("Passwords do not match.");
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
      setAccountError(error.message || "Failed to update password.");
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
      const hasTyreChanged =
        tyreSize.width !== currentTyre.width ||
        tyreSize.aspectRatio !== currentTyre.aspectRatio ||
        tyreSize.rimSize !== currentTyre.rimSize;

      const hasTankChanged =
        parseFloat(tankCapacity) !== activeVehicle.tankCapacity;

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
      tyreSize: activeVehicleForm.tyreSize,
      tankCapacity: activeVehicleForm.tankCapacity
        ? parseFloat(activeVehicleForm.tankCapacity)
        : null,
    });
    setValidationModal({ isOpen: false });
    showToast(t("details_saved"));
  };

  const currentLanguage = i18n.language.startsWith("ar") ? "ar" : "en";
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
  const settingsRows = [
    {
      title: "My Profile",
      subtitle: "Personal information and account",
      section: "account",
      icon: UserRound,
      tone: "teal",
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
      subtitle: "Fuel types, prices and efficiency",
      section: "fuel",
      icon: LucideFuel,
      tone: "amber",
    },
    {
      title: "Reminders",
      subtitle: "Set alerts and notifications",
      section: "app",
      icon: LucideBell,
      tone: "purple",
    },
    {
      title: "Units & Display",
      subtitle: "Customize units and appearance",
      section: "app",
      icon: Ruler,
      tone: "teal",
    },
    {
      title: "Privacy",
      subtitle: "Manage your data and privacy",
      section: "cloud",
      icon: Lock,
      tone: "blue",
    },
    {
      title: "Help & Support",
      subtitle: "FAQs, contact us and troubleshooting",
      section: "app",
      icon: CircleHelp,
      tone: "purple",
    },
    {
      title: "About Simple Fuel Tracker",
      subtitle: "App info, terms and policies",
      section: "app",
      icon: Info,
      tone: "teal",
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
    <PageWrapper className="space-y-6 pb-8">
      <ScreenHeader
        title={t("settings")}
        action={
          <button type="button" className="icon-button" aria-label={t("notifications")}>
            <LucideBell className="h-5 w-5" strokeWidth={1.9} />
          </button>
        }
      />

      <GlassCard className="grid min-h-[150px] overflow-hidden p-0 min-[430px]:grid-cols-[0.58fr_0.42fr]">
        <div className="z-10 flex items-center gap-4 p-4">
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[rgba(32,230,183,0.13)] text-[var(--accent-primary)] shadow-[var(--shadow-glow)]">
              <UserRound className="h-10 w-10" strokeWidth={1.8} />
            </div>
            <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-medium)] bg-[var(--bg-glass-strong)] text-[var(--text-primary)]">
              <Camera className="h-4 w-4" strokeWidth={1.9} />
            </span>
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-black text-[var(--text-primary)]">
              {profileName}
            </h2>
            <p className="mt-1 truncate text-sm font-semibold text-[var(--text-secondary)]">
              {profileHandle}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <span className="inline-flex items-center gap-2">
                <CarFront className="h-4 w-4" strokeWidth={1.9} />
                {activeVehicle?.name || t("select_vehicle")}
              </span>
              <span className="rounded-full border border-[var(--border-strong)] bg-[rgba(32,230,183,0.12)] px-3 py-1 text-xs text-[var(--accent-primary)]">
                Active
              </span>
            </div>
          </div>
        </div>
        <VehicleArt className="hidden min-[430px]:block" />
      </GlassCard>

      <GlassCard className="overflow-hidden p-4">
        {settingsRows.map((row) => (
          <SettingsRow
            key={row.title}
            icon={row.icon}
            title={row.title}
            subtitle={row.subtitle}
            tone={row.tone}
            active={
              activeSettingsSection === row.section &&
              activeSettingsTitle === row.title
            }
            onClick={() => openSettingsPanel(row)}
          />
        ))}
      </GlassCard>

      <GlassCard className="flex items-center justify-between gap-4 p-5">
        <div className="min-w-0">
          <h3 className="text-xl font-black text-[var(--text-primary)]">
            You're all set!
          </h3>
          <p className="mt-1 text-base font-semibold text-[var(--text-secondary)]">
            We'll help you save more every day.
          </p>
        </div>
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[rgba(32,230,183,0.13)] text-[var(--accent-primary)]">
          <Heart className="h-8 w-8" strokeWidth={1.9} />
        </div>
      </GlassCard>

      <button
        type="button"
        onClick={handleLogout}
        className="flex w-full items-center gap-4 rounded-[var(--radius-xl)] border border-red-500/20 bg-red-500/10 p-5 text-start text-red-300 shadow-[var(--shadow-card)]"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10">
          <SignOut weight="duotone" className="h-5 w-5" />
        </span>
        <span>
          <span className="block text-lg font-black">{t("logout")}</span>
          <span className="mt-1 block text-sm font-semibold text-red-300/75">
            Sign out from your account
          </span>
        </span>
      </button>

      <Modal
        isOpen={Boolean(activeSettingsSection)}
        onClose={closeSettingsPanel}
        title={activeSettingsTitle || t("settings")}
        size="lg"
      >
      <MotionDiv
        key={`${activeSettingsSection}-${activeSettingsTitle}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="max-h-[70vh] space-y-4 overflow-y-auto pr-1"
      >
      {activeSettingsSection === "vehicles" && (
        <>
      <section>
        <h3 className="text-xs font-bold text-blue-500 dark:text-blue-400 uppercase tracking-wider mb-3 flex items-center gap-2 ms-1">
          <Car weight="duotone" className="w-4 h-4" /> {t("your_garage")}
        </h3>

        <div className="space-y-3 mb-4">
          {vehicles.map((v) => (
            <div
              key={v.id}
              className={cn(
                "glass-card group p-4 rounded-xl flex items-center justify-between shadow-sm dark:shadow-none border-slate-200 dark:border-slate-800",
                v.id === selectedVehicleId &&
                  "border-blue-500/50 bg-blue-50 dark:bg-blue-500/5",
              )}
            >
              {editingVehicleId === v.id ? (
                <div className="flex-1 me-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      autoFocus
                      className="py-1.5 px-3 text-sm h-auto bg-slate-100 dark:bg-slate-900 focus:ring-blue-500/50 focus:border-blue-500/50"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveEdit(v.id);
                        if (e.key === "Escape") setEditingVehicleId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      onClick={() => handleSaveEdit(v.id)}
                      className="text-emerald-500 hover:text-emerald-400 p-1.5 bg-emerald-500/10 rounded-lg"
                    >
                      <Check weight="duotone" className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex-1">
                    <Label className="text-[10px]">
                      {t("tank_capacity")} ({t("liters")})
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editingTankCapacity}
                      onChange={(e) => setEditingTankCapacity(e.target.value)}
                      className="py-1 px-2 text-xs h-auto bg-slate-100 dark:bg-slate-900"
                      placeholder="e.g. 40"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Tire weight="duotone" className="w-3 h-3" />{" "}
                      {t("tyre_size")}
                    </p>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={editingTyreSize.width || ""}
                        onChange={(e) =>
                          setEditingTyreSize((prev) => ({
                            ...prev,
                            width: parseInt(e.target.value) || 0,
                          }))
                        }
                        className={cn(
                          "py-1 px-2 text-xs h-auto",
                          editingTyreSize.width === 0 && "border-red-500",
                        )}
                      />
                      <Input
                        type="number"
                        value={editingTyreSize.aspectRatio || ""}
                        onChange={(e) =>
                          setEditingTyreSize((prev) => ({
                            ...prev,
                            aspectRatio: parseInt(e.target.value) || 0,
                          }))
                        }
                        className={cn(
                          "py-1 px-2 text-xs h-auto",
                          editingTyreSize.aspectRatio === 0 && "border-red-500",
                        )}
                      />
                      <Input
                        type="number"
                        value={editingTyreSize.rimSize || ""}
                        onChange={(e) =>
                          setEditingTyreSize((prev) => ({
                            ...prev,
                            rimSize: parseInt(e.target.value) || 0,
                          }))
                        }
                        className={cn(
                          "py-1 px-2 text-xs h-auto",
                          editingTyreSize.rimSize === 0 && "border-red-500",
                        )}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className="flex-1 me-3 flex items-center gap-2 cursor-pointer"
                  onClick={() => setSelectedVehicleId(v.id)}
                >
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${v.id === selectedVehicleId ? "border-blue-500 bg-blue-500 text-white" : "border-slate-300 dark:border-slate-700"}`}
                  >
                    {v.id === selectedVehicleId && (
                      <Check weight="duotone" className="w-3 h-3" />
                    )}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-slate-200 block">
                      {v.name}
                    </span>
                    {v.tyreSize && (
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Tire weight="duotone" className="w-3 h-3" />{" "}
                        {v.tyreSize.width}/{v.tyreSize.aspectRatio} R
                        {v.tyreSize.rimSize}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startEditing(v);
                    }}
                    className="text-slate-400 hover:text-blue-400 p-1 opacity-40 group-hover:opacity-100 transition-opacity md:opacity-40 ms-auto"
                  >
                    <Pencil weight="duotone" className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="shrink-0 flex items-center border-s border-slate-200 dark:border-slate-800 ps-2 ms-1">
                <button
                  onClick={() =>
                    setDeleteModal({
                      isOpen: true,
                      vehicleId: v.id,
                      vehicleName: v.name,
                    })
                  }
                  disabled={vehicles.length === 1 || editingVehicleId === v.id}
                  className="text-slate-400 hover:text-red-500 dark:hover:text-red-400 p-2 disabled:opacity-20 disabled:hover:text-slate-400 transition-colors"
                >
                  <Trash weight="duotone" className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleCreateVehicle} className="flex gap-2">
          <Input
            type="text"
            placeholder={t("new_vehicle_placeholder")}
            value={newVehicleName}
            onChange={(e) => setNewVehicleName(e.target.value)}
            className="py-3"
          />
          <button
            type="submit"
            disabled={!newVehicleName}
            className="bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-slate-950 px-5 rounded-2xl font-bold transition flex items-center justify-center"
          >
            <Plus weight="duotone" className="w-5 h-5" />
          </button>
        </form>
      </section>

      <section className="pt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-2 ms-1">
            <Tire weight="duotone" className="w-4 h-4" />{" "}
            {t("active_vehicle_details")}
          </h3>
          {activeVehicleForm && (
            <button
              onClick={handleSaveActiveVehicleDetails}
              className="bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shadow-sm"
            >
              {t("save_details")}
            </button>
          )}
        </div>
        <Card className="px-5 py-5 space-y-3">
          {!activeVehicle || !activeVehicleForm ? (
            <p className="text-sm text-slate-500">{t("no_vehicle_selected")}</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                  {activeVehicle.name}
                </span>
                {activeVehicleForm.tankCapacity && (
                  <span className="text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded-lg">
                    {activeVehicleForm.tankCapacity}
                    {t("liters_abbr")} {t("tank_capacity")}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2 items-start mt-4 border-t border-slate-100 dark:border-slate-800 pt-4">
                {["width", "aspectRatio", "rimSize"].map((field) => (
                  <div key={field} className="flex flex-col">
                    <Label className="text-[10px] mb-1.5 h-4">
                      {t(
                        field === "rimSize"
                          ? "rim"
                          : field === "aspectRatio"
                            ? "ratio"
                            : "width",
                      )}
                    </Label>
                    <Input
                      type="number"
                      value={activeVehicleForm.tyreSize?.[field] || ""}
                      onChange={(e) =>
                        setActiveVehicleForm((prev) => ({
                          ...prev,
                          tyreSize: {
                            ...prev.tyreSize,
                            [field]: parseInt(e.target.value) || "",
                          },
                        }))
                      }
                      className="py-2 px-2 text-xs h-10"
                    />
                  </div>
                ))}
                <div className="flex flex-col">
                  <Label className="text-[10px] mb-1.5 h-4 text-blue-600 dark:text-blue-400 font-bold">
                    {t("liters")}
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={activeVehicleForm.tankCapacity || ""}
                    onChange={(e) =>
                      setActiveVehicleForm((prev) => ({
                        ...prev,
                        tankCapacity: parseFloat(e.target.value) || "",
                      }))
                    }
                    className="py-2 px-2 text-xs h-10 bg-blue-50/50 dark:bg-blue-900/10"
                  />
                </div>
              </div>
            </div>
          )}
        </Card>
      </section>
        </>
      )}

      {activeSettingsSection === "app" && (
        <>
      {/* Language Section */}
      <section className="pt-4">
        <h3 className="text-xs font-bold text-orange-500 dark:text-orange-400 uppercase tracking-wider mb-3 flex items-center gap-2 ms-1">
          <Globe weight="duotone" className="w-4 h-4" /> {t("language")}
        </h3>
        <Card className="px-5 py-6">
          <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-900/50 rounded-2xl relative z-20">
            {[
              { id: "en", label: t("english") },
              { id: "ar", label: t("arabic") },
            ].map((lang) => (
              <button
                key={lang.id}
                onClick={() => {
                  i18n.changeLanguage(lang.id);
                  showToast(t("updated"));
                }}
                className={`relative flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                  currentLanguage === lang.id
                    ? "text-slate-900 dark:text-white"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                {currentLanguage === lang.id && (
                  <MotionDiv
                    layoutId="settingsLangTab"
                    className="absolute inset-0 bg-white dark:bg-orange-500 rounded-xl shadow-sm"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{lang.label}</span>
              </button>
            ))}
          </div>
        </Card>
      </section>

      <section className="pt-4">
        <h3 className="text-xs font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider mb-3 flex items-center gap-2 ms-1">
          <Palette weight="duotone" className="w-4 h-4" /> {t("theme_prefs")}
        </h3>
        <Card className="px-5 py-6">
          <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-900/50 rounded-2xl relative z-20">
            {["light", "dark", "system"].map((t_id) => (
              <button
                key={t_id}
                onClick={() => setTheme(t_id)}
                className={`relative flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold capitalize transition-all ${
                  theme === t_id
                    ? "text-slate-900 dark:text-white"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                {theme === t_id && (
                  <MotionDiv
                    layoutId="settingsThemeTab"
                    className="absolute inset-0 bg-white dark:bg-indigo-500 rounded-xl shadow-sm"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">
                  {t_id === "system"
                    ? t("system_mode")
                    : t_id === "dark"
                      ? t("dark_mode")
                      : t("light_mode")}
                </span>
              </button>
            ))}
          </div>
        </Card>
      </section>

      <section className="pt-4">
        <h3 className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-2 ms-1">
          <Bell weight="duotone" className="w-4 h-4" /> {t("notifications")}
        </h3>
        <Card className="px-5 py-6 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                {t("app_notifications")}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {notificationsEnabled
                  ? t("app_notifications_enabled")
                  : t("app_notifications_disabled")}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notificationsEnabled}
              onClick={handleToggleNotifications}
              className={`relative ms-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${notificationsEnabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${notificationsEnabled ? (isRtl ? "-translate-x-6" : "translate-x-6") : isRtl ? "-translate-x-1" : "translate-x-1"}`}
              />
            </button>
          </div>
          {notificationError && (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
              {notificationError}
            </p>
          )}
        </Card>
      </section>

      <section className="pt-4">
        <h3 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-3 flex items-center gap-2 ms-1">
          <ArrowClockwise weight="duotone" className="w-4 h-4" />{" "}
          {t("app_updates")}
        </h3>
        <Card className="px-5 py-6 space-y-4">
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-white">
              {t("check_for_app_updates")}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t("check_for_app_updates_description")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-white/[0.04]">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                {t("current_app_version")}
              </p>
              <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">
                {APP_VERSION_LABEL}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-white/[0.04]">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                {t("current_app_update_date")}
              </p>
              <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">
                {formatAppDate(APP_BUILD_DATE)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleManualAppUpdateCheck}
            disabled={isCheckingAppUpdate}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950"
          >
            <ArrowClockwise
              weight="duotone"
              className={cn("h-4 w-4", isCheckingAppUpdate && "animate-spin")}
            />
            {isCheckingAppUpdate
              ? t("checking_updates")
              : t("check_for_app_updates")}
          </button>
        </Card>
      </section>
        </>
      )}

      {activeSettingsSection === "fuel" && (
        <>
      <section className="pt-4">
        <h3 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-3 flex items-center gap-2 ms-1">
          <NavigationArrow weight="duotone" className="w-4 h-4" />{" "}
          {t("location_services")}
        </h3>
        <Card className="px-5 py-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                {t("detection")}
              </p>
              <button
                onClick={() => setLocationEnabled(!locationEnabled)}
                className={`relative ms-1 inline-flex h-6 w-11 items-center rounded-full transition-colors ${locationEnabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${locationEnabled ? (isRtl ? "-translate-x-6" : "translate-x-6") : isRtl ? "-translate-x-1" : "translate-x-1"}`}
                />
              </button>
            </div>
            <button
              onClick={handleClearLocationCache}
              className="text-xs text-slate-500 dark:text-slate-400"
            >
              {t("clear_cache")}
            </button>
          </div>
        </Card>
      </section>

      <section className="pt-4">
        <h3 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-3 flex items-center gap-2 ms-1">
          <CurrencyDollar weight="duotone" className="w-4 h-4" />{" "}
          {t("fuel_prices")}
        </h3>
        <Card className="px-5 py-6">
          <div className="space-y-4">
            {["92", "95", "diesel"].map((key) => (
              <div key={key}>
                <Label>
                  {key === "diesel" ? t("petrol_diesel") : t("petrol_" + key)}
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={priceForm[key]}
                  onChange={(e) =>
                    setPriceForm({ ...priceForm, [key]: e.target.value })
                  }
                />
              </div>
            ))}
            <button
              onClick={handleSavePrices}
              className="w-full py-3.5 bg-emerald-500 text-white font-bold rounded-2xl shadow-lg shadow-emerald-500/20"
            >
              {t("save_prices")}
            </button>
          </div>
        </Card>
      </section>
        </>
      )}

      {activeSettingsSection === "cloud" && (
        <>
          <section className="pt-4">
            <h3 className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-3 flex items-center gap-2 ms-1">
              <Database weight="duotone" className="w-4 h-4" />{" "}
              {t("backup_restore")}
            </h3>
            <Card className="px-5 py-6">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <button
                  onClick={() =>
                    setFormatModal({ isOpen: true, type: "export" })
                  }
                  className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-bold text-sm"
                >
                  <DownloadSimple weight="duotone" size={18} />{" "}
                  {t("export_data")}
                </button>
                <button
                  onClick={() =>
                    setFormatModal({ isOpen: true, type: "import" })
                  }
                  className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-bold text-sm"
                >
                  <UploadSimple weight="duotone" size={18} />{" "}
                  {t("import_data")}
                </button>
              </div>
              <button
                onClick={handleOpenManualSync}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 transition"
              >
                <CloudArrowUp weight="duotone" size={18} /> Manual Sync
              </button>
            </Card>
          </section>

          <section className="pt-4">
            <h3 className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-2 ms-1">
              <Database weight="duotone" className="w-4 h-4" /> Cloud Restore
            </h3>
            <Card className="px-5 py-6 space-y-4">
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  Restore records from cloud
                </p>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400">
                  Search cloud fill-ups and maintenance entries by date, then restore only the records you choose.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCloudRestoreOpen(true)}
                className="w-full rounded-2xl bg-amber-500 px-4 py-4 text-sm font-black text-white shadow-lg shadow-amber-500/20 transition hover:bg-amber-400"
              >
                Cloud Restore
              </button>
            </Card>
          </section>

          <section className="pt-4">
            <h3 className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider mb-3 flex items-center gap-2 ms-1">
              <WarningCircle weight="duotone" className="w-4 h-4" /> Danger Zone
            </h3>
            <Card className="px-5 py-6">
              <button
                onClick={() => setFactoryResetModal(true)}
                className="w-full py-4 rounded-[1.5rem] border border-red-500/20 text-red-500 font-bold hover:bg-red-500/10 transition flex justify-center gap-2 items-center"
              >
                {t("reset_app")}
              </button>
            </Card>
          </section>
        </>
      )}

      {activeSettingsSection === "account" && (
        <>
      <section className="pt-4">
        <h3 className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2 ms-1">
          <User weight="duotone" className="w-4 h-4" /> Account
        </h3>
        <Card className="px-5 py-6 space-y-5">
          {accountError && (
            <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-300 text-xs font-bold">
              {accountError}
            </div>
          )}

          <div>
            <Label className="flex items-center gap-2">
              <User weight="duotone" className="w-4 h-4" /> Username
            </Label>
            <div className="flex gap-2">
              <Input
                type="text"
                value={accountForm.username}
                onChange={(e) =>
                  setAccountForm((prev) => ({
                    ...prev,
                    username: e.target.value,
                  }))
                }
                placeholder="username"
                disabled={accountSaving}
              />
              <button
                type="button"
                onClick={handleSaveUsername}
                disabled={accountSaving || !accountForm.username.trim()}
                className="px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 font-bold text-xs disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Key weight="duotone" className="w-4 h-4" /> Change Password
            </Label>
            <Input
              type="password"
              value={accountForm.oldPassword}
              onChange={(e) =>
                setAccountForm((prev) => ({
                  ...prev,
                  oldPassword: e.target.value,
                }))
              }
              placeholder="Current password"
              disabled={accountSaving}
              readOnly={oldPasswordReadOnly}
              onFocus={() => setOldPasswordReadOnly(false)}
              autoComplete="off"
            />
            <Input
              type="password"
              value={accountForm.newPassword}
              onChange={(e) =>
                setAccountForm((prev) => ({
                  ...prev,
                  newPassword: e.target.value,
                }))
              }
              placeholder="New password"
              disabled={accountSaving}
            />
            <Input
              type="password"
              value={accountForm.confirmPassword}
              onChange={(e) =>
                setAccountForm((prev) => ({
                  ...prev,
                  confirmPassword: e.target.value,
                }))
              }
              placeholder="Confirm password"
              disabled={accountSaving}
            />
            <button
              type="button"
              onClick={handleChangePassword}
              disabled={
                accountSaving ||
                !accountForm.oldPassword ||
                !accountForm.newPassword ||
                !accountForm.confirmPassword
              }
              className="w-full py-3 rounded-xl bg-emerald-500 text-white font-bold text-xs disabled:opacity-50"
            >
              Update Password
            </button>
          </div>
        </Card>
      </section>

        </>
      )}
      </MotionDiv>
      </Modal>

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
            className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-6 py-3 rounded-full shadow-lg z-50 text-sm font-bold"
          >
            {toastMessage}
          </MotionDiv>
        )}
      </AnimatePresence>
    </PageWrapper>
  );
}
