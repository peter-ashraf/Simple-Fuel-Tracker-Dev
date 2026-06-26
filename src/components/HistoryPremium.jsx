import {
  Check,
  CheckSquare,
  ChevronDown,
  Fuel,
  ReceiptText,
  RotateCcw,
  SlidersHorizontal,
  Square,
  Trash2,
  X,
  Car,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useFuel } from "../hooks/useFuelContext";
import { getVehicleImageRecords } from "../utils/vehicleImageStore";
import { ConfirmModal, cn } from "./ui";
import HistoryCardPremium from "./HistoryCardPremium";
import "./HistoryPremium.css";

const MotionDiv = motion.div;
const MotionLi = motion.li;
const MotionButton = motion.button;
const DELETE_UNDO_SECONDS = 5;

const RoadIcon = ({ className, strokeWidth = 1.8, ...props }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
    {...props}
  >
    <path d="M8.5 20 11 4" />
    <path d="M15.5 20 13 4" />
    <path d="M12 6.8v2.1" />
    <path d="M12 12v2.1" />
    <path d="M12 17.2v2.1" />
  </svg>
);


const getDefaultVehicleImage = () => {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.endsWith("/") ? base : `${base}/`}vehicle-images/vehicle-hero-default.png`;
};

const normalizeStoredImageValue = (value) => {
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
      const parsed = JSON.parse(trimmed);
      return normalizeStoredImageValue(parsed);
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
      null
    );
  }

  return null;
};

const getVehicleImageFromObject = (vehicle) => {
  if (!vehicle) return null;

  return normalizeStoredImageValue(
    vehicle.heroImageUrl ||
      vehicle.hero_image_url ||
      vehicle.imageUrl ||
      vehicle.image_url ||
      vehicle.photoUrl ||
      vehicle.photo_url ||
      vehicle.vehicleImageUrl ||
      vehicle.vehicle_image_url ||
      vehicle.heroImage ||
      vehicle.vehicleImage ||
      vehicle.image ||
      vehicle.photo,
  );
};

const getVehicleImageLookupIds = (vehicleOrId) => {
  if (!vehicleOrId) return [];
  if (typeof vehicleOrId !== "object") return [String(vehicleOrId)];

  return [
    vehicleOrId.id,
    vehicleOrId.stableId,
    vehicleOrId.stable_id,
    vehicleOrId.stableKey,
    vehicleOrId.stable_key,
  ]
    .filter(Boolean)
    .map(String);
};


const getVehicleImageActiveEntryKey = (vehicleId) => `sft_vehicle_image_active_${vehicleId}`;

const getStoredActiveVehicleImageEntryId = (vehicleId) => {
  if (!vehicleId || typeof window === "undefined") return null;

  const key = getVehicleImageActiveEntryKey(vehicleId);
  const direct = window.localStorage.getItem(key);
  if (direct) return direct;

  // Dev storage isolation can prefix keys; scan as a fallback so History sees
  // the exact active photo selected on Dashboard.
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const storageKey = window.localStorage.key(index);
    if (!storageKey || (!storageKey.endsWith(key) && storageKey !== key)) continue;
    const value = window.localStorage.getItem(storageKey);
    if (value) return value;
  }

  return null;
};

const getIndexedVehicleImage = async (vehicle) => {
  const ids = getVehicleImageLookupIds(vehicle);

  for (const id of ids) {
    try {
      const records = await getVehicleImageRecords(id);
      if (!records?.length) continue;

      const activeEntryId = getStoredActiveVehicleImageEntryId(id);
      const activeRecord =
        records.find((record) => record.id === activeEntryId) || records[0];

      const dataUrl = normalizeStoredImageValue(activeRecord?.dataUrl);
      if (dataUrl) return dataUrl;
    } catch (error) {
      console.warn("[History] Could not load vehicle image record.", error);
    }
  }

  return null;
};

const getStoredVehicleImage = (vehicleOrId) => {
  if (!vehicleOrId || typeof window === "undefined") return null;

  const ids = getVehicleImageLookupIds(vehicleOrId);
  const directKeys = ids.flatMap((id) => [
    `sft_vehicle_image_${id}`,
    `vehicle_image_${id}`,
    `vehicleHeroImage:${id}`,
    `vehicle-image-${id}`,
  ]);

  for (const key of directKeys) {
    const value = normalizeStoredImageValue(window.localStorage.getItem(key));
    if (value) return value;
  }

  // Some dev builds isolate storage by prefixing keys. Scan by suffix so the History
  // selector can reuse the same per-vehicle image already visible on Dashboard.
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const storageKey = window.localStorage.key(index);
    if (!storageKey) continue;
    const matched = directKeys.some((key) => storageKey === key || storageKey.endsWith(key));
    if (!matched) continue;

    const value = normalizeStoredImageValue(window.localStorage.getItem(storageKey));
    if (value) return value;
  }

  const objectKeys = ["sft_vehicle_images", "vehicle_images"];
  for (const key of objectKeys) {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) || "{}");
      for (const id of ids) {
        const value = normalizeStoredImageValue(parsed?.[id]);
        if (value) return value;
      }
    } catch {
      // Ignore malformed legacy storage entries.
    }
  }

  return null;
};

const resolveHistoryVehicleImage = (vehicle, cache = {}) => (
  cache?.[vehicle?.id] ||
  getStoredVehicleImage(vehicle) ||
  getVehicleImageFromObject(vehicle) ||
  getDefaultVehicleImage()
);

export default function HistoryPremium() {
  const {
    activeVehicle,
    vehicles,
    selectedVehicleId,
    setSelectedVehicleId,
    activeVehicleFillUps,
    stats,
    deleteFillUp,
    requestDeleteFillUp,
    undoDeleteFillUp,
    deleteMultipleFillUps,
    updateFillUp,
  } = useFuel();
  const { t, i18n } = useTranslation();
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [pendingDeleteToast, setPendingDeleteToast] = useState(null);
  const [vehicleImages, setVehicleImages] = useState({});
  const pendingDeleteRef = useRef(null);
  const deleteTimeoutRef = useRef(null);
  const deleteIntervalRef = useRef(null);
  const mountedRef = useRef(true);
  const isRtl = i18n.language.startsWith("ar");

  const reversedTrips = useMemo(
    () => [...activeVehicleFillUps].reverse(),
    [activeVehicleFillUps],
  );

  useEffect(() => {
    let cancelled = false;

    const readImages = async () => {
      const nextImages = {};

      await Promise.all(
        vehicles.map(async (vehicle) => {
          const indexedImage = await getIndexedVehicleImage(vehicle);
          const src =
            indexedImage ||
            getStoredVehicleImage(vehicle) ||
            getVehicleImageFromObject(vehicle);

          if (src) nextImages[vehicle.id] = src;
        }),
      );

      if (!cancelled) setVehicleImages(nextImages);
    };

    readImages();

    if (typeof window === "undefined") {
      return () => {
        cancelled = true;
      };
    }

    window.addEventListener("storage", readImages);
    window.addEventListener("focus", readImages);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", readImages);
      window.removeEventListener("focus", readImages);
    };
  }, [vehicles, selectedVehicleId]);

  const clearDeleteTimers = () => {
    if (deleteTimeoutRef.current) {
      clearTimeout(deleteTimeoutRef.current);
      deleteTimeoutRef.current = null;
    }

    if (deleteIntervalRef.current) {
      clearInterval(deleteIntervalRef.current);
      deleteIntervalRef.current = null;
    }
  };

  const finalizePendingDelete = () => {
    const pending = pendingDeleteRef.current;
    if (!pending) return;

    clearDeleteTimers();
    pendingDeleteRef.current = null;
    deleteFillUp(pending.id);

    if (mountedRef.current) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(pending.id);
        return next;
      });
      setPendingDeleteToast(null);
    }
  };

  const handleUndoDelete = () => {
    const pending = pendingDeleteRef.current;
    if (!pending) return;

    clearDeleteTimers();
    pendingDeleteRef.current = null;
    undoDeleteFillUp(pending.id);
    setPendingDeleteToast(null);
  };

  const handleDeleteWithUndo = (id) => {
    if (pendingDeleteRef.current) finalizePendingDelete();

    const fill = activeVehicleFillUps.find((item) => item.id === id);
    const deadline = Date.now() + DELETE_UNDO_SECONDS * 1000;
    const pending = {
      id,
      label: fill ? `${fill.odometer.toLocaleString()} km` : t("delete"),
      deadline,
    };

    pendingDeleteRef.current = pending;
    requestDeleteFillUp(id);
    setPendingDeleteToast({ ...pending, remaining: DELETE_UNDO_SECONDS });

    deleteIntervalRef.current = setInterval(() => {
      const current = pendingDeleteRef.current;
      if (!current) return;

      const remaining = Math.max(
        0,
        Math.ceil((current.deadline - Date.now()) / 1000),
      );

      if (mountedRef.current) {
        setPendingDeleteToast((prev) =>
          prev ? { ...prev, remaining } : prev,
        );
      }
    }, 250);

    deleteTimeoutRef.current = setTimeout(
      finalizePendingDelete,
      DELETE_UNDO_SECONDS * 1000,
    );
  };

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      clearDeleteTimers();
    };
  }, []);

  const toggleSelection = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === activeVehicleFillUps.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(activeVehicleFillUps.map((fill) => fill.id)));
    }
  };

  const handleBulkDelete = () => {
    deleteMultipleFillUps(Array.from(selectedIds));
    setSelectedIds(new Set());
    setSelectionMode(false);
    setShowBulkDeleteModal(false);
  };

  const closeSelectionMode = () => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  };

  return (
    <div className="history-premium-screen">
      <div className="history-premium-content">
        <div className="history-fixed-zone">
          <header className="history-topbar">
            <div className="history-title-block">
              <h1>Trip History</h1>
              <HistoryVehicleSelector
                vehicles={vehicles}
                selectedVehicleId={selectedVehicleId}
                setSelectedVehicleId={setSelectedVehicleId}
                activeVehicle={activeVehicle}
                vehicleImages={vehicleImages}
              />
            </div>

            <button
              type="button"
              className={cn("history-filter-button", selectionMode && "active")}
              aria-label={selectionMode ? t("cancel") : "Select entries"}
              onClick={() => {
                setSelectionMode((current) => !current);
                if (selectionMode) setSelectedIds(new Set());
              }}
            >
              {selectionMode ? <X className="h-5 w-5" /> : <SlidersHorizontal className="h-5 w-5" />}
            </button>
          </header>

          <section className="history-summary-card" aria-label="History summary">
            <SummaryMetric
              icon={ReceiptText}
              label="Total Fills"
              value={stats.totalFillUps}
              caption="This Year"
            />
            <SummaryMetric
              icon={RoadIcon}
              label="Total Distance"
              value={Math.round(stats.totalDistance).toLocaleString()}
              unit="km"
              caption="This Year"
            />
            <SummaryMetric
              icon={Fuel}
              label="Total Spent"
              value={Math.round(stats.totalCost).toLocaleString()}
              unit={t("currency")}
              caption="This Year"
            />
          </section>
        </div>

        <div className="history-scroll-zone">
          {activeVehicleFillUps.length === 0 ? (
            <section className="history-empty-card">
              <Fuel className="h-10 w-10" />
              <p>{t("untracked")}</p>
              <span>Add your first fill-up to start building trip history.</span>
            </section>
          ) : (
            <ul className="history-list">
              <AnimatePresence initial={false} mode="popLayout">
                {reversedTrips.map((fill, reversedIndex) => {
                  const originalIndex = activeVehicleFillUps.length - 1 - reversedIndex;
                  const isSelected = selectedIds.has(fill.id);
                  return (
                    <MotionLi
                      key={fill.id}
                      layout="position"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.16, ease: "easeOut" }}
                      className="history-list-row"
                    >
                      <AnimatePresence initial={false}>
                        {selectionMode && (
                          <MotionButton
                            type="button"
                            initial={{ opacity: 0, scale: 0.9, x: isRtl ? 8 : -8 }}
                            animate={{ opacity: 1, scale: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.9, x: isRtl ? 8 : -8 }}
                            transition={{ duration: 0.12, ease: "easeOut" }}
                            onClick={() => toggleSelection(fill.id)}
                            className={cn(
                              "history-selection-button",
                              isSelected && "selected",
                            )}
                            aria-label={isSelected ? "Deselect entry" : "Select entry"}
                          >
                            {isSelected && <Check className="h-4 w-4" />}
                          </MotionButton>
                        )}
                      </AnimatePresence>

                      <MotionDiv
                        className="history-card-wrap"
                        layout="position"
                        animate={{ x: selectionMode ? (isRtl ? -4 : 4) : 0 }}
                        transition={{ duration: 0.12, ease: "easeOut" }}
                      >
                        <HistoryCardPremium
                          fill={fill}
                          index={originalIndex}
                          fillUps={activeVehicleFillUps}
                          onDelete={handleDeleteWithUndo}
                          onUpdate={updateFillUp}
                        />
                      </MotionDiv>
                    </MotionLi>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={showBulkDeleteModal}
        onClose={() => setShowBulkDeleteModal(false)}
        onConfirm={handleBulkDelete}
        title={t("delete")}
        message={t("delete") + "?"}
        confirmText={t("delete")}
        variant="danger"
      />

      <AnimatePresence>
        {pendingDeleteToast && (
          <MotionDiv
            initial={{ opacity: 0, y: 32, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 32, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="history-floating-toast"
          >
            <div className="history-toast-content">
              <div className="history-toast-icon"><Trash2 className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1">
                <p>Entry removed: {pendingDeleteToast.label}</p>
                <span>Deleting in {pendingDeleteToast.remaining}s</span>
              </div>
              <button type="button" onClick={handleUndoDelete}>
                <RotateCcw className="h-4 w-4" />
                Undo
              </button>
              <button
                type="button"
                onClick={finalizePendingDelete}
                className="icon-only"
                aria-label="Close delete notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="history-toast-progress">
              <MotionDiv
                initial={{ width: "100%" }}
                animate={{ width: "0%" }}
                transition={{ duration: DELETE_UNDO_SECONDS, ease: "linear" }}
              />
            </div>
          </MotionDiv>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectionMode && (
          <MotionDiv
            initial={{ opacity: 0, y: 34, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 34, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="history-selection-toolbar"
          >
            <div className="history-selection-count">
              <span>{selectedIds.size}</span>
              <p>{selectedIds.size === 1 ? "Selected" : "Selected"}</p>
            </div>

            <div className="history-selection-actions">
              <button type="button" onClick={selectAll}>
                {selectedIds.size === activeVehicleFillUps.length ? (
                  <Square className="h-4 w-4" />
                ) : (
                  <CheckSquare className="h-4 w-4" />
                )}
                <span>{selectedIds.size === activeVehicleFillUps.length ? "None" : "All"}</span>
              </button>
              <button
                type="button"
                onClick={() => selectedIds.size > 0 && setShowBulkDeleteModal(true)}
                className="danger"
                disabled={selectedIds.size === 0}
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete</span>
              </button>
              <button type="button" onClick={closeSelectionMode} className="cancel">
                Done
              </button>
            </div>
          </MotionDiv>
        )}
      </AnimatePresence>
    </div>
  );
}

function HistoryVehicleSelector({
  vehicles,
  selectedVehicleId,
  setSelectedVehicleId,
  activeVehicle,
  vehicleImages,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = activeVehicle || vehicles.find((vehicle) => vehicle.id === selectedVehicleId);
  const selectedImage = resolveHistoryVehicleImage(selected, vehicleImages);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="history-vehicle-selector" ref={ref}>
      <button
        type="button"
        className="history-vehicle-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <VehicleThumb src={selectedImage} name={selected?.name} />
        <span>{selected?.name || "Select vehicle"}</span>
        <ChevronDown className={cn("h-4 w-4", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && vehicles.length > 0 && (
          <MotionDiv
            className="history-vehicle-menu"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
          >
            {vehicles.map((vehicle) => {
              const active = vehicle.id === selectedVehicleId;
              return (
                <button
                  type="button"
                  key={vehicle.id}
                  className={cn("history-vehicle-menu-item", active && "active")}
                  onClick={() => {
                    setSelectedVehicleId?.(vehicle.id);
                    setOpen(false);
                  }}
                >
                  <VehicleThumb src={resolveHistoryVehicleImage(vehicle, vehicleImages)} name={vehicle.name} />
                  <span>{vehicle.name}</span>
                  {active && <Check className="h-4 w-4" />}
                </button>
              );
            })}
          </MotionDiv>
        )}
      </AnimatePresence>
    </div>
  );
}

function VehicleThumb({ src, name }) {
  const isSavedDashboardImage =
    typeof src === "string" &&
    (src.startsWith("data:image/") || src.startsWith("blob:"));

  return (
    <span
      className={cn(
        "history-vehicle-thumb",
        isSavedDashboardImage && "history-vehicle-thumb-saved",
      )}
      aria-hidden="true"
    >
      {src ? (
        <img src={src} alt={name || "Vehicle"} draggable="false" />
      ) : (
        <Car className="h-4 w-4" strokeWidth={1.8} />
      )}
    </span>
  );
}

function SummaryMetric({ icon: Icon, label, value, unit, caption }) {
  return (
    <div className="history-summary-metric">
      <div className="history-summary-icon">
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </div>
      <div className="history-summary-copy">
        <p>{label}</p>
        <strong>
          {value}
          {unit && <span>{unit}</span>}
        </strong>
        <small>{caption}</small>
      </div>
    </div>
  );
}
