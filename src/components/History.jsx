import {
  ArrowCounterClockwise,
  Trash,
  GasPump,
  Check,
  Square,
  CheckSquare,
  X,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useFuel } from "../hooks/useFuelContext";
import { PageWrapper, ConfirmModal, cn } from "./ui";
import HistoryCard from "./HistoryCard";
import { useTranslation } from "react-i18next";

const MotionDiv = motion.div;
const MotionLi = motion.li;
const MotionButton = motion.button;
const DELETE_UNDO_SECONDS = 5;

export default function History() {
  const {
    activeVehicleFillUps,
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

    deleteTimeoutRef.current = setTimeout(finalizePendingDelete, DELETE_UNDO_SECONDS * 1000);
  };

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      if (deleteIntervalRef.current) clearInterval(deleteIntervalRef.current);
    };
  }, []);

  const toggleSelection = (id) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    if (selectedIds.size === activeVehicleFillUps.length)
      setSelectedIds(new Set());
    else setSelectedIds(new Set(activeVehicleFillUps.map((f) => f.id)));
  };

  const handleBulkDelete = () => {
    deleteMultipleFillUps(Array.from(selectedIds));
    setSelectedIds(new Set());
    setShowBulkDeleteModal(false);
  };

  return (
    <PageWrapper className="max-h-[calc(100vh-8rem)] overflow-y-auto no-scrollbar">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          {t("history")}
        </h2>
        <button
          onClick={() => {
            setSelectionMode(!selectionMode);
            if (!selectionMode) setSelectedIds(new Set());
          }}
          className={cn(
            "text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-3 py-1.5 bg-slate-100 dark:bg-white/[0.04] rounded-xl border border-slate-200 dark:border-white/[0.06] transition-all active:scale-95",
            isRtl ? "mr-auto" : "ml-auto"
          )}
        >
          {t("entries")} {activeVehicleFillUps.length}
        </button>
      </div>

      {activeVehicleFillUps.length === 0 ? (
        <div className="text-center py-16 px-6 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-3xl">
          <GasPump weight="duotone" className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 font-medium">
            {t("untracked")}
          </p>
        </div>
      ) : (
        <ul className="space-y-4 pb-4">
          {reversedTrips.map((fill, reversedIndex) => {
            const originalIndex =
              activeVehicleFillUps.length - 1 - reversedIndex;
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
                      className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 dark:border-slate-600"}`}
                    >
                      {isSelected && <Check weight="duotone" className="w-3.5 h-3.5" />}
                    </MotionButton>
                  )}
                </AnimatePresence>
                <MotionDiv
                  className="flex-1"
                  animate={{
                    scaleX: selectionMode ? 0.92 : 1,
                    x: selectionMode ? (isRtl ? -24 : 24) : 0,
                    originX: isRtl ? 1 : 0,
                  }}
                >
                  <HistoryCard
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
            className="fixed bottom-24 left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-[500px] -translate-x-1/2 overflow-hidden rounded-3xl border border-white/10 bg-slate-950 text-white shadow-2xl dark:bg-slate-800"
          >
            <div className="flex items-center gap-3 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-red-500/20 text-red-300">
                <Trash weight="duotone" className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold">
                  Entry removed: {pendingDeleteToast.label}
                </p>
                <p className="text-[10px] font-semibold text-slate-400">
                  Deleting in {pendingDeleteToast.remaining}s
                </p>
              </div>
              <button
                type="button"
                onClick={handleUndoDelete}
                className="flex h-10 items-center gap-1.5 rounded-2xl bg-emerald-500 px-3 text-xs font-bold text-white transition hover:bg-emerald-400"
              >
                <ArrowCounterClockwise weight="duotone" className="h-4 w-4" />
                Undo
              </button>
              <button
                type="button"
                onClick={finalizePendingDelete}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-slate-300 transition hover:bg-white/20 hover:text-white"
                aria-label="Close delete notification"
              >
                <X weight="bold" className="h-4 w-4" />
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
            className="fixed bottom-24 left-1/2 -translate-x-1/2 w-full max-w-[95%] sm:max-w-[500px] bg-slate-900 dark:bg-slate-800 text-white rounded-3xl shadow-2xl p-3 flex items-center justify-between z-50 border border-white/10"
          >
            <div className="flex items-center gap-2 ms-2">
              <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold text-sm">
                {selectedIds.size}
              </div>
              <span className="font-bold text-xs">{t("selected")}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={selectAll}
                className="h-10 px-3 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-2xl transition-all flex items-center gap-2 border border-white/5"
              >
                {selectedIds.size === activeVehicleFillUps.length ? (
                  <Square weight="duotone" className="w-4 h-4" />
                ) : (
                  <CheckSquare weight="duotone" className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={() => setShowBulkDeleteModal(true)}
                className="h-10 px-3 bg-red-500 hover:bg-red-600 text-white font-bold text-xs rounded-2xl transition-all flex items-center gap-2"
              >
                <Trash weight="duotone" className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setSelectedIds(new Set());
                  setSelectionMode(false);
                }}
                className="h-10 px-3 text-xs font-bold text-slate-400 hover:text-white transition-colors"
              >
                {t("cancel")}
              </button>
            </div>
          </MotionDiv>
        )}
      </AnimatePresence>
    </PageWrapper>
  );
}
