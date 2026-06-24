// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from "framer-motion";
import {
  CloudArrowUp,
  CloudArrowDown,
  ArrowsMerge,
  X,
  Warning,
  CheckCircle,
  XCircle,
  Spinner,
  Info,
} from "@phosphor-icons/react";
import { useState, useEffect } from "react";
import {
  isNoOpSync,
  getResultTitle,
  getResultMessage,
} from "../utils/syncResultHelpers.js";
import ConflictReviewModal from "./ConflictReviewModal.jsx";

const ENTITY_LABELS = {
  vehicles: "vehicles",
  fillups: "fill-ups",
  maintenance: "maintenance entries",
  maintenanceTaxonomy: "maintenance systems, categories, or rules",
  tripEstimates: "trip estimates",
  tyreComparisons: "tire comparisons",
  appSettings: "app settings",
};

const CHANGE_LABELS = {
  localOnly: "new on this device",
  cloudOnly: "new in cloud",
  bothChanged: "changed in both places",
  localDeleted: "deleted on this device",
  cloudDeleted: "deleted in cloud",
};

const getEntityLabel = (entityKey) => ENTITY_LABELS[entityKey] || entityKey;

const getDetailedChangeRows = (detailedDiff) => {
  if (!detailedDiff?.entities) return [];

  return Object.entries(detailedDiff.entities)
    .flatMap(([entityKey, diff]) =>
      Object.entries(CHANGE_LABELS)
        .map(([changeKey, label]) => ({
          entity: getEntityLabel(entityKey),
          label,
          count: diff?.[changeKey]?.length || 0,
        }))
        .filter((row) => row.count > 0),
    )
    .slice(0, 6);
};

