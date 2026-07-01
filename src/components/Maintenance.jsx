import { useState, useMemo, useRef, useEffect } from "react";
import { motion as Motion, AnimatePresence } from "framer-motion";
import {
  Wrench,
  Plus,
  Bell,
  CurrencyDollar,
  MagnifyingGlass,
  Pencil,
  Trash,
  CalendarBlank,
  GearSix,
  ShieldWarning,
  CaretDown,
  Check,
  X,
  Pulse,
  Shield,
  Clock,
  DotsThreeVertical,
  CaretLeft,
  CaretRight,
  FloppyDisk,
  Warning,
  FilePdf,
  ListChecks,
} from "@phosphor-icons/react";
import { useFuel } from "../hooks/useFuelContext";
import { serviceHistoryPdf } from "../services/serviceHistoryPdf";
import {
  Card,
  ConfirmModal,
  Modal,
  Input,
  Label,
  cn,
  IconPicker,
  ICON_MAP_DATA,
} from "./ui";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { makeMaintenanceTypeKey } from "../utils/maintenanceTypeKey";
import { calculateAverageDailyDistance } from "../utils/calculations";
import { buildMaintenanceForecast, getReminderState } from "../utils/maintenanceForecast";
import { useNotifications } from "../hooks/useNotifications";
import { VehicleArt } from "./PremiumUI";
import {
  DEFAULT_VEHICLE_IMAGE_SETTINGS,
  resolveVehicleImage,
  scaleVehicleHeroImageSettings,
} from "../utils/vehicleImageResolver";
import "./Maintenance.css";

const MAINTENANCE_TAXONOMY_DIRTY_KEY = "fueltracker-maintenance-taxonomy-dirty";

const markMaintenanceTaxonomyDirty = () => {
  try {
    localStorage.setItem(MAINTENANCE_TAXONOMY_DIRTY_KEY, new Date().toISOString());
  } catch {
    // Ignore storage failures; the taxonomy data itself still updates locally.
  }
};

const ICON_MAP = {
  ...ICON_MAP_DATA,
  Zap: ICON_MAP_DATA.Lightning,
  Droplet: ICON_MAP_DATA.Drop,
  Battery: ICON_MAP_DATA.BatteryCharging,
  Disc: ICON_MAP_DATA.Tire,
};

function MaintenanceUndoToast({ title, label, t, onUndo, onClose }) {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const startedAt = Date.now();
    const interval = setInterval(() => {
      const remaining = Math.max(0, 5 - Math.floor((Date.now() - startedAt) / 1000));
      setCountdown(remaining);
    }, 250);

    return () => clearInterval(interval);
  }, []);

  return (
    <Motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      className="fixed bottom-24 left-1/2 z-[80] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-950"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-900 dark:text-white">
            {title || t("maintenance_deleted_pending")}
          </p>
          <p className="truncate text-xs font-semibold text-slate-500">
            {label} - {countdown}s
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onUndo}
            className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-white"
          >
            {t("undo")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          >
            {t("close")}
          </button>
        </div>
      </div>
    </Motion.div>
  );
}

