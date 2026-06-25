import {
  Check,
  CheckSquare,
  Fuel,
  RotateCcw,
  SlidersHorizontal,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useFuel } from "../hooks/useFuelContext";
import {
  GlassCard,
  IconButton,
  ScreenHeader,
  VehicleChip,
} from "./PremiumUI";
import { ConfirmModal, cn } from "./ui";
import HistoryCardPremium from "./HistoryCardPremium";

const MotionDiv = motion.div;
const MotionLi = motion.li;
const MotionButton = motion.button;
const DELETE_UNDO_SECONDS = 5;

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
  const pendingDeleteRef = useRef(null);
  const deleteTimeoutRef = useRef(null);
  const deleteIntervalRef = useRef(null);
  const mountedRef = useRef(true);
  const isRtl = i18n.language.startsWith("ar");

  const reversedTrips = [...activeVehicleFillUps].reverse();

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
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
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
    setShowBulkDeleteModal(false);
  };

  return (
    <div className="space-y-4 pb-4">
      <ScreenHeader
        title="Trip History"
        action={
          <IconButton
            icon={SlidersHorizontal}
            label={selectionMode ? t("cancel") : "Select entries"}
            active={selectionMode}
            onClick={() => {
              setSelectionMode(!selectionMode);
              if (selectionMode) setSelectedIds(new Set());
            }}
          />
        }
      />

      <VehicleChip
        vehicles={vehicles}
        selectedVehicleId={selectedVehicleId}
        setSelectedVehicleId={setSelectedVehicleId}
        activeVehicle={activeVehicle}
        className="w-fit max-w-full"
      />

      <GlassCard className="grid grid-cols-3 gap-0 px-2 py-3">
        <div className="min-w-0 px-2">
          <p className="text-[11px] font-semibold leading-tight text-[var(--text-secondary)]">
            Total Fills
          </p>
          <p className="mt-1.5 whitespace-nowrap text-[22px] font-black leading-none text-[var(--text-primary)]">
            {stats.totalFillUps}
          </p>
          <p className="mt-1 text-[11px] font-semibold text-[var(--text-secondary)]">
            This Year
          </p>
        </div>
        <div className="min-w-0 border-x border-[var(--border-soft)] px-2">
          <p className="text-[11px] font-semibold leading-tight text-[var(--text-secondary)]">
            Total Distance
          </p>
          <p className="mt-1.5 whitespace-nowrap text-[21px] font-black leading-none text-[var(--text-primary)]">
            {Math.round(stats.totalDistance).toLocaleString()}{" "}
            <span className="text-[11px] font-semibold text-[var(--text-secondary)]">km</span>
          </p>
          <p className="mt-1 text-[11px] font-semibold text-[var(--text-secondary)]">
            This Year
          </p>
        </div>
        <div className="min-w-0 px-2">
          <p className="text-[11px] font-semibold leading-tight text-[var(--text-secondary)]">
            Total Spent
          </p>
          <p className="mt-1.5 whitespace-nowrap text-[21px] font-black leading-none text-[var(--text-primary)]">
            {Math.round(stats.totalCost).toLocaleString()}{" "}
            <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
              {t("currency")}
            </span>
          </p>
          <p className="mt-1 text-[11px] font-semibold text-[var(--text-secondary)]">
            This Year
          </p>
        </div>
      </GlassCard>

      {activeVehicleFillUps.length === 0 ? (
        <GlassCard className="p-10 text-center">
          <Fuel className="mx-auto mb-4 h-12 w-12 text-[var(--text-muted)]" />
          <p className="font-bold text-[var(--text-secondary)]">{t("untracked")}</p>
        </GlassCard>
      ) : (
        <ul className="space-y-3 pb-4">
          {reversedTrips.map((fill, reversedIndex) => {
            const originalIndex = activeVehicleFillUps.length - 1 - reversedIndex;
            const isSelected = selectedIds.has(fill.id);
            return (
              <MotionLi
                key={fill.id}
                className="relative flex items-center"
                layout
              >
                <AnimatePresence>
                  {selectionMode && (
                    <MotionButton
                      initial={{ opacity: 0, scale: 0.8, x: isRtl ? 10 : -10 }}
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.8, x: isRtl ? 10 : -10 }}
                      onClick={() => toggleSelection(fill.id)}
                      className={cn(
                        "me-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                        isSelected
                          ? "border-[var(--accent-primary)] bg-[var(--accent-primary)] text-slate-950"
                          : "border-[var(--border-medium)] text-[var(--text-muted)]",
                      )}
                    >
                      {isSelected && <Check className="h-4 w-4" />}
                    </MotionButton>
                  )}
                </AnimatePresence>
                <MotionDiv
                  className="min-w-0 flex-1"
                  animate={{
                    scaleX: selectionMode ? 0.96 : 1,
                    x: selectionMode ? (isRtl ? -10 : 10) : 0,
                    originX: isRtl ? 1 : 0,
                  }}
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
        </ul>
      )}

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
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-28 left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-[500px] -translate-x-1/2 overflow-hidden rounded-3xl border border-[var(--border-medium)] bg-[var(--bg-glass-strong)] text-[var(--text-primary)] shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center gap-3 p-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-500/20 text-red-300">
                <Trash2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold">
                  Entry removed: {pendingDeleteToast.label}
                </p>
                <p className="text-[11px] font-semibold text-[var(--text-muted)]">
                  Deleting in {pendingDeleteToast.remaining}s
                </p>
              </div>
              <button
                type="button"
                onClick={handleUndoDelete}
                className="flex h-10 items-center gap-1.5 rounded-2xl bg-[var(--accent-primary)] px-3 text-xs font-bold text-slate-950 transition"
              >
                <RotateCcw className="h-4 w-4" />
                Undo
              </button>
              <button
                type="button"
                onClick={finalizePendingDelete}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-[var(--text-secondary)] transition"
                aria-label="Close delete notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="h-1 bg-white/10">
              <MotionDiv
                className="h-full bg-red-400"
                initial={{ width: "100%" }}
                animate={{ width: "0%" }}
                transition={{ duration: DELETE_UNDO_SECONDS, ease: "linear" }}
              />
            </div>
          </MotionDiv>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedIds.size > 0 && (
          <MotionDiv
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-28 left-1/2 z-50 flex w-[calc(100%-1.5rem)] max-w-[500px] -translate-x-1/2 items-center justify-between rounded-3xl border border-[var(--border-medium)] bg-[var(--bg-glass-strong)] p-3 text-[var(--text-primary)] shadow-2xl backdrop-blur-xl"
          >
            <div className="ms-2 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-primary)] text-sm font-black text-slate-950">
                {selectedIds.size}
              </div>
              <span className="text-xs font-bold">{t("selected")}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={selectAll}
                className="flex h-10 items-center gap-2 rounded-2xl bg-white/10 px-3 text-xs font-bold"
              >
                {selectedIds.size === activeVehicleFillUps.length ? (
                  <Square className="h-4 w-4" />
                ) : (
                  <CheckSquare className="h-4 w-4" />
                )}
              </button>
              <button
                onClick={() => setShowBulkDeleteModal(true)}
                className="flex h-10 items-center gap-2 rounded-2xl bg-red-500 px-3 text-xs font-bold text-white"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  setSelectedIds(new Set());
                  setSelectionMode(false);
                }}
                className="h-10 px-3 text-xs font-bold text-[var(--text-secondary)]"
              >
                {t("cancel")}
              </button>
            </div>
          </MotionDiv>
        )}
      </AnimatePresence>
    </div>
  );
}