export default function DataMigrationModal({
  syncStatus,
  onDecision,
  onCancel,
  loading,
  loadingAction,
  result,
  onCloseResult,
  onRetry,
  disableClose,
  userId,
  setSyncStatus,
}) {
  const safeSyncStatus = syncStatus ?? {};

  const {
    hasLocalData = false,
    hasCloudData = false,
    localCounts = { vehicles: 0, fillups: 0, maintenance: 0, tripEstimates: 0 },
    cloudCounts = { vehicles: 0, fillups: 0, maintenance: 0, tripEstimates: 0 },
    scenario = null,
    detailedDiff = null,
  } = safeSyncStatus;

  // Detect imported data scenario: local exists, cloud empty
  const isImportedData = hasLocalData && !hasCloudData;

  // For imported data, disable closing the modal until user makes a decision
  const isNonDismissible = isImportedData && !result && !loading;
  const detailedChangeRows = getDetailedChangeRows(detailedDiff);

  // Slow loading message state
  const [showSlowMessage, setShowSlowMessage] = useState(false);

  // Conflict resolution state
  const [showConflictReview, setShowConflictReview] = useState(false);
  const [conflictData, setConflictData] = useState(null);

  // Show slow loading message after 7 seconds
  useEffect(() => {
    let timeoutId;
    if (loading) {
      timeoutId = setTimeout(() => {
        setShowSlowMessage(true);
      }, 7000);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [loading]);

  const handleUpload = async () => {
    if (loading) return;
    const decisionResult = await onDecision("upload");
    if (decisionResult?.needsResolution) {
      setConflictData(decisionResult);
      setShowConflictReview(true);
    }
  };

  const handleDownload = async () => {
    if (loading) return;
    const decisionResult = await onDecision("download");
    if (decisionResult?.needsResolution) {
      setConflictData(decisionResult);
      setShowConflictReview(true);
    }
  };

  const handleMerge = async () => {
    if (loading) return;
    const decisionResult = await onDecision("merge");
    if (decisionResult?.needsResolution) {
      setConflictData(decisionResult);
      setShowConflictReview(true);
    }
  };

  const handleKeepLocal = async () => {
    if (loading) return;
    await onDecision("keep-local");
  };

  const handleConflictResolve = async (resolutionResult) => {
    // 1. Close your specialized inner review interfaces
    setShowConflictReview(false);
    setConflictData(null);

    // 2. 🟢 CLEAR THE CONFLICT COUNTERS FROM UI STATE
    // This prevents the parent layout conditional from matching true on evaluation loops
    if (typeof setSyncStatus === "function") {
      setSyncStatus((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          detailedDiff: {
            ...prev.detailedDiff,
            conflicts: [], // Empty the conflict loop check array
            summary: {
              ...prev.detailedDiff?.summary,
              bothChanged: 0, // Reset the numeric summary flag
            },
          },
        };
      });
    }

    // 3. 🟢 RUN AN INTERNAL IN-MEMORY STATE REFRESH IF AVAILABLE
    // Instead of window.location.reload(), just call your app-level reload data hook
    // if (typeof refreshLocalAppState === "function") {
    //   await refreshLocalAppState();
    // } else if (typeof fetchSummary === "function") {
    //   await fetchSummary(); // Or your equivalent state aggregator hook
    // }

    // 4. Send metrics out to your success step screen layout safely
    onCloseResult({
      success: resolutionResult.errors.length === 0,
      message:
        resolutionResult.errors.length === 0
          ? `Resolved ${resolutionResult.resolved} conflict${resolutionResult.resolved !== 1 ? "s" : ""}, ${resolutionResult.skipped} skipped`
          : "Resolution completed with errors",
      details: resolutionResult.errors,
      summary: resolutionResult,
    });
  };

  const handleConflictCancel = () => {
    setShowConflictReview(false);
    setConflictData(null);
  };

  const getLoadingMessage = () => {
    switch (loadingAction) {
      case "upload":
        return "Uploading local data to cloud...";
      case "download":
        return "Downloading cloud data...";
      case "merge":
        return "Merging local and cloud data...";
      case "keep-local":
        return "Preserving local data...";
      default:
        return "Processing...";
    }
  };

  return (
    <>
      {/* Conflict Review Modal */}
      <AnimatePresence>
        {showConflictReview && conflictData && (
          <ConflictReviewModal
            conflicts={conflictData.conflicts}
            nonConflicts={conflictData.nonConflicts}
            onResolve={handleConflictResolve}
            onCancel={handleConflictCancel}
            userId={userId}
          />
        )}
      </AnimatePresence>

      {/* Main Data Migration Modal */}
      <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[min(85vh,720px)]"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                {result ? (
                  result.success ? (
                    <CheckCircle
                      weight="duotone"
                      className="text-emerald-500 dark:text-emerald-400 w-5 h-5"
                    />
                  ) : (
                    <XCircle
                      weight="duotone"
                      className="text-red-500 dark:text-red-400 w-5 h-5"
                    />
                  )
                ) : loading ? (
                  <Spinner
                    weight="duotone"
                    className="text-emerald-500 dark:text-emerald-400 w-5 h-5 animate-spin"
                  />
                ) : (
                  <CloudArrowUp
                    weight="duotone"
                    className="text-emerald-500 dark:text-emerald-400 w-5 h-5"
                  />
                )}
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                {result
                  ? getResultTitle(result)
                  : loading
                    ? "Processing"
                    : "Data Sync Setup"}
              </h2>
            </div>
            {!disableClose && !loading && !isNonDismissible && (
              <button
                onClick={result ? onCloseResult : onCancel}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition flex-shrink-0"
              >
                <X weight="duotone" className="text-slate-400 w-5 h-5" />
              </button>
            )}
          </div>

          {/* Content - Scrollable */}
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 flex-1 overflow-y-auto min-h-0">
            {/* Loading State */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-8 space-y-4">
                <Spinner
                  weight="duotone"
                  className="w-12 h-12 text-emerald-500 animate-spin"
                />
                <p className="text-base sm:text-lg font-semibold text-slate-700 dark:text-slate-300 text-center">
                  {getLoadingMessage()}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
                  Please wait, this may take a moment...
                </p>
                {showSlowMessage && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 text-center max-w-xs px-4">
                    This is taking longer than expected. Your network may be
                    slow, or there may be a large amount of data to process.
                  </p>
                )}
              </div>
            )}

            {/* Result State */}
            {result && !loading && (
              <div className="space-y-4">
                <div
                  className={`flex items-start gap-3 p-4 rounded-2xl border ${result.success ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20" : "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20"}`}
                >
                  {result.success ? (
                    <CheckCircle
                      weight="duotone"
                      className="text-emerald-500 w-6 h-6 mt-0.5 flex-shrink-0"
                    />
                  ) : (
                    <XCircle
                      weight="duotone"
                      className="text-red-500 w-6 h-6 mt-0.5 flex-shrink-0"
                    />
                  )}
                  <div className="flex-1">
                    <h3
                      className={`font-semibold mb-1 ${result.success ? "text-emerald-900 dark:text-emerald-400" : "text-red-900 dark:text-red-400"}`}
                    >
                      {getResultMessage(result)}
                    </h3>
                    {result.success &&
                      result.counts &&
                      (result.counts.vehicles > 0 ||
                        result.counts.fillups > 0 ||
                        result.counts.maintenance > 0 ||
                        result.counts.tripEstimates > 0) && (
                        <div className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                          {isNoOpSync(result) ? (
                            <span>
                              Synced records: {result.counts.vehicles || 0}{" "}
                              vehicles, {result.counts.fillups || 0} fill-ups
                            </span>
                          ) : (
                            <div className="space-y-1">
                              {result.counts.vehicles > 0 && (
                                <div>
                                  • {result.counts.vehicles} vehicle
                                  {result.counts.vehicles !== 1 ? "s" : ""}{" "}
                                  uploaded
                                </div>
                              )}
                              {result.counts.fillups > 0 && (
                                <div>
                                  • {result.counts.fillups} fill-up
                                  {result.counts.fillups !== 1 ? "s" : ""}{" "}
                                  synced
                                </div>
                              )}
                              {result.counts.maintenance > 0 && (
                                <div>
                                  • {result.counts.maintenance} maintenance
                                  record
                                  {result.counts.maintenance !== 1
                                    ? "s"
                                    : ""}{" "}
                                  uploaded
                                </div>
                              )}
                              {result.counts.tripEstimates > 0 && (
                                <div>
                                  • {result.counts.tripEstimates} trip estimate
                                  {result.counts.tripEstimates !== 1
                                    ? "s"
                                    : ""}{" "}
                                  uploaded
                                </div>
                              )}
                              {result.counts.vehicles > 1 && (
                                <div className="mt-2 text-blue-600 dark:text-blue-400 font-medium">
                                  💡 Please select a vehicle to display your
                                  data.
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    {result.success && isNoOpSync(result) && (
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        No action is needed.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Decision State - Content */}
            {!loading && !result && (
              <>
                {/* Scenario: Local data exists, cloud is empty */}
                {!hasCloudData && (
                  <div className="space-y-4">
                    <div
                      className={`flex items-start gap-3 p-4 rounded-2xl border ${isImportedData ? "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20" : "bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20"}`}
                    >
                      <CloudArrowUp
                        weight="duotone"
                        className={`${isImportedData ? "text-amber-500" : "text-blue-500"} w-6 h-6 mt-0.5 flex-shrink-0`}
                      />
                      <div>
                        <h3
                          className={`font-semibold mb-1 ${isImportedData ? "text-amber-900 dark:text-amber-400" : "text-blue-900 dark:text-blue-400"}`}
                        >
                          {isImportedData
                            ? "Imported Data Detected"
                            : hasLocalData
                              ? "Local Data Found"
                              : "No Local Data"}
                        </h3>
                        <p
                          className={`text-sm ${isImportedData ? "text-amber-700 dark:text-amber-300" : "text-blue-700 dark:text-blue-300"}`}
                        >
                          {isImportedData
                            ? "You have local data that has not been synced to the cloud yet. Please upload it to ensure your data is backed up."
                            : hasLocalData
                              ? "You have data on this device. Would you like to upload it to your cloud account?"
                              : "You have no local data. Would you like to download your cloud data or start fresh?"}
                        </p>
                      </div>
                    </div>

                    {/* Warning for imported data - modal cannot be dismissed */}
                    {isImportedData && (
                      <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-500/10 rounded-2xl border border-red-200 dark:border-red-500/20">
                        <Warning
                          weight="duotone"
                          className="text-red-500 w-6 h-6 mt-0.5 flex-shrink-0"
                        />
                        <div>
                          <h3 className="font-semibold mb-1 text-red-900 dark:text-red-400">
                            Action Required
                          </h3>
                          <p className="text-sm text-red-700 dark:text-red-300">
                            Your imported data needs to be synced to the cloud.
                            Please choose an option below to proceed. You cannot
                            close this modal without making a decision.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Local Data Summary */}
                    {hasLocalData && (
                      <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                          Your Local Data
                        </h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                            <span className="text-sm text-slate-600 dark:text-slate-400">
                              {localCounts?.vehicles || 0} Vehicles
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                            <span className="text-sm text-slate-600 dark:text-slate-400">
                              {localCounts?.fillups || 0} Fill-ups
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                            <span className="text-sm text-slate-600 dark:text-slate-400">
                              {localCounts?.maintenance || 0} Maintenance
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                            <span className="text-sm text-slate-600 dark:text-slate-400">
                              {localCounts?.tripEstimates || 0} Trips
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Scenario: Cloud data exists, local is empty */}
                {hasCloudData && !hasLocalData && (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-500/10 rounded-2xl border border-blue-200 dark:border-blue-500/20">
                      <CloudArrowDown
                        weight="duotone"
                        className="text-blue-500 w-6 h-6 mt-0.5 flex-shrink-0"
                      />
                      <div>
                        <h3 className="font-semibold text-blue-900 dark:text-blue-400 mb-1">
                          Cloud Data Found
                        </h3>
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          We found data in your cloud account, but this device
                          has no local data yet. Would you like to download your
                          cloud data to this device or start fresh?
                        </p>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                        Cloud Data
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-blue-500 rounded-full" />
                          <span className="text-sm text-slate-600 dark:text-slate-400">
                            {cloudCounts?.vehicles || 0} Vehicles
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-blue-500 rounded-full" />
                          <span className="text-sm text-slate-600 dark:text-slate-400">
                            {cloudCounts?.fillups || 0} Fill-ups
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-blue-500 rounded-full" />
                          <span className="text-sm text-slate-600 dark:text-slate-400">
                            {cloudCounts?.maintenance || 0} Maintenance
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-blue-500 rounded-full" />
                          <span className="text-sm text-slate-600 dark:text-slate-400">
                            {cloudCounts?.tripEstimates || 0} Trips
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Scenario: Both local and cloud have data */}
                {hasCloudData && hasLocalData && (
                  <div className="space-y-4">
                    {detailedDiff?.conflicts?.length > 0 ? (
                      <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-500/10 rounded-2xl border border-amber-200 dark:border-amber-500/20">
                        <Warning
                          weight="duotone"
                          className="text-amber-500 w-6 h-6 mt-0.5 flex-shrink-0"
                        />
                        <div>
                          <h3 className="font-semibold text-amber-900 dark:text-amber-400 mb-1">
                            Conflicts Detected
                          </h3>
                          <p className="text-sm text-amber-700 dark:text-amber-300">
                            We found {detailedDiff.conflicts.length} conflicting
                            record
                            {detailedDiff.conflicts.length !== 1
                              ? "s"
                              : ""}{" "}
                            that need your attention. Please review and resolve
                            them.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-500/10 rounded-2xl border border-blue-200 dark:border-blue-500/20">
                        <Info
                          weight="duotone"
                          className="text-blue-500 w-6 h-6 mt-0.5 flex-shrink-0"
                        />
                        <div>
                          <h3 className="font-semibold text-blue-900 dark:text-blue-400 mb-1">
                            Data Difference
                          </h3>
                          <p className="text-sm text-blue-700 dark:text-blue-300">
                            Your local and cloud data have differences. Choose
                            how you want to sync them.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Detailed Diff List */}
                    {detailedDiff && (
                      <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl space-y-3">
                        <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          Pending Changes
                        </h4>
                        <div className="space-y-2">
                          {detailedDiff.summary?.localOnly > 0 && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-600 dark:text-slate-400">
                                Local-only (to upload)
                              </span>
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                {detailedDiff.summary.localOnly}
                              </span>
                            </div>
                          )}
                          {detailedDiff.summary?.cloudOnly > 0 && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-600 dark:text-slate-400">
                                Cloud-only (to download)
                              </span>
                              <span className="font-semibold text-blue-600 dark:text-blue-400">
                                {detailedDiff.summary.cloudOnly}
                              </span>
                            </div>
                          )}
                          {detailedDiff.summary?.bothChanged > 0 && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-600 dark:text-slate-400">
                                Conflicts (changed on both)
                              </span>
                              <span className="font-semibold text-amber-600 dark:text-amber-400">
                                {detailedDiff.summary.bothChanged}
                              </span>
                            </div>
                          )}
                          {detailedDiff.summary?.localDeleted > 0 && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-600 dark:text-slate-400">
                                Deletions to cloud
                              </span>
                              <span className="font-semibold text-red-600 dark:text-red-400">
                                {detailedDiff.summary.localDeleted}
                              </span>
                            </div>
                          )}
                          {detailedDiff.summary?.cloudDeleted > 0 && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-600 dark:text-slate-400">
                                Deletions from cloud
                              </span>
                              <span className="font-semibold text-red-600 dark:text-red-400">
                                {detailedDiff.summary.cloudDeleted}
                              </span>
                            </div>
                          )}
                        </div>
                        {detailedChangeRows.length > 0 && (
                          <div className="pt-3 mt-3 border-t border-slate-200 dark:border-white/10">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                              What changed
                            </p>
                            <div className="space-y-1.5">
                              {detailedChangeRows.map((row) => (
                                <div
                                  key={`${row.entity}-${row.label}`}
                                  className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300"
                                >
                                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                                  <span>
                                    {row.count} {row.entity} {row.label}
                                  </span>
                                </div>
                              ))}
                            </div>
                            {detailedChangeRows.length >= 6 && (
                              <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
                                Showing the most important change groups.
                              </p>
                            )}
                          </div>
                        )}

                        {detailedDiff.conflicts?.length > 0 && (
                          <button
                            onClick={() => {
                              setConflictData({
                                conflicts: detailedDiff.conflicts,
                                nonConflicts: detailedDiff.nonConflicts,
                              });
                              setShowConflictReview(true);
                            }}
                            className="w-full mt-2 py-2 px-4 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-sm font-semibold rounded-xl border border-amber-200/50 dark:border-amber-500/20 transition flex items-center justify-center gap-2"
                          >
                            <ArrowsMerge weight="bold" className="w-4 h-4" />
                            Review {detailedDiff.conflicts.length} conflict
                            {detailedDiff.conflicts.length !== 1 ? "s" : ""}
                          </button>
                        )}
                      </div>
                    )}

                    {!detailedDiff && (
                      <div className="grid grid-cols-2 gap-4">
                        {/* Local Data */}
                        <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                            Local Data
                          </h4>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                              <span className="text-sm text-slate-600 dark:text-slate-400">
                                {localCounts?.vehicles || 0} Vehicles
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                              <span className="text-sm text-slate-600 dark:text-slate-400">
                                {localCounts?.fillups || 0} Fill-ups
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Cloud Data */}
                        <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                            Cloud Data
                          </h4>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-blue-500 rounded-full" />
                              <span className="text-sm text-slate-600 dark:text-slate-400">
                                {cloudCounts?.vehicles || 0} Vehicles
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-blue-500 rounded-full" />
                              <span className="text-sm text-slate-600 dark:text-slate-400">
                                {cloudCounts?.fillups || 0} Fill-ups
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer - Fixed for result state */}
          {!loading && result && (
            <div className="p-4 sm:p-6 border-t border-slate-200 dark:border-slate-800 flex-shrink-0 space-y-3">
              <button
                onClick={onCloseResult}
                className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold rounded-2xl transition"
              >
                {result.success ? "Continue" : "OK"}
              </button>
              {!result.success && onRetry && (
                <button
                  onClick={onRetry}
                  className="w-full py-3.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-2xl transition"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {/* Footer - Fixed for decision state */}
          {!loading && !result && (
            <div className="p-4 sm:p-6 border-t border-slate-200 dark:border-slate-800 flex-shrink-0">
              {/* Scenario: Local data exists, cloud is empty */}
              {!hasCloudData && (
                <div className="space-y-3">
                  {hasLocalData && (
                    <button
                      onClick={handleUpload}
                      className={`w-full py-3.5 ${isImportedData ? "bg-amber-500 hover:bg-amber-400" : "bg-emerald-500 hover:bg-emerald-400"} text-white font-semibold rounded-2xl transition flex items-center justify-center gap-2`}
                    >
                      <CloudArrowUp weight="duotone" className="w-5 h-5" />
                      {isImportedData
                        ? "Upload to Cloud (Recommended)"
                        : "Upload Local Data to Cloud"}
                    </button>
                  )}
                  {!hasLocalData && hasCloudData && (
                    <button
                      onClick={handleDownload}
                      disabled={loading}
                      className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold rounded-2xl transition flex items-center justify-center gap-2"
                    >
                      <CloudArrowDown weight="duotone" className="w-5 h-5" />
                      Download Cloud Data
                    </button>
                  )}
                  <button
                    onClick={handleKeepLocal}
                    disabled={loading}
                    className="w-full py-3.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-2xl transition"
                  >
                    {hasLocalData
                      ? isImportedData
                        ? "Keep Local Only (Cloud Sync Disabled)"
                        : "Keep Local Only for Now"
                      : "Start Fresh (No Sync)"}
                  </button>
                  {isImportedData && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-2">
                      Choosing "Keep Local Only" will disable cloud sync. You
                      can upload later from Settings.
                    </p>
                  )}
                </div>
              )}

              {/* Fallback: If cloud data exists but wasn't detected, show download option */}
              {hasCloudData && !hasLocalData && (
                <div className="space-y-3">
                  <button
                    onClick={handleDownload}
                    disabled={loading}
                    className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold rounded-2xl transition flex items-center justify-center gap-2"
                  >
                    <CloudArrowDown weight="duotone" className="w-5 h-5" />
                    Download Cloud Data
                  </button>
                  <button
                    onClick={handleKeepLocal}
                    disabled={loading}
                    className="w-full py-3.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-2xl transition"
                  >
                    Start Fresh (No Sync)
                  </button>
                </div>
              )}

              {/* Scenario: Both local and cloud have data */}
              {hasCloudData && hasLocalData && (
                <div className="space-y-3">
                  <button
                    onClick={handleMerge}
                    disabled={loading}
                    className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold rounded-2xl transition flex items-center justify-center gap-2"
                  >
                    <ArrowsMerge weight="duotone" className="w-5 h-5" />
                    Sync both sides
                  </button>
                  <button
                    onClick={handleUpload}
                    disabled={loading}
                    className="w-full py-3.5 bg-blue-500 hover:bg-blue-400 text-white font-semibold rounded-2xl transition flex items-center justify-center gap-2"
                  >
                    <CloudArrowUp weight="duotone" className="w-5 h-5" />
                    Upload local changes
                  </button>
                  <button
                    onClick={handleDownload}
                    disabled={loading}
                    className="w-full py-3.5 bg-white dark:bg-slate-900 border-2 border-red-200 dark:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600 dark:text-red-400 font-semibold rounded-2xl transition flex items-center justify-center gap-2"
                  >
                    <CloudArrowDown weight="duotone" className="w-5 h-5" />
                    Replace local with cloud
                  </button>

                  {/* Warning */}
                  <p className="text-xs text-red-600 dark:text-red-400 text-center mt-2">
                    Replacing local with cloud will remove unsynced local
                    changes.
                  </p>
                </div>
              )}

              {/* Fallback UI for unknown/invalid states */}
              {(!hasLocalData && !hasCloudData) || scenario === "UNKNOWN" ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-500/10 rounded-2xl border border-amber-200 dark:border-amber-500/20">
                    <Warning
                      weight="duotone"
                      className="text-amber-500 w-6 h-6 mt-0.5 flex-shrink-0"
                    />
                    <div>
                      <h3 className="font-semibold text-amber-900 dark:text-amber-400 mb-1">
                        Sync State Unknown
                      </h3>
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        We couldn't determine your sync state. Please retry the
                        sync check.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <button
                      onClick={onRetry}
                      className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold rounded-2xl transition flex items-center justify-center gap-2"
                    >
                      {/* 🟢 FIXED: Added missing animate-spin class to the icon */}
                      <Spinner
                        weight="duotone"
                        className="w-5 h-5 animate-spin"
                      />
                      Retry sync check
                    </button>

                    {hasCloudData &&
                      cloudCounts &&
                      (cloudCounts.vehicles > 0 || cloudCounts.fillups > 0) && (
                        <button
                          onClick={handleDownload}
                          className="w-full py-3.5 bg-blue-500 hover:bg-blue-400 text-white font-semibold rounded-2xl transition flex items-center justify-center gap-2"
                        >
                          <CloudArrowDown
                            weight="duotone"
                            className="w-5 h-5"
                          />
                          Download cloud data
                        </button>
                      )}

                    <button
                      onClick={onCancel}
                      className="w-full py-3.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-2xl transition"
                    >
                      Close / cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </motion.div>
      </div>
    </>
  );
}