export default function Maintenance() {
  const {
    maintenanceEntries,
    activeVehicle,
    activeVehicleFillUps,
    maintenanceSettings,
    categories,
    getCategoryById,
    maintenanceSystems,
    setMaintenanceSystems,
    updateMaintenanceCategory,
    addMaintenanceCategory,
    updateCategorySettings,
    requestMaintenanceEntryDelete,
    undoMaintenanceEntryDelete,
    deleteMaintenanceEntry,
  } = useFuel();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const {
    notificationsEnabled,
    permissionState,
    isNotificationSupported,
    toggleNotifications,
  } = useNotifications();

  const [activeTab, setActiveTab] = useState("overview"); // overview, history, settings
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [vehicleImage, setVehicleImage] = useState({
    src: null,
    settings: DEFAULT_VEHICLE_IMAGE_SETTINGS,
  });
  const [selectedSystemId, setSelectedSystemId] = useState(null);
  const [selectedMaintenanceItemId, setSelectedMaintenanceItemId] = useState(null);
  const [deleteToast, setDeleteToast] = useState(null);
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState(null);
  const [pdfOptionsOpen, setPdfOptionsOpen] = useState(false);
  const [pdfSortBy, setPdfSortBy] = useState("odometer");
  const [pdfSystemIds, setPdfSystemIds] = useState([]);
  const [pdfColumns, setPdfColumns] = useState(["date", "odometer", "type", "interval", "nextDue", "cost", "notes"]);
  const [pdfExpandedSections, setPdfExpandedSections] = useState({
    summary: true,
    sort: false,
    systems: false,
    columns: false,
  });

  // Modals & Editing State
  const [editingSystemId, setEditingSystemId] = useState(null);
  const [editSystemName, setEditSystemName] = useState("");
  const [editSystemIcon, setEditSystemIcon] = useState("Wrench");
  const [isPickingIcon, setIsPickingIcon] = useState(false);
  const [renamingCatId, setRenamingCatId] = useState(null);
  const [renamingCatName, setRenamingCatName] = useState("");
  const [justSavedCatId, setJustSavedCatId] = useState(null);
  const [systemSaveFeedback, setSystemSaveFeedback] = useState(false);
  const [systemModalHasTaxonomyChanges, setSystemModalHasTaxonomyChanges] = useState(false);
  const [draftSystem, setDraftSystem] = useState(null);

  // Confirm Modals
  const [confirmDeleteSystem, setConfirmDeleteSystem] = useState(null); // stores id
  const [confirmDeleteCat, setConfirmDeleteCat] = useState(null); // stores id
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryInterval, setNewCategoryInterval] = useState("10000");
  const [newCategorySafety, setNewCategorySafety] = useState("2000");
  const [taxonomyUndoToast, setTaxonomyUndoToast] = useState(null);

  const categoryDropdownRef = useRef(null);
  const toolsDropdownRef = useRef(null);
  const deleteMaintenanceEntryRef = useRef(deleteMaintenanceEntry);
  const isRtl = i18n.language.startsWith("ar");

  useEffect(() => {
    deleteMaintenanceEntryRef.current = deleteMaintenanceEntry;
  }, [deleteMaintenanceEntry]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        categoryDropdownRef.current &&
        !categoryDropdownRef.current.contains(event.target)
      ) {
        setDropdownOpen(false);
      }
      if (
        toolsDropdownRef.current &&
        !toolsDropdownRef.current.contains(event.target)
      ) {
        setToolsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    let cancelled = false;

    resolveVehicleImage(activeVehicle)
      .then((image) => {
        if (cancelled) return;
        setVehicleImage({
          src: image?.src || null,
          settings: scaleVehicleHeroImageSettings(
            image?.settings || DEFAULT_VEHICLE_IMAGE_SETTINGS,
          ),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setVehicleImage({
            src: null,
            settings: DEFAULT_VEHICLE_IMAGE_SETTINGS,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeVehicle]);

  useEffect(() => {
    if (!deleteToast) return undefined;
    const timeout = setTimeout(() => {
      deleteMaintenanceEntryRef.current(deleteToast.entryId);
      setDeleteToast(null);
    }, 5000);

    return () => clearTimeout(timeout);
  }, [deleteToast]);

  const currentOdometer =
    activeVehicleFillUps.length > 0
      ? activeVehicleFillUps[activeVehicleFillUps.length - 1].odometer
      : 0;
  const avgDailyDistance = useMemo(
    () => calculateAverageDailyDistance(activeVehicleFillUps),
    [activeVehicleFillUps],
  );

  const filteredEntries = useMemo(() => {
    return maintenanceEntries
      .filter((log) => {
        const category = getCategoryById(log.type);

        // Guard defensively against null notes/descriptions
        const logNotes = log.notes || log.description || "";

        const matchesSearch =
          !searchTerm ||
          (logNotes &&
            logNotes.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (category &&
            category.name.toLowerCase().includes(searchTerm.toLowerCase()));

        const matchesCategory =
          selectedCategory === "all" || log.type === selectedCategory;
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => {
        // 🟢 FALLBACK TIMESTAMPS IF LOCAL STORAGE HAS DIRTY ENTRIES
        const dateA = new Date(
          a.timestamp || a.createdAt || a.date || 0,
        ).getTime();
        const dateB = new Date(
          b.timestamp || b.createdAt || b.date || 0,
        ).getTime();
        return dateB - dateA;
      });
  }, [maintenanceEntries, searchTerm, selectedCategory, getCategoryById]);

  const activeCategories = useMemo(
    () => categories.filter((category) => !category.deletedAt && !category.deleted_at),
    [categories],
  );

  const activeMaintenanceSystems = useMemo(
    () => maintenanceSystems.filter((system) => !system.deletedAt && !system.deleted_at),
    [maintenanceSystems],
  );

  const categoryProgress = useMemo(
    () =>
      buildMaintenanceForecast({
        categories: activeCategories,
        entries: maintenanceEntries,
        maintenanceSettings,
        currentOdometer,
        avgDailyDistance,
      }).map((item) => ({
        ...item,
        reminderState: getReminderState({ item, notificationsEnabled }),
      })),
    [
      avgDailyDistance,
      activeCategories,
      currentOdometer,
      maintenanceEntries,
      maintenanceSettings,
      notificationsEnabled,
    ],
  );

  const systemStatus = useMemo(() => {
    return activeMaintenanceSystems.map((system) => {
      const systemCategories = categoryProgress.filter((cp) =>
        system.categories.includes(cp.id),
      );
      const trackedCategories = systemCategories.filter((cp) => cp.isTracked);
      const overdueCount = systemCategories.filter(
        (cp) => cp.status === "overdue",
      ).length;
      const dueSoonCount = systemCategories.filter(
        (cp) => cp.status === "due-soon",
      ).length;
      let healthScore = 100;
      if (trackedCategories.length > 0)
        healthScore =
          100 -
          trackedCategories.reduce(
            (sum, cp) => sum + Math.max(0, Math.min(100, cp.progressPercent)),
            0,
          ) /
            trackedCategories.length;
      let status =
        overdueCount > 0
          ? "overdue"
          : dueSoonCount > 0
            ? "due-soon"
            : trackedCategories.length === 0
              ? "untracked"
              : "healthy";

      let desc = t(status);
      let subDesc =
        status === "due-soon"
          ? `${Math.min(...systemCategories.filter((c) => c.isTracked).map((c) => c.remainingKm)).toLocaleString()} ${t("km_left")}`
          : "";
      let color =
        status === "overdue"
          ? "#ef4444"
          : status === "due-soon"
            ? "#f59e0b"
            : status === "untracked"
              ? "#94a3b8"
              : "#10b981";

      return {
        ...system,
        categories: systemCategories,
        healthScore,
        status,
        desc,
        subDesc,
        displayColor: color,
      };
    });
  }, [activeMaintenanceSystems, categoryProgress, t]);

  const activeSystem = selectedSystemId
    ? systemStatus.find((s) => s.id === selectedSystemId)
    : null;
  const selectedMaintenanceItem = selectedMaintenanceItemId && activeSystem
    ? activeSystem.categories.find((item) => item.id === selectedMaintenanceItemId)
    : null;
  const editingSystem = editingSystemId
    ? draftSystem || maintenanceSystems.find((s) => s.id === editingSystemId)
    : null;

  const closeEditSystemModal = () => {
    setEditingSystemId(null);
    setDraftSystem(null);
    setNewCategoryName("");
    setNewCategoryInterval("10000");
    setNewCategorySafety("2000");
    setSystemSaveFeedback(false);
    setSystemModalHasTaxonomyChanges(false);
  };

  const handleSaveSystemName = () => {
    if (!editingSystemId || !editSystemName.trim()) return;

    const currentSystem = maintenanceSystems.find(
      (s) => s.id === editingSystemId,
    );
    const normalizedName = editSystemName.trim().toLowerCase();
    const duplicateSystem = maintenanceSystems.some((system) =>
      system.id !== editingSystemId &&
      !system.deletedAt &&
      !system.deleted_at &&
      system.name?.trim().toLowerCase() === normalizedName
    );

    if (duplicateSystem) {
      setSystemSaveFeedback("duplicate");
      return;
    }

    if (draftSystem) {
      const now = new Date().toISOString();
      markMaintenanceTaxonomyDirty();
      setMaintenanceSystems((prev) => [
        ...prev,
        {
          ...draftSystem,
          name: editSystemName.trim(),
          icon: editSystemIcon,
          updatedAt: now,
          updated_at: now,
        },
      ]);
      setSystemSaveFeedback("saved");
      setTimeout(closeEditSystemModal, 1000);
      return;
    }

    if (
      currentSystem?.name === editSystemName.trim() &&
      currentSystem?.icon === editSystemIcon &&
      !systemModalHasTaxonomyChanges
    ) {
      setSystemSaveFeedback("no-change");
      setTimeout(() => {
        setSystemSaveFeedback(false);
        closeEditSystemModal();
      }, 1000);
      return;
    }

    markMaintenanceTaxonomyDirty();
    setMaintenanceSystems((prev) =>
      prev.map((s) =>
        s.id === editingSystemId
          ? {
              ...s,
              name: editSystemName.trim(),
              icon: editSystemIcon,
              updatedAt: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              version: Number(s.version || 1) + 1,
            }
          : s,
      ),
    );
    setSystemSaveFeedback("saved");
    setTimeout(() => {
      closeEditSystemModal();
    }, 1000);
  };

  const handleRenameCategory = (catId, newName) => {
    if (!newName.trim()) {
      setRenamingCatId(null);
      return;
    }

    const cat = getCategoryById(catId);
    if (cat.name === newName.trim()) {
      setRenamingCatId(null);
      return;
    }

    updateMaintenanceCategory(catId, { name: newName });
    setSystemModalHasTaxonomyChanges(true);
    setJustSavedCatId(catId);
    setTimeout(() => setJustSavedCatId(null), 2000);
    setRenamingCatId(null);
  };

  const handleDeleteSystem = () => {
    const deletedAt = new Date().toISOString();
    const deletedSystem = maintenanceSystems.find((s) => s.id === confirmDeleteSystem);
    markMaintenanceTaxonomyDirty();
    setMaintenanceSystems((prev) =>
      prev.map((s) =>
        s.id === confirmDeleteSystem
          ? {
              ...s,
              deletedAt,
              deleted_at: deletedAt,
              updatedAt: deletedAt,
              updated_at: deletedAt,
              version: Number(s.version || 1) + 1,
            }
          : s,
      ),
    );
    if (deletedSystem) {
      setTaxonomyUndoToast({
        id: `system-${deletedSystem.id}`,
        title: t("maintenance_system_removed"),
        label: deletedSystem.name,
        onUndo: () => {
          markMaintenanceTaxonomyDirty();
          setMaintenanceSystems((prev) => prev.map((system) =>
            system.id === deletedSystem.id
              ? {
                  ...system,
                  deletedAt: null,
                  deleted_at: null,
                  updatedAt: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  version: Number(system.version || 1) + 1,
                }
              : system
          ));
        },
      });
    }
    setConfirmDeleteSystem(null);
    closeEditSystemModal();
  };

  const handleAddSystem = () => {
    const newId = `system_${Date.now()}`;
    const typeKey = makeMaintenanceTypeKey(t("new_system")) || "new_system";
    const stableKey = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : newId;
    const now = new Date().toISOString();
    const newSystem = {
      id: newId,
      stableKey,
      stable_key: stableKey,
      typeKey,
      type_key: typeKey,
      name: t("new_system"),
      icon: "Wrench",
      categories: [],
      color: "#3b82f6",
      isDefault: false,
      is_default: false,
      createdAt: now,
      created_at: now,
      updatedAt: now,
      updated_at: now,
      deletedAt: null,
      deleted_at: null,
      version: 1,
    };
    setDraftSystem(newSystem);
    setEditingSystemId(newId);
    setEditSystemName(newSystem.name);
    setEditSystemIcon(newSystem.icon);
  };

  const handleAddCustomCategory = async () => {
    if (!newCategoryName.trim() || !editingSystemId) return;
    const interval = Number(newCategoryInterval) || 0;
    const safety = Number(newCategorySafety) || 0;
    const category = await addMaintenanceCategory({
      name: newCategoryName.trim(),
      color: "#64748b",
      defaultInterval: { value: interval, unit: "km" },
      defaultSafetyMarginKm: safety,
    });
    setSystemModalHasTaxonomyChanges(true);
    markMaintenanceTaxonomyDirty();
    updateCategorySettings(category.id, {
      intervalKm: interval,
      safetyMarginKm: safety,
    });
    if (draftSystem) {
      setDraftSystem((prev) => ({
        ...prev,
        categories: Array.from(new Set([...(prev.categories || []), category.id])),
        updatedAt: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: Number(prev.version || 1) + 1,
      }));
      setNewCategoryName("");
      setNewCategoryInterval("10000");
      setNewCategorySafety("2000");
      return;
    }
    setMaintenanceSystems((prev) => prev.map((system) =>
      system.id === editingSystemId
        ? {
            ...system,
            categories: Array.from(new Set([...(system.categories || []), category.id])),
            updatedAt: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            version: Number(system.version || 1) + 1,
          }
        : system
    ));
    setNewCategoryName("");
    setNewCategoryInterval("10000");
    setNewCategorySafety("2000");
  };

  const handleDeleteSubCategory = () => {
    const removedCatId = confirmDeleteCat;
    const systemBefore = maintenanceSystems.find((s) => s.id === editingSystemId);
    const deletedAt = new Date().toISOString();
    setSystemModalHasTaxonomyChanges(true);
    markMaintenanceTaxonomyDirty();
    setMaintenanceSystems((prev) =>
      prev.map((s) =>
        s.id === editingSystemId
          ? {
              ...s,
              categories: s.categories.filter((id) => id !== confirmDeleteCat),
              updatedAt: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              version: Number(s.version || 1) + 1,
            }
          : s,
      ),
    );
    if (draftSystem) {
      setDraftSystem((prev) => prev
        ? { ...prev, categories: prev.categories.filter((id) => id !== removedCatId) }
        : prev
      );
    }
    if (systemBefore && removedCatId) {
      const cat = getCategoryById(removedCatId);
      updateMaintenanceCategory(removedCatId, {
        deletedAt,
        deleted_at: deletedAt,
        updatedAt: deletedAt,
        updated_at: deletedAt,
        lastAction: "DELETE",
      });
      setTaxonomyUndoToast({
        id: `subcategory-${editingSystemId}-${removedCatId}`,
        title: t("maintenance_subcategory_removed"),
        label: cat?.name || removedCatId,
        onUndo: () => {
          markMaintenanceTaxonomyDirty();
          updateMaintenanceCategory(removedCatId, {
            deletedAt: null,
            deleted_at: null,
            updatedAt: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            lastAction: null,
          });
          setMaintenanceSystems((prev) => prev.map((system) =>
            system.id === systemBefore.id
              ? {
                  ...system,
                  categories: Array.from(new Set([...(system.categories || []), removedCatId])),
                  updatedAt: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  version: Number(system.version || 1) + 1,
                }
              : system
          ));
        },
      });
    }
    setConfirmDeleteCat(null);
  };

  const translateSystemName = (name) => {
    const key = name.toLowerCase();
    const translation = t(key);
    return translation === key ? name : translation;
  };

  const translateCategoryName = (category) => {
    if (!category) return t("unknown");
    const translation = t(category.id);
    return translation === category.id ? category.name : translation;
  };

  const getMaintenanceDetailRows = (item) => {
    if (!item) return [];
    const log = item.latestLog || {};
    const displayDate = log.date || log.timestamp
      ? format(new Date(log.date || log.timestamp), "MMM d, yyyy")
      : "-";
    const performedOdo = Number(log.performedAtODO ?? log.odometer ?? 0);
    const nextDue = Number(item.nextDueODO ?? log.nextDueODO ?? log.next_due_odometer ?? 0);
    const safetyMargin = Number(item.safetyMarginKm ?? log.safetyMarginKm ?? log.safety ?? 0);
    const remainingText = item.status === "overdue"
      ? `${Math.abs(item.remainingKm).toLocaleString()} ${t("overdue")}`
      : `${item.remainingKm.toLocaleString()} ${t("km_left")}`;
    const reminderStateKey = (item.reminderState || "watching").replace("-", "_");

    return [
      [t("reminder_state"), t(reminderStateKey)],
      [t("date"), displayDate],
      [t("odometer"), performedOdo ? `${performedOdo.toLocaleString()} km` : "-"],
      [t("current_mileage"), `${currentOdometer.toLocaleString()} km`],
      [t("distance"), item.intervalKm ? `${Number(item.intervalKm).toLocaleString()} km` : "-"],
      [t("safety_margin"), safetyMargin ? `${safetyMargin.toLocaleString()} km` : "-"],
      [t("next_due"), nextDue ? `${nextDue.toLocaleString()} km` : "-"],
      [t("remaining"), remainingText],
      [t("price"), log.cost != null ? `${Number(log.cost).toFixed(2)} ${t("currency")}` : "-"],
      [t("notes"), log.notes || "-"]
    ];
  };

  const startMaintenanceDelete = async (entryId, label) => {
    if (!entryId) return;
    await requestMaintenanceEntryDelete(entryId);
    setSelectedMaintenanceItemId(null);
    setSelectedSystemId(null);
    setDeleteToast({ entryId, label });
  };

  const requestMaintenanceDeleteConfirmation = (entryId, label) => {
    if (!entryId) return;
    setConfirmDeleteEntry({ entryId, label });
  };

  const confirmMaintenanceDelete = async () => {
    if (!confirmDeleteEntry) return;
    await startMaintenanceDelete(confirmDeleteEntry.entryId, confirmDeleteEntry.label);
    setConfirmDeleteEntry(null);
  };

  const undoMaintenanceDelete = async () => {
    if (!deleteToast) return;
    await undoMaintenanceEntryDelete(deleteToast.entryId);
    setDeleteToast(null);
  };

  const finalizeMaintenanceDelete = async () => {
    if (!deleteToast) return;
    await deleteMaintenanceEntry(deleteToast.entryId);
    setDeleteToast(null);
  };

  const undoTaxonomyChange = () => {
    if (!taxonomyUndoToast) return;
    taxonomyUndoToast.onUndo();
    setTaxonomyUndoToast(null);
  };

  const handleExportPDF = async () => {
    await serviceHistoryPdf.generatePdf(activeVehicle, filteredEntries, t, {
      categories,
      systems: maintenanceSystems,
      sortBy: pdfSortBy,
      systemIds: pdfSystemIds,
      columns: pdfColumns,
    });
    setPdfOptionsOpen(false);
  };

  const togglePdfSection = (sectionId) => {
    setPdfExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const pdfColumnOptions = [
    ["date", t("date") || "Date"],
    ["odometer", t("odometer") || "Odometer"],
    ["type", t("service_type") || "Service Type"],
    ["interval", t("distance") || "Interval"],
    ["nextDue", t("next_due") || "Next Due"],
    ["cost", t("price") || "Cost"],
    ["notes", t("notes") || "Notes"],
  ];

  const pdfColumnLabelById = Object.fromEntries(pdfColumnOptions);
  const pdfSelectedSystemsLabel = pdfSystemIds.length === 0
    ? `${t("all") || "All"} systems`
    : pdfSystemIds.map((id) => translateSystemName(activeMaintenanceSystems.find((system) => system.id === id)?.name || id)).join(", ");

  const activeEntries = maintenanceEntries.filter(
    (entry) => !entry.deletedAt && !entry.deleted_at && !entry.deleted,
  );
  const currentYear = new Date().getFullYear();
  const completedThisYear = activeEntries.filter((entry) => {
    const rawDate = entry.date || entry.timestamp || entry.createdAt;
    if (!rawDate) return false;
    const parsed = new Date(rawDate);
    return !Number.isNaN(parsed.getTime()) && parsed.getFullYear() === currentYear;
  });
  const totalSpentThisYear = completedThisYear.reduce(
    (sum, entry) => sum + (Number(entry.cost) || 0),
    0,
  );
  const overdueItems = categoryProgress.filter((item) => item.status === "overdue");
  const dueSoonItems = categoryProgress.filter((item) => item.status === "due-soon");
  const trackedItems = categoryProgress.filter((item) => item.isTracked);
  const nextDueItem = [...dueSoonItems, ...trackedItems]
    .filter((item) => Number.isFinite(Number(item.remainingKm)))
    .sort((a, b) => Number(a.remainingKm) - Number(b.remainingKm))[0];
  const healthStatus =
    overdueItems.length > 0
      ? "attention"
      : dueSoonItems.length > 0
        ? "watch"
        : trackedItems.length > 0
          ? "good"
          : "untracked";
  const vehicleName = activeVehicle?.name || t("select_vehicle") || "Vehicle";
  const vehicleModel =
    activeVehicle?.model ||
    activeVehicle?.variant ||
    activeVehicle?.make ||
    activeVehicle?.brand ||
    "";
  const vehicleFuel =
    activeVehicle?.fuelType ||
    activeVehicle?.fuel_type ||
    activeVehicle?.fuel ||
    "";
  const vehiclePlate =
    activeVehicle?.plate ||
    activeVehicle?.plateNumber ||
    activeVehicle?.licensePlate ||
    activeVehicle?.registration ||
    "";
  const vehicleImageSettings = vehicleImage.settings || DEFAULT_VEHICLE_IMAGE_SETTINGS;

  const formatDueText = (item) => {
    if (!item?.isTracked) return t("untracked");
    if (item.status === "overdue") {
      return `${t("overdue")} ${t("by") || "by"} ${Math.abs(Number(item.remainingKm) || 0).toLocaleString()} km`;
    }
    if (Number.isFinite(Number(item.daysRemaining)) && Number(item.daysRemaining) <= 30) {
      return `${t("due_in") || "Due in"} ${Math.max(0, Math.round(Number(item.daysRemaining)))} ${t("days") || "days"}`;
    }
    return `${t("due_in") || "Due in"} ${Math.max(0, Number(item.remainingKm) || 0).toLocaleString()} km`;
  };

  const getSystemForItem = (itemId) =>
    activeMaintenanceSystems.find((system) => system.categories?.includes(itemId));

  const renderServiceIcon = (item, className = "w-6 h-6") => {
    const system = getSystemForItem(item?.id);
    const Icon = ICON_MAP[system?.icon] || Wrench;
    return <Icon weight="duotone" className={className} />;
  };

  return (
    <div className="maintenance-premium-screen">
      <div className="maintenance-scroll">
        {activeTab !== "settings" && (
          <div className={cn("maintenance-fixed-zone", activeTab === "overview" && "with-context-actions")}>
            <header className="maintenance-topbar">
              <div>
                <h1>{activeTab === "history" ? "Maintenance History" : "Maintenance"}</h1>
                <p>Simple Fuel Tracker</p>
              </div>
              <div className="maintenance-tools" ref={toolsDropdownRef}>
                <button
                  type="button"
                  className="maintenance-tool-button"
                  onClick={() => setToolsOpen((open) => !open)}
                >
                  <Wrench weight="duotone" />
                  <span>{t("tools")}</span>
                  <CaretDown weight="bold" className={cn(toolsOpen && "rotate-180")} />
                </button>
                <AnimatePresence>
                  {toolsOpen && (
                    <Motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.96 }}
                      className="maintenance-tools-menu"
                    >
                      <button type="button" onClick={() => { setActiveTab("history"); setToolsOpen(false); }}>
                        <ListChecks weight="duotone" /> {t("history")}
                      </button>
                      <button type="button" onClick={() => { setActiveTab("settings"); setToolsOpen(false); }}>
                        <GearSix weight="duotone" /> {t("systems")}
                      </button>
                      <button type="button" onClick={() => { setRemindersOpen(true); setToolsOpen(false); }}>
                        <Bell weight="duotone" /> {t("reminders")}
                      </button>
                      <button type="button" onClick={() => { setPdfOptionsOpen(true); setToolsOpen(false); }} disabled={filteredEntries.length === 0}>
                        <FilePdf weight="duotone" /> {t("export") || "Export PDF"}
                      </button>
                    </Motion.div>
                  )}
                </AnimatePresence>
              </div>
            </header>

            {activeTab === "overview" && (
              <>
                <section className="maintenance-vehicle-card maintenance-context-card">
                  <div className="maintenance-vehicle-copy">
                    <span>My Car <i /> Active</span>
                    <h2>{vehicleName}</h2>
                    <p>{[vehicleModel, vehicleFuel].filter(Boolean).join(" - ") || vehicleFuel || "Vehicle"}</p>
                    <p>{[vehiclePlate, currentOdometer ? `${Number(currentOdometer).toLocaleString()} km` : null].filter(Boolean).join(" - ")}</p>
                  </div>
                  <VehicleArt
                    className="maintenance-vehicle-art"
                    src={vehicleImage.src}
                    imageOffsetX={vehicleImageSettings.offsetX}
                    imageOffsetY={vehicleImageSettings.offsetY}
                    imageZoom={vehicleImageSettings.zoom}
                    imageRotate={vehicleImageSettings.rotate}
                    imageFlipX={vehicleImageSettings.flipX}
                    imageFlipY={vehicleImageSettings.flipY}
                    alt={vehicleName}
                  />
                </section>

                <div className="maintenance-quick-actions maintenance-context-actions">
                  <button type="button" onClick={() => setActiveTab("history")}><ListChecks weight="duotone" /> View All</button>
                  <button type="button" onClick={() => navigate("/maintenance/add")}><Plus weight="bold" /> Add Service</button>
                  <button type="button" onClick={() => setRemindersOpen(true)}><Bell weight="duotone" /> Reminders</button>
                </div>
              </>
            )}
          </div>
        )}

        <nav className="maintenance-tabs" aria-label="Maintenance sections">
          {[
            ["overview", t("dashboard") || "Dashboard"],
            ["history", t("history") || "History"],
            ["settings", t("settings") || "Settings"],
          ].map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              className={cn(activeTab === tab && "active")}
              onClick={() => setActiveTab(tab)}
            >
              {label}
            </button>
          ))}
        </nav>

        <AnimatePresence mode="wait">
          {activeTab === "overview" && (
            <Motion.section
              key="overview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="maintenance-stack maintenance-content-under-fixed"
            >
              {overdueItems.length > 0 && (
                <button
                  type="button"
                  className="maintenance-alert-card"
                  onClick={() => setSelectedSystemId(getSystemForItem(overdueItems[0].id)?.id)}
                >
                  <ShieldWarning weight="duotone" />
                  <span>
                    <strong>Maintenance attention required</strong>
                    <small>{overdueItems.length} items overdue. Your car needs immediate attention.</small>
                  </span>
                  <CaretRight weight="bold" className={cn(isRtl && "rotate-180")} />
                </button>
              )}

              <section className="maintenance-health-card" data-status={healthStatus}>
                <div className="maintenance-section-head">
                  <div>
                    <h2>Maintenance Health</h2>
                    <p>Overall status of your vehicle</p>
                  </div>
                  <div className="maintenance-health-badge">
                    {healthStatus === "attention" ? <Warning weight="duotone" /> : <Check weight="bold" />}
                    <span>{healthStatus === "attention" ? "Attention Needed" : healthStatus === "watch" ? "Due Soon" : "Good"}</span>
                  </div>
                </div>
                <div className="maintenance-health-grid">
                  <div className="danger">
                    <ShieldWarning weight="duotone" />
                    <strong>{overdueItems.length}</strong>
                    <span>Overdue</span>
                    <small>{overdueItems.length ? "Needs action" : "All clear"}</small>
                  </div>
                  <div className="warning">
                    <Clock weight="duotone" />
                    <strong>{dueSoonItems.length}</strong>
                    <span>Due Soon</span>
                    <small>Upcoming items</small>
                  </div>
                  <div className="success">
                    <Check weight="bold" />
                    <strong>{completedThisYear.length}</strong>
                    <span>Completed</span>
                    <small>This Year</small>
                  </div>
                </div>
              </section>

              <section className="maintenance-due-panel">
                {overdueItems.length > 0 && (
                  <>
                    <div className="maintenance-section-head compact">
                      <h2>Overdue</h2>
                      <button type="button" onClick={() => setActiveTab("history")}>View All <CaretRight weight="bold" /></button>
                    </div>
                    <div className="maintenance-card-row">
                      {overdueItems.slice(0, 4).map((item) => (
                        <button key={item.id} type="button" className="maintenance-due-card overdue" onClick={() => {
                          setSelectedSystemId(getSystemForItem(item.id)?.id);
                          setSelectedMaintenanceItemId(item.id);
                        }}>
                          <span>{renderServiceIcon(item)}</span>
                          <strong>{translateCategoryName(item)}</strong>
                          <em>{formatDueText(item)}</em>
                          <small>{item.nextDueODO ? `Recommended at ${Number(item.nextDueODO).toLocaleString()} km` : "Review service schedule"}</small>
                          <CaretRight weight="bold" />
                        </button>
                      ))}
                    </div>
                  </>
                )}

                <div className="maintenance-section-head compact">
                  <h2>Due Soon</h2>
                  <button type="button" onClick={() => setActiveTab("history")}>View All <CaretRight weight="bold" /></button>
                </div>
                <div className="maintenance-card-row">
                  {(dueSoonItems.length ? dueSoonItems : categoryProgress.filter((item) => !item.isTracked).slice(0, 2)).slice(0, 4).map((item) => (
                    <button key={item.id} type="button" className="maintenance-due-card due" onClick={() => {
                      setSelectedSystemId(getSystemForItem(item.id)?.id);
                      setSelectedMaintenanceItemId(item.id);
                    }}>
                      <span>{renderServiceIcon(item)}</span>
                      <strong>{translateCategoryName(item)}</strong>
                      <em>{formatDueText(item)}</em>
                      <div className="maintenance-progress"><i style={{ width: `${Math.min(100, Math.max(8, Number(item.progressPercent) || 12))}%` }} /></div>
                      <small>{item.nextDueODO ? `Due at ${Number(item.nextDueODO).toLocaleString()} km` : "Tap to add first service"}</small>
                      <CaretRight weight="bold" />
                    </button>
                  ))}
                </div>
              </section>

              <section className="maintenance-panel">
                <div className="maintenance-section-head compact">
                  <h2>Maintenance Systems</h2>
                  <button type="button" onClick={() => setActiveTab("settings")}>View All <CaretRight weight="bold" /></button>
                </div>
                <div className="maintenance-system-strip">
                  {systemStatus.map((system) => {
                    const Icon = ICON_MAP[system.icon] || Wrench;
                    return (
                      <button key={system.id} type="button" onClick={() => setSelectedSystemId(system.id)} data-status={system.status}>
                        <Icon weight="duotone" />
                        <span>{translateSystemName(system.name)}</span>
                        <Check weight="bold" />
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="maintenance-panel">
                <div className="maintenance-section-head compact">
                  <h2>Recent Service Logs</h2>
                  <button type="button" onClick={() => setActiveTab("history")}>View All <CaretRight weight="bold" /></button>
                </div>
                <div className="maintenance-log-list compact">
                  {filteredEntries.slice(0, 3).map((log) => {
                    const category = getCategoryById(log.type);
                    const rawDate = log.timestamp || log.createdAt || log.date;
                    const parsedDate = rawDate ? new Date(rawDate) : null;
                    const displayDate = parsedDate && !Number.isNaN(parsedDate.getTime()) ? format(parsedDate, "MMM d, yyyy") : "Unknown Date";
                    const displayOdometer = Number(log.performedAtODO ?? log.odometer ?? 0).toLocaleString();
                    return (
                      <button key={log.id} type="button" onClick={() => navigate(`/maintenance/edit/${log.id}`)}>
                        <span className="maintenance-log-icon" style={{ "--log-color": category?.color || "#14b8a6" }}>
                          {renderServiceIcon(category)}
                        </span>
                        <span>
                          <strong>{translateCategoryName(category)}</strong>
                          <small>{displayDate} - {displayOdometer} km</small>
                        </span>
                        <em>Completed</em>
                        <CaretRight weight="bold" className={cn(isRtl && "rotate-180")} />
                      </button>
                    );
                  })}
                  {filteredEntries.length === 0 && (
                    <div className="maintenance-empty-card">
                      <Wrench weight="duotone" />
                      <strong>Untracked</strong>
                      <p>No service records yet. Add your first maintenance record to start forecasting.</p>
                    </div>
                  )}
                </div>
              </section>
            </Motion.section>
          )}

        {activeTab === "history" && (
          <Motion.section
            key="history-premium"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="maintenance-stack"
          >
            <section className="maintenance-vehicle-card history">
              <div className="maintenance-vehicle-copy">
                <h2>{vehicleName}</h2>
                <p>{[vehicleModel, vehicleFuel].filter(Boolean).join(" - ")}</p>
                <p>{vehiclePlate || `${Number(currentOdometer || 0).toLocaleString()} km`}</p>
              </div>
              <VehicleArt
                className="maintenance-vehicle-art"
                src={vehicleImage.src}
                imageOffsetX={vehicleImageSettings.offsetX}
                imageOffsetY={vehicleImageSettings.offsetY}
                imageZoom={vehicleImageSettings.zoom}
                imageRotate={vehicleImageSettings.rotate}
                imageFlipX={vehicleImageSettings.flipX}
                imageFlipY={vehicleImageSettings.flipY}
                alt={vehicleName}
              />
            </section>

            <section className="maintenance-stats-card">
              <div><CalendarBlank weight="duotone" /><span>Total Services</span><strong>{completedThisYear.length}</strong></div>
              <div><CurrencyDollar weight="duotone" /><span>Total Spent</span><strong>{totalSpentThisYear.toLocaleString()} {t("currency")}</strong></div>
              <div><Wrench weight="duotone" /><span>Next Due</span><strong>{nextDueItem ? `${Math.max(0, Number(nextDueItem.remainingKm) || 0).toLocaleString()} km` : "-"}</strong></div>
            </section>

            <section className="maintenance-history-panel">
              <div className="maintenance-history-filters">
                <div className="maintenance-search">
                  <MagnifyingGlass weight="duotone" />
                  <input
                    type="search"
                    placeholder="Search by service, notes or cost..."
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                  />
                </div>
                <button type="button" className="maintenance-sort-button" onClick={() => setPdfOptionsOpen(true)}>
                  <FilePdf weight="duotone" />
                  <span>{t("export") || "Export"}</span>
                </button>
              </div>

              <div className="maintenance-chip-row">
                <button type="button" className={cn(selectedCategory === "all" && "active")} onClick={() => setSelectedCategory("all")}>All</button>
                {activeCategories.slice(0, 5).map((cat) => (
                  <button key={cat.id} type="button" className={cn(selectedCategory === cat.id && "active")} onClick={() => setSelectedCategory(cat.id)}>
                    {translateCategoryName(cat)}
                  </button>
                ))}
              </div>

              <div className="maintenance-timeline">
                {filteredEntries.map((log) => {
                  const category = getCategoryById(log.type);
                  const rawDate = log.timestamp || log.createdAt || log.date;
                  const parsedDate = rawDate ? new Date(rawDate) : null;
                  const displayDate = parsedDate && !Number.isNaN(parsedDate.getTime()) ? format(parsedDate, "MMM d, yyyy") : "Unknown Date";
                  const displayOdometer = Number(log.performedAtODO ?? log.odometer ?? 0).toLocaleString();
                  return (
                    <button key={log.id} type="button" onClick={() => navigate(`/maintenance/edit/${log.id}`)}>
                      <span className="maintenance-timeline-dot" />
                      <span className="maintenance-log-icon" style={{ "--log-color": category?.color || "#14b8a6" }}>
                        {renderServiceIcon(category)}
                      </span>
                      <span className="maintenance-log-copy">
                        <strong>{translateCategoryName(category)}</strong>
                        <small>{displayDate} - {displayOdometer} km</small>
                        {log.notes && <small>{log.notes}</small>}
                      </span>
                      <span className="maintenance-log-meta">
                        <strong>{log.cost != null ? `${Number(log.cost).toLocaleString()} ${t("currency")}` : ""}</strong>
                        <em>Completed</em>
                      </span>
                      <CaretRight weight="bold" className={cn(isRtl && "rotate-180")} />
                    </button>
                  );
                })}
                {filteredEntries.length === 0 && (
                  <div className="maintenance-empty-card">
                    <ListChecks weight="duotone" />
                    <strong>Untracked</strong>
                    <p>Your service history will appear here after you add maintenance records.</p>
                  </div>
                )}
                <button type="button" className="maintenance-add-row" onClick={() => navigate("/maintenance/add")}>
                  <Plus weight="bold" />
                  <span><strong>Add New Service Record</strong><small>Log a new maintenance or repair</small></span>
                  <CaretRight weight="bold" className={cn(isRtl && "rotate-180")} />
                </button>
              </div>
            </section>
          </Motion.section>
        )}

        {activeTab === "__legacy_history" && (
          <Motion.div
            key="history"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="space-y-6"
          >
            <div className="p-3 bg-white dark:bg-white/[0.03] rounded-3xl border border-slate-200 dark:border-slate-700/50">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <MagnifyingGlass
                    weight="duotone"
                    className={`absolute ${isRtl ? "right-3" : "left-3"} top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400`}
                  />
                  <input
                    type="text"
                    placeholder={t("search")}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={cn(
                      "w-full py-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/50 rounded-xl text-sm outline-none",
                      isRtl ? "pr-9 pl-4" : "pl-9 pr-4",
                    )}
                  />
                </div>
                <div className="relative" ref={categoryDropdownRef}>
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="w-full flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    <span>
                      {selectedCategory === "all"
                        ? t("all_categories")
                        : translateCategoryName(getCategoryById(selectedCategory))}
                    </span>
                    <Motion.div animate={{ rotate: dropdownOpen ? 180 : 0 }}>
                      <CaretDown
                        weight="duotone"
                        className="w-4 h-4 text-slate-400"
                      />
                    </Motion.div>
                  </button>
                  <AnimatePresence>
                    {dropdownOpen && (
                      <Motion.div className="absolute right-0 top-full mt-1 w-full bg-white dark:bg-slate-800 border rounded-xl shadow-xl z-50 overflow-hidden">
                        <div className="max-h-60 overflow-y-auto p-1">
                          <button
                            onClick={() => {
                              setSelectedCategory("all");
                              setDropdownOpen(false);
                            }}
                            className="w-full text-start px-3 py-2 text-sm rounded-lg hover:bg-slate-50"
                          >
                            {t("all_categories")}
                          </button>
                          {activeCategories.map((cat) => (
                            <button
                              key={cat.id}
                              onClick={() => {
                                setSelectedCategory(cat.id);
                                setDropdownOpen(false);
                              }}
                              className="w-full text-start px-3 py-2 text-sm rounded-lg hover:bg-slate-50"
                            >
                              {translateCategoryName(cat)}
                            </button>
                          ))}
                        </div>
                      </Motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {filteredEntries.length > 0 && (
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => setPdfOptionsOpen(true)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-bold transition-colors hover:bg-emerald-200 dark:hover:bg-emerald-500/30"
                  >
                    <FilePdf weight="duotone" className="w-4 h-4" />
                    {t("export") || "Export PDF"}
                  </button>
                </div>
              )}
            </div>

            <div className="relative">
              <div
                className={`absolute ${isRtl ? "right-4" : "left-4"} top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700`}
              />
              <div className={cn("space-y-4", isRtl ? "pr-10" : "pl-10")}>
                {filteredEntries.map((log) => {
                  const category = getCategoryById(log.type);

                  // 🟢 SAFELY PARSE TIMESTAMPS FROM ALL SOURCE VARIATIONS
                  const rawDate = log.timestamp || log.createdAt || log.date;
                  let displayDate = "Unknown Date";
                  if (rawDate) {
                    const parsedDate = new Date(rawDate);
                    if (!isNaN(parsedDate.getTime())) {
                      displayDate = format(parsedDate, "MMM d, yyyy");
                    }
                  }

                  // 🟢 SAFELY PARSE ODOMETER METRICS WITH FALLBACK VALUES
                  const displayOdometer =
                    log.performedAtODO !== undefined &&
                    log.performedAtODO !== null
                      ? Number(log.performedAtODO).toLocaleString()
                      : log.odometer !== undefined && log.odometer !== null
                        ? Number(log.odometer).toLocaleString()
                        : "0";

                  return (
                    <div key={log.id} className="relative">
                      <div
                        className={`absolute ${isRtl ? "-right-10" : "-left-10"} top-4 w-4 h-4 rounded-full border-2 border-white dark:border-slate-800`}
                        style={{
                          backgroundColor: category?.color || "#64748b",
                        }}
                      />
                      <Card
                        className="p-4 cursor-pointer"
                        onClick={() => navigate(`/maintenance/edit/${log.id}`)}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-bold text-slate-900 dark:text-white">
                              {translateCategoryName(category)}
                            </h3>
                            <p className="text-xs text-slate-500">
                              {displayDate} • {displayOdometer} km
                            </p>
                          </div>
                          <Pencil
                            weight="duotone"
                            className="w-4 h-4 text-slate-400"
                          />
                        </div>
                      </Card>
                    </div>
                  );
                })}
              </div>
            </div>
          </Motion.div>
        )}

        {activeTab === "settings" && (
          <Motion.section
            key="settings-premium"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="maintenance-stack"
          >
            <div className="maintenance-settings-head">
              <button type="button" onClick={() => setActiveTab("overview")} aria-label={t("back")}>
                <CaretLeft weight="bold" className={cn(isRtl && "rotate-180")} />
              </button>
              <div>
                <h2>Custom Systems & Subcategories</h2>
                <p>Organize your maintenance taxonomy</p>
              </div>
              <button type="button" onClick={handleAddSystem}><Plus weight="bold" /> Add System</button>
            </div>

            <section className="maintenance-taxonomy-panel">
              <div className="maintenance-section-head compact">
                <h2>Systems / Categories</h2>
                <span>Drag to reorder</span>
              </div>
              <div className="maintenance-system-list">
                {activeMaintenanceSystems.map((system) => {
                  const Icon = ICON_MAP[system.icon] || Wrench;
                  const count = system.categories.filter((catId) => getCategoryById(catId)).length;
                  return (
                    <div key={system.id} className="maintenance-system-row">
                      <button type="button" onClick={() => setSelectedSystemId(system.id)}>
                        <Icon weight="duotone" />
                        <strong>{translateSystemName(system.name)}</strong>
                        <em>{count}</em>
                      </button>
                      <button type="button" onClick={() => {
                        setEditingSystemId(system.id);
                        setEditSystemName(system.name);
                        setEditSystemIcon(system.icon || "Wrench");
                      }} aria-label="Edit system"><Pencil weight="duotone" /></button>
                      <button type="button" onClick={() => {
                        setEditingSystemId(system.id);
                        setEditSystemName(system.name);
                        setEditSystemIcon(system.icon || "Wrench");
                      }} aria-label="Add subcategory"><Plus weight="bold" /></button>
                      <button type="button" className="danger" onClick={() => setConfirmDeleteSystem(system.id)} aria-label="Delete system"><Trash weight="duotone" /></button>
                      <DotsThreeVertical weight="bold" />
                    </div>
                  );
                })}
              </div>
            </section>

          </Motion.section>
        )}

        {activeTab === "__legacy_settings" && (
          <Motion.div
            key="settings"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="grid grid-cols-1 gap-4"
          >
            <h3 className="px-1 text-xs font-black uppercase tracking-wider text-slate-400">
              {t("systems")}
            </h3>

            {activeMaintenanceSystems.map((system) => {
              const Icon = ICON_MAP[system.icon] || Wrench;
              return (
                <Card
                  key={system.id}
                  className="p-4 flex items-center justify-between cursor-pointer"
                  onClick={() => {
                    setEditingSystemId(system.id);
                    setEditSystemName(system.name);
                    setEditSystemIcon(system.icon || "Wrench");
                  }}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center text-white"
                      style={{ backgroundColor: system.color }}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        {translateSystemName(system.name)}
                      </h4>
                      <p className="text-[10px] text-slate-500">
                        {system.categories.filter((catId) => getCategoryById(catId)).length} {t("sub_categories")}
                      </p>
                    </div>
                  </div>
                  <CaretRight
                    weight="duotone"
                    className={cn(
                      "w-5 h-5 text-slate-300",
                      isRtl && "rotate-180",
                    )}
                  />
                </Card>
              );
            })}

            <button
              onClick={handleAddSystem}
              className="p-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-center gap-3 text-slate-400 hover:text-emerald-500 hover:border-emerald-500/50 transition-all active:scale-[0.98]"
            >
              <Plus weight="bold" className="w-5 h-5" />
              <span className="text-sm font-bold">{t("add_system")}</span>
            </button>
          </Motion.div>
        )}
        </AnimatePresence>
      </div>

      <Modal
        isOpen={!!selectedSystemId}
        onClose={() => {
          setSelectedSystemId(null);
          setSelectedMaintenanceItemId(null);
        }}
        title={translateSystemName(activeSystem?.name || "")}
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          {selectedMaintenanceItem ? (
            <Card className="p-5 bg-slate-50 dark:bg-white/[0.02]">
              <button
                type="button"
                onClick={() => setSelectedMaintenanceItemId(null)}
                className="mb-4 text-xs font-bold text-emerald-500 uppercase"
              >
                {t("back")}
              </button>
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    {translateCategoryName(selectedMaintenanceItem)}
                  </h3>
                  <p className="text-xs font-semibold text-slate-500">
                    {selectedMaintenanceItem.isTracked
                      ? `${Math.max(0, Math.round(100 - selectedMaintenanceItem.progressPercent))}% ${t("healthy")}`
                      : t("untracked")}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-[10px] font-black uppercase",
                    selectedMaintenanceItem.status === "overdue"
                      ? "bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-300"
                      : selectedMaintenanceItem.status === "due-soon"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
                  )}
                >
                  {t(selectedMaintenanceItem.status)}
                </span>
              </div>

              {selectedMaintenanceItem.isTracked ? (
                <>
                  <div className="space-y-2">
                    {getMaintenanceDetailRows(selectedMaintenanceItem).map(([label, value]) => (
                      <div key={label} className="flex items-start justify-between gap-4 rounded-2xl bg-white dark:bg-slate-950/40 px-4 py-3">
                        <span className="text-xs font-bold text-slate-500">{label}</span>
                        <span className="max-w-[60%] text-end text-sm font-bold text-slate-900 dark:text-white">{value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 grid grid-cols-[1fr_auto] gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSystemId(null);
                        setSelectedMaintenanceItemId(null);
                        navigate(`/maintenance/edit/${selectedMaintenanceItem.latestLogId}`);
                      }}
                      className="rounded-2xl bg-slate-900 py-3 text-sm font-bold text-white dark:bg-white dark:text-slate-950"
                    >
                      {t("edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => requestMaintenanceDeleteConfirmation(selectedMaintenanceItem.latestLogId, translateCategoryName(selectedMaintenanceItem))}
                      className="rounded-2xl bg-red-50 px-4 py-3 text-red-500 dark:bg-red-500/10"
                    >
                      <Trash weight="duotone" className="w-5 h-5" />
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm font-semibold text-slate-500">
                    {t("maintenance_untracked_hint")}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSystemId(null);
                      setSelectedMaintenanceItemId(null);
                      navigate(`/maintenance/add?type=${selectedMaintenanceItem.id}`);
                    }}
                    className="w-full rounded-2xl bg-emerald-500 py-3 text-sm font-bold text-white"
                  >
                    {t("add_maintenance")}
                  </button>
                </div>
              )}
            </Card>
          ) : (
            activeSystem?.categories.map((item) => (
              <Card
                key={item.id}
                className="p-4 bg-slate-50 dark:bg-white/[0.02] cursor-pointer"
                onClick={() => setSelectedMaintenanceItemId(item.id)}
              >
                <div className="flex justify-between items-center mb-2">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      {translateCategoryName(item)}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      {item.isTracked
                        ? `${Math.max(0, Math.round(100 - item.progressPercent))}% ${t("healthy")}`
                        : t("untracked")}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-black uppercase",
                      item.status === "overdue"
                        ? "text-red-500"
                        : item.status === "due-soon"
                          ? "text-amber-500"
                          : "text-emerald-500",
                    )}
                  >
                    {t(item.status)}
                  </span>
                </div>
                {item.isTracked && (
                  <div className="space-y-2">
                    <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${Math.min(100, Math.max(0, item.progressPercent))}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-500">
                      {t("next_due")}: {item.remainingKm.toLocaleString()}{" "}
                      {t("km_left")}
                    </p>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      </Modal>

      <Modal
        isOpen={!!editingSystemId}
        onClose={closeEditSystemModal}
        title={t("edit") + " " + t("systems")}
      >
        <div className="flex max-h-[72vh] flex-col gap-4">
          <div className="shrink-0 space-y-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsPickingIcon(true)}
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shrink-0 hover:opacity-90 transition-opacity relative group overflow-hidden"
                style={{ backgroundColor: editingSystem?.color }}
              >
                {(() => {
                  const Icon = ICON_MAP[editSystemIcon] || Wrench;
                  return <Icon weight="duotone" className="w-7 h-7" />;
                })()}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <Pencil weight="bold" className="w-4 h-4 text-white" />
                </div>
                <div className="absolute top-1 right-1 w-4 h-4 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                  <Pencil weight="bold" className="w-2.5 h-2.5 text-white" />
                </div>
              </button>
              <div className="flex-1">
                <Label>{t("system_name")}</Label>
                <Input
                  value={editSystemName}
                  onChange={(e) => setEditSystemName(e.target.value)}
                  placeholder={t("systems")}
                />
              </div>
            </div>

            <div className="space-y-2 rounded-2xl bg-slate-50 p-2 dark:bg-white/5">
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Input
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  placeholder={t("custom_category")}
                />
                <button
                  type="button"
                  onClick={handleAddCustomCategory}
                  disabled={!newCategoryName.trim()}
                  className="rounded-xl bg-slate-900 px-4 text-xs font-bold text-white disabled:opacity-50 dark:bg-white dark:text-slate-950"
                >
                  {t("add")}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px]">{t("distance")}</Label>
                  <Input
                    type="number"
                    min="0"
                    value={newCategoryInterval}
                    onChange={(event) => setNewCategoryInterval(event.target.value)}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label className="text-[10px]">{t("safety_margin")}</Label>
                  <Input
                    type="number"
                    min="0"
                    value={newCategorySafety}
                    onChange={(event) => setNewCategorySafety(event.target.value)}
                    className="text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pe-1">
            {editingSystem?.categories.map((catId) => {
              const cat = getCategoryById(catId);
              if (!cat) return null;
              const isRenaming = renamingCatId === catId;
              const catSettings = maintenanceSettings?.categorySettings?.[catId] || {};
              const enabled = catSettings.enabled !== false;
              const interval = catSettings.intervalKm ?? cat.defaultInterval?.value ?? "";
              const margin = catSettings.safetyMarginKm ?? cat.defaultSafetyMarginKm ?? maintenanceSettings.defaultSafetyMarginKm ?? "";
              return (
                <div
                  key={catId}
                  className="space-y-3 p-3 bg-slate-50 dark:bg-white/5 rounded-2xl"
                >
                  <div className="flex items-center justify-between gap-3">
                    {isRenaming ? (
                      <input
                        autoFocus
                        className="bg-white dark:bg-slate-800 rounded px-2 py-1 text-xs w-full"
                        value={renamingCatName}
                        onChange={(e) => setRenamingCatName(e.target.value)}
                        onBlur={() =>
                          handleRenameCategory(catId, renamingCatName)
                        }
                      />
                    ) : (
                      <span className="text-xs font-bold">
                        {translateCategoryName(cat)}
                      </span>
                    )}
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSystemModalHasTaxonomyChanges(true);
                          updateCategorySettings(catId, { enabled: !enabled });
                        }}
                        className={cn(
                          "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors",
                          enabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block h-4 w-4 rounded-full bg-white transition-transform",
                            enabled ? (isRtl ? "-translate-x-1" : "translate-x-5") : (isRtl ? "-translate-x-5" : "translate-x-1"),
                          )}
                        />
                      </button>
                      <button
                        onClick={() => {
                          if (isRenaming) {
                            handleRenameCategory(catId, renamingCatName);
                          } else {
                            setRenamingCatId(catId);
                            setRenamingCatName(cat.name);
                          }
                        }}
                        className={cn(
                          "p-1.5 transition-colors",
                          isRenaming || justSavedCatId === catId
                            ? "text-emerald-500"
                            : "text-slate-400",
                        )}
                      >
                        {isRenaming || justSavedCatId === catId ? (
                          <Check weight="bold" className="w-3.5 h-3.5" />
                        ) : (
                          <Pencil weight="duotone" className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteCat(catId)}
                        className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <Trash weight="duotone" className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px]">{t("distance")}</Label>
                      <Input
                        type="number"
                        min="0"
                        value={interval}
                        onChange={(event) => {
                          setSystemModalHasTaxonomyChanges(true);
                          updateCategorySettings(catId, {
                            intervalKm: event.target.value === "" ? "" : Number(event.target.value),
                          });
                        }}
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">{t("safety_margin")}</Label>
                      <Input
                        type="number"
                        min="0"
                        value={margin}
                        onChange={(event) => {
                          setSystemModalHasTaxonomyChanges(true);
                          updateCategorySettings(catId, {
                            safetyMarginKm: event.target.value === "" ? "" : Number(event.target.value),
                          });
                        }}
                        className="text-sm"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex shrink-0 gap-3 pt-1">
            <button
              onClick={() => setConfirmDeleteSystem(editingSystemId)}
              disabled={!!draftSystem}
              className="p-4 bg-red-50 dark:bg-red-500/10 text-red-500 rounded-2xl transition-all active:scale-[0.98]"
            >
              <Trash weight="duotone" className="w-6 h-6" />
            </button>
            <button
              onClick={handleSaveSystemName}
              className={cn(
                "flex-1 py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2",
                systemSaveFeedback === "saved"
                  ? "bg-emerald-500 text-white"
                  : systemSaveFeedback === "duplicate"
                    ? "bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-300"
                  : systemSaveFeedback === "no-change"
                    ? "bg-slate-200 dark:bg-slate-800 text-slate-500"
                    : "bg-slate-900 dark:bg-white text-white dark:text-slate-900",
              )}
            >
              {systemSaveFeedback === "saved" ? (
                <>
                  <Check weight="bold" className="w-5 h-5" />
                  <span>{t("saved")}</span>
                </>
              ) : systemSaveFeedback === "duplicate" ? (
                <>
                  <Warning weight="bold" className="w-5 h-5" />
                  <span>{t("duplicate")}</span>
                </>
              ) : systemSaveFeedback === "no-change" ? (
                <>
                  <X weight="bold" className="w-5 h-5" />
                  <span>{t("no_changes")}</span>
                </>
              ) : (
                <span>{t("save")}</span>
              )}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={remindersOpen}
        onClose={() => setRemindersOpen(false)}
        title=""
        showCloseButton={false}
        size="lg"
      >
        <div className="maintenance-reminder-sheet">
          <div className="maintenance-sheet-handle" />
          <div className="maintenance-reminder-head">
            <span><Bell weight="duotone" /></span>
            <div>
              <h2>Maintenance Reminders</h2>
              <p>Stay on top of your car's maintenance</p>
            </div>
            <button type="button" onClick={() => setRemindersOpen(false)} aria-label={t("close")}>
              <X weight="bold" />
            </button>
          </div>

          <section className="maintenance-reminder-section">
            <h3>Maintenance Notifications</h3>
            <div className="maintenance-reminder-row">
              <span><Bell weight="duotone" /></span>
              <div><strong>Enable Maintenance Reminders</strong><small>Get notified about upcoming maintenance</small></div>
              <button type="button" className={cn("maintenance-toggle", notificationsEnabled && "on")} onClick={toggleNotifications}>
                <i />
              </button>
            </div>
            {[
              [<Clock key="clock" weight="duotone" />, "Due Soon Reminder", "Notify me before maintenance is due", "7 days before"],
              [<Warning key="warning" weight="duotone" />, "Overdue Reminder", "Notify me when maintenance is overdue", "Every 3 days"],
              [<CalendarBlank key="calendar" weight="duotone" />, "Date-based Reminders", "Based on calendar schedule", ""],
              [<Pulse key="pulse" weight="duotone" />, "Odometer-based Reminders", "Based on distance driven", ""],
            ].map(([icon, title, subtitle, value]) => (
              <div key={title} className="maintenance-reminder-row muted">
                <span>{icon}</span>
                <div><strong>{title}</strong><small>{subtitle}</small></div>
                {value && <em>{value}</em>}
                <button type="button" className={cn("maintenance-toggle", notificationsEnabled && "on")} disabled>
                  <i />
                </button>
              </div>
            ))}
          </section>

          <section className="maintenance-reminder-section">
            <h3>Notification Permissions</h3>
            <div className="maintenance-permission-card">
              <Shield weight="duotone" />
              <div>
                <strong>
                  {!isNotificationSupported
                    ? "Notifications unsupported"
                    : permissionState === "granted"
                      ? "Permission granted"
                      : "Permission needed"}
                </strong>
                <small>
                  {permissionState === "granted"
                    ? "You'll receive maintenance reminders as push notifications."
                    : "Turn on notifications to receive due-soon and overdue alerts."}
                </small>
              </div>
              <button type="button" onClick={toggleNotifications}>Manage</button>
            </div>
          </section>

          <button type="button" className="maintenance-sheet-save" onClick={() => setRemindersOpen(false)}>
            <FloppyDisk weight="duotone" /> Save Settings
          </button>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!confirmDeleteSystem}
        onClose={() => setConfirmDeleteSystem(null)}
        onConfirm={handleDeleteSystem}
        title={t("delete_system")}
        message={
          t("delete_system_warning") ||
          "Deleting this system will remove its tracking data. This action cannot be undone."
        }
        confirmText={t("delete")}
        variant="danger"
      />
      <ConfirmModal
        isOpen={!!confirmDeleteCat}
        onClose={() => setConfirmDeleteCat(null)}
        onConfirm={handleDeleteSubCategory}
        title={t("delete")}
        message={t("delete") + "?"}
        confirmText={t("delete")}
        variant="danger"
      />

      <ConfirmModal
        isOpen={!!confirmDeleteEntry}
        onClose={() => setConfirmDeleteEntry(null)}
        onConfirm={confirmMaintenanceDelete}
        title={t("delete")}
        message={`${t("delete")} ${confirmDeleteEntry?.label || t("maintenance")}?`}
        confirmText={t("delete")}
        cancelText={t("cancel")}
        variant="danger"
      />

      <Modal
        isOpen={pdfOptionsOpen}
        onClose={() => setPdfOptionsOpen(false)}
        title={t("export") || "Export PDF"}
        size="sm"
      >
        <div className="flex max-h-[calc(100dvh-17rem)] flex-col overflow-hidden sm:max-h-[62vh]">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
              <button
                type="button"
                onClick={() => togglePdfSection("summary")}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <span>{t("selected") || "Selected options"}</span>
                <CaretDown
                  weight="bold"
                  className={cn("h-4 w-4 shrink-0 transition-transform", pdfExpandedSections.summary && "rotate-180")}
                />
              </button>
              {pdfExpandedSections.summary && (
                <div className="mt-3 space-y-1 leading-relaxed">
                  <p>
                    Sort: {pdfSortBy === "odometer" ? (t("odometer") || "Odometer") : (t("date") || "Date")}
                  </p>
                  <p>Systems: {pdfSelectedSystemsLabel}</p>
                  <p>
                    Columns: {pdfColumns.length} selected - {pdfColumns.map((id) => pdfColumnLabelById[id]).join(", ")}
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-slate-50 p-3 dark:bg-white/5">
              <button
                type="button"
                onClick={() => togglePdfSection("sort")}
                className="flex w-full items-center justify-between gap-3"
              >
                <Label className="mb-0">{t("sort") || "Sort"}</Label>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black text-emerald-600 dark:text-emerald-300">
                    {pdfSortBy === "odometer" ? (t("odometer") || "Odometer") : (t("date") || "Date")}
                  </span>
                  <CaretDown className={cn("h-4 w-4 text-slate-400 transition-transform", pdfExpandedSections.sort && "rotate-180")} />
                </div>
              </button>
              {pdfExpandedSections.sort && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[
                    { id: "odometer", label: t("odometer") || "Odometer" },
                    { id: "date", label: t("date") || "Date" },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setPdfSortBy(option.id)}
                      className={cn(
                        "rounded-2xl px-3 py-3 text-sm font-bold",
                        pdfSortBy === option.id
                          ? "bg-emerald-500 text-white"
                          : "bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-slate-50 p-3 dark:bg-white/5">
              <button
                type="button"
                onClick={() => togglePdfSection("systems")}
                className="flex w-full items-center justify-between gap-3"
              >
                <Label className="mb-0">{t("maintenance") || "Maintenance"} Systems</Label>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-[10px] font-black text-blue-500">
                    {pdfSystemIds.length === 0 ? `${t("all") || "All"}` : `${pdfSystemIds.length}/${activeMaintenanceSystems.length}`}
                  </span>
                  <CaretDown className={cn("h-4 w-4 text-slate-400 transition-transform", pdfExpandedSections.systems && "rotate-180")} />
                </div>
              </button>
              {pdfExpandedSections.systems && (
                <div className="mt-3">
                  <div className="grid grid-cols-2 gap-2">
                    {activeMaintenanceSystems.map((system) => {
                      const selected = pdfSystemIds.includes(system.id);
                      return (
                        <button
                          key={system.id}
                          type="button"
                          onClick={() =>
                            setPdfSystemIds((prev) =>
                              selected ? prev.filter((id) => id !== system.id) : [...prev, system.id],
                            )
                          }
                          className={cn(
                            "rounded-2xl px-3 py-2 text-xs font-bold",
                            selected
                              ? "bg-blue-600 text-white"
                              : "bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                          )}
                        >
                          {translateSystemName(system.name)}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPdfSystemIds([])}
                    className="mt-2 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-500 dark:bg-slate-800"
                  >
                    {t("all") || "All"} systems
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-slate-50 p-3 dark:bg-white/5">
              <button
                type="button"
                onClick={() => togglePdfSection("columns")}
                className="flex w-full items-center justify-between gap-3"
              >
                <Label className="mb-0">{t("columns") || "Columns"}</Label>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-black text-white dark:bg-white dark:text-slate-950">
                    {pdfColumns.length}/{pdfColumnOptions.length}
                  </span>
                  <CaretDown className={cn("h-4 w-4 text-slate-400 transition-transform", pdfExpandedSections.columns && "rotate-180")} />
                </div>
              </button>
              {pdfExpandedSections.columns && (
                <div className="mt-3">
                  <div className="grid grid-cols-2 gap-2">
                    {pdfColumnOptions.map(([id, label]) => {
                      const selected = pdfColumns.includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() =>
                            setPdfColumns((prev) =>
                              selected ? prev.filter((column) => column !== id) : [...prev, id],
                            )
                          }
                          className={cn(
                            "rounded-2xl px-3 py-2 text-xs font-bold",
                            selected
                              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950"
                              : "bg-white text-slate-500 dark:bg-slate-800 dark:text-slate-400",
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPdfColumns(["date", "odometer", "type", "interval", "nextDue", "cost", "notes"])}
                      className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-500 dark:bg-slate-800"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => setPdfColumns(["odometer", "type", "nextDue"])}
                      className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-500 dark:bg-slate-800"
                    >
                      Essential
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="-mx-1 mt-4 grid shrink-0 grid-cols-[0.8fr_1.2fr] gap-2 border-t border-slate-200 bg-white/95 px-1 pt-4 dark:border-slate-800 dark:bg-slate-950/95">
            <button
              type="button"
              onClick={() => setPdfOptionsOpen(false)}
              className="rounded-2xl bg-slate-100 py-4 text-sm font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            >
              {t("cancel") || "Cancel"}
            </button>
            <button
              type="button"
              onClick={handleExportPDF}
              disabled={pdfColumns.length === 0}
              className="rounded-2xl bg-emerald-500 py-4 text-sm font-black text-white disabled:opacity-50"
            >
              {t("export") || "Export PDF"}
            </button>
          </div>
        </div>
      </Modal>

      <IconPicker
        isOpen={isPickingIcon}
        onClose={() => setIsPickingIcon(false)}
        currentIcon={editSystemIcon}
        onSelect={setEditSystemIcon}
      />

      <AnimatePresence>
        {deleteToast && (
          <MaintenanceUndoToast
            label={deleteToast.label}
            t={t}
            onUndo={undoMaintenanceDelete}
            onClose={finalizeMaintenanceDelete}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {taxonomyUndoToast && (
          <MaintenanceUndoToast
            title={taxonomyUndoToast.title}
            label={taxonomyUndoToast.label}
            t={t}
            onUndo={undoTaxonomyChange}
            onClose={() => setTaxonomyUndoToast(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
