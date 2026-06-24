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
  Square,
  CheckSquare,
  X,
  Palette,
  Layout,
  Pulse,
  Drop,
  Shield,
  BatteryCharging,
  Car,
  Disc,
  Lightning,
  Clock,
  DotsThreeVertical,
  CaretRight,
  FloppyDisk,
  Warning,
  Engine,
  Tire,
  FilePdf,
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
  const { notificationsEnabled } = useNotifications();

  const [activeTab, setActiveTab] = useState("overview"); // overview, history, settings
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [dropdownOpen, setDropdownOpen] = useState(false);
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
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  // Circular Progress Component
  const CircularProgress = ({
    size = 90,
    strokeWidth = 6,
    percentage = 0,
    color = "#3b82f6",
    children,
  }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (percentage / 100) * circumference;

    return (
      <div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg
          width={size}
          height={size}
          className={cn("transform", isRtl ? "rotate-90" : "-rotate-90")}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="transparent"
            className="text-slate-100 dark:text-white/5"
          />
          <Motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.5 }}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {children}
          <span className="text-[10px] font-black mt-0.5" style={{ color }}>
            {Math.round(percentage)}%
          </span>
        </div>
      </div>
    );
  };

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

  return (
    <div className="fixed inset-x-0 bottom-24 top-20 mx-auto flex w-full max-w-lg flex-col overflow-hidden px-5">
      <div className="z-30 -mx-1 shrink-0 space-y-5 bg-white/95 px-1 pb-4 pt-1 backdrop-blur-xl dark:bg-black/95">
        <div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            {t("maintenance")}
          </h2>
        </div>

        <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-900/50 rounded-2xl relative z-20">
          {["overview", "history", "settings"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold capitalize transition-all ${activeTab === tab ? "text-slate-900 dark:text-white" : "text-slate-500"}`}
            >
              {activeTab === tab && (
                <Motion.div
                  layoutId="maintenanceActiveTab"
                  className="absolute inset-0 bg-white dark:bg-slate-800 rounded-xl shadow-sm"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10">{t(tab)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-24 no-scrollbar">
        <AnimatePresence mode="wait">
          {activeTab === "overview" && (
            <Motion.div
              key="overview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="grid grid-cols-2 gap-4"
            >
            {systemStatus.map((system) => {
              const isOverdue = system.status === "overdue";
              const Icon = ICON_MAP[system.icon] || Wrench;
              return (
                <Card
                  key={system.id}
                  className={cn(
                    "p-4 flex flex-col items-center text-center rounded-[2rem] cursor-pointer transition-all active:scale-[0.96]",
                    isOverdue && "ring-2 ring-red-500/50 bg-red-500/5",
                  )}
                  onClick={() => setSelectedSystemId(system.id)}
                >
                  <CircularProgress
                    percentage={system.healthScore}
                    color={system.displayColor}
                    size={70}
                    strokeWidth={5}
                  >
                    <Icon
                      className={cn(
                        "w-6 h-6",
                        isOverdue
                          ? "text-red-500"
                          : system.status === "due-soon"
                            ? "text-amber-500"
                            : "text-slate-900 dark:text-white",
                      )}
                    />
                  </CircularProgress>
                  <div className="mt-3">
                    <h4 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                      {translateSystemName(system.name)}
                    </h4>
                    <p
                      className={cn(
                        "text-[10px] font-bold mt-0.5",
                        isOverdue
                          ? "text-red-500"
                          : system.status === "due-soon"
                            ? "text-amber-500"
                            : "text-slate-500",
                      )}
                    >
                      {system.desc}
                    </p>
                    <p className="text-[8px] font-medium text-slate-400 mt-0.5 uppercase">
                      {system.subDesc}
                    </p>
                  </div>
                </Card>
              );
            })}
            </Motion.div>
          )}

        {activeTab === "history" && (
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
