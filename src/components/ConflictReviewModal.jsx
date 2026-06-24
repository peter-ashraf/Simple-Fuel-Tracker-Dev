import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowsMerge,
  X,
  Warning,
  CaretLeft,
  CaretRight,
  Check,
  SkipForward,
  Trash,
  CloudArrowUp,
  CloudArrowDown,
} from "@phosphor-icons/react";
import { useState } from "react";
import { cloudSyncService } from "../services/cloudSyncService";

const MotionDiv = motion.div;

export default function ConflictReviewModal({
  conflicts,
  nonConflicts,
  onResolve,
  onCancel,
  userId,
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [resolutions, setResolutions] = useState({});
  const [loading, setLoading] = useState(false);

  const currentConflict = conflicts[currentIndex];
  const resolvedCount = Object.keys(resolutions).length;
  const remainingCount = conflicts.length - resolvedCount;

  const handleResolution = (resolution) => {
    setResolutions((prev) => ({
      ...prev,
      [currentConflict.local.id]: resolution,
    }));

    // Auto-advance to next conflict
    if (currentIndex < conflicts.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handleBatchResolution = (resolution) => {
    const newResolutions = {};
    conflicts.forEach((conflict) => {
      if (!resolutions[conflict.local.id]) {
        newResolutions[conflict.local.id] = resolution;
      }
    });
    setResolutions((prev) => ({ ...prev, ...newResolutions }));
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < conflicts.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handleApply = async () => {
    setLoading(true);
    try {
      const result = await cloudSyncService.applyResolutions(
        resolutions,
        conflicts,
        nonConflicts,
        userId,
      );
      onResolve(result);
    } catch (error) {
      console.error("Error applying resolutions:", error);
      setLoading(false);
    }
  };

  const getFieldDifferences = (local, cloud, type) => {
    const differences = {};
    const fieldMap = {
      vehicle: [
        { local: "name", cloud: "name", label: "Name" },
        { local: "make", cloud: "make", label: "Make" },
        { local: "model", cloud: "model", label: "Model" },
        { local: "year", cloud: "year", label: "Year" },
        { local: "fuelType", cloud: "fuel_type", label: "Fuel Type" },
        {
          local: "tankCapacity",
          cloud: "tank_capacity",
          label: "Tank Capacity",
        },
        {
          local: "licensePlate",
          cloud: "license_plate",
          label: "License Plate",
        },
      ],
      fillup: [
        { local: "odometer", cloud: "odometer", label: "Odometer" },
        { local: "liters", cloud: "liters", label: "Liters" },
        {
          local: "pricePerLiter",
          cloud: "price_per_liter",
          label: "Price/Liter",
        },
        { local: "totalCost", cloud: "total_cost", label: "Total Cost" },
        { local: "station", cloud: "station", label: "Station" },
        { local: "notes", cloud: "notes", label: "Notes" },
        { local: "fullTank", cloud: "full_tank", label: "Full Tank" },
      ],
      maintenance: [
        { local: "date", cloud: "date", label: "Date" },
        { local: "type", cloud: "type", label: "Type" },
        { local: "description", cloud: "description", label: "Description" },
        { local: "cost", cloud: "cost", label: "Cost" },
        { local: "odometer", cloud: "odometer", label: "Odometer" },
        {
          local: "nextDueDate",
          cloud: "next_due_date",
          label: "Next Due Date",
        },
        {
          local: "nextDueOdometer",
          cloud: "next_due_odometer",
          label: "Next Due Odometer",
        },
      ],
      trip: [
        { local: "name", cloud: "name", label: "Name" },
        { local: "distance", cloud: "distance", label: "Distance" },
        { local: "notes", cloud: "notes", label: "Notes" },
      ],
    };

    const fields = fieldMap[type] || fieldMap.fillup;

    fields.forEach((field) => {
      const localValue = local[field.local];
      const cloudValue = cloud[field.cloud];
      if (localValue !== cloudValue) {
        differences[field.label] = {
          local: localValue,
          cloud: cloudValue,
          localField: field.local,
          cloudField: field.cloud,
        };
      }
    });

    return differences;
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "Unknown";
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24)
      return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
    return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  };

  const entityLabels = {
    vehicle: "Vehicle",
    fillup: "Fill-up",
    maintenance: "Maintenance record",
    trip: "Trip estimate",
  };

  const fieldDifferences = getFieldDifferences(
    currentConflict.local,
    currentConflict.cloud,
    currentConflict.type,
  );
  const localTime = new Date(
    currentConflict.localUpdated ||
      currentConflict.local.updatedAt ||
      currentConflict.local.timestamp,
  ).getTime();
  const cloudTime = new Date(
    currentConflict.cloudUpdated ||
      currentConflict.cloud.updated_at ||
      currentConflict.cloud.created_at,
  ).getTime();
  const localIsNewer = localTime > cloudTime;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <MotionDiv
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500/10 dark:bg-amber-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <Warning
                weight="duotone"
                className="text-amber-500 dark:text-amber-400 w-5 h-5"
              />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                Resolve Conflicts
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Conflict {currentIndex + 1} of {conflicts.length} •{" "}
                {resolvedCount} resolved, {remainingCount} remaining
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition flex-shrink-0"
          >
            <X weight="duotone" className="text-slate-400 w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Conflict Info */}
          <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-500/10 rounded-2xl border border-amber-200 dark:border-amber-500/20">
            <Warning
              weight="duotone"
              className="text-amber-500 w-6 h-6 mt-0.5 flex-shrink-0"
            />
            <div className="flex-1">
              <h3 className="font-semibold text-amber-900 dark:text-amber-400 mb-1">
                {entityLabels[currentConflict.type] || "Record"} conflict
                detected
              </h3>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                This{" "}
                {entityLabels[currentConflict.type]?.toLowerCase() || "record"}{" "}
                has been edited on both this device and in the cloud. Choose
                which version to keep.
              </p>
            </div>
          </div>

          {/* Timestamp Comparison */}
          <div className="grid grid-cols-2 gap-4">
            <div
              className={`p-4 rounded-2xl border-2 ${localIsNewer ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10" : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className={`w-3 h-3 rounded-full ${localIsNewer ? "bg-emerald-500" : "bg-slate-400"}`}
                />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Local
                </span>
                {localIsNewer && (
                  <span className="text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-full">
                    Newer
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Updated{" "}
                {formatTimestamp(
                  currentConflict.localUpdated ||
                    currentConflict.local.timestamp,
                )}
              </p>
            </div>
            <div
              className={`p-4 rounded-2xl border-2 ${!localIsNewer ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10" : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className={`w-3 h-3 rounded-full ${!localIsNewer ? "bg-blue-500" : "bg-slate-400"}`}
                />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Cloud
                </span>
                {!localIsNewer && (
                  <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full">
                    Newer
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Updated{" "}
                {formatTimestamp(
                  currentConflict.cloudUpdated ||
                    currentConflict.cloud.created_at,
                )}
              </p>
            </div>
          </div>

          {/* Field Differences */}
          {Object.keys(fieldDifferences).length > 0 && (
            <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                Field Differences
              </h4>
              <div className="space-y-2">
                {Object.entries(fieldDifferences).map(([label, diff]) => {
                  const localWins = localIsNewer;
                  return (
                    <div key={label} className="grid grid-cols-3 gap-2 text-sm">
                      <span className="text-slate-500 dark:text-slate-400">
                        {label}
                      </span>
                      <span
                        className={`text-right ${localWins ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-slate-600 dark:text-slate-400"}`}
                      >
                        {diff.local !== null && diff.local !== undefined
                          ? String(diff.local)
                          : "—"}
                      </span>
                      <span
                        className={`text-right ${!localWins ? "text-blue-600 dark:text-blue-400 font-medium" : "text-slate-600 dark:text-slate-400"}`}
                      >
                        {diff.cloud !== null && diff.cloud !== undefined
                          ? String(diff.cloud)
                          : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Resolution Actions */}
          <div className="space-y-3">
            <button
              onClick={() => handleResolution("merge-auto")}
              className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold rounded-2xl transition flex items-center justify-center gap-2"
            >
              <ArrowsMerge weight="duotone" className="w-5 h-5" />
              Merge both versions
              <span className="text-xs opacity-75">(recommended)</span>
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleResolution("keep-local")}
                className="py-3.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-2xl transition flex items-center justify-center gap-2"
              >
                <CloudArrowUp weight="duotone" className="w-5 h-5" />
                Use local version
              </button>
              <button
                onClick={() => handleResolution("keep-cloud")}
                className="py-3.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-2xl transition flex items-center justify-center gap-2"
              >
                <CloudArrowDown weight="duotone" className="w-5 h-5" />
                Use cloud version
              </button>
            </div>

            <button
              onClick={() => handleResolution("skip")}
              className="w-full py-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold rounded-2xl transition flex items-center justify-center gap-2"
            >
              <SkipForward weight="duotone" className="w-5 h-5" />
              Decide later
            </button>
          </div>

          {/* Batch Resolution */}
          {conflicts.length > 1 && (
            <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                Apply to all remaining conflicts
              </h4>
              <div className="flex gap-2">
                <button
                  onClick={() => handleBatchResolution("merge-auto")}
                  className="flex-1 py-2 px-3 bg-emerald-100 dark:bg-emerald-500/20 hover:bg-emerald-200 dark:hover:bg-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-sm font-medium rounded-xl transition"
                >
                  Merge all
                </button>
                <button
                  onClick={() => handleBatchResolution("keep-local")}
                  className="flex-1 py-2 px-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-xl transition"
                >
                  Keep local
                </button>
                <button
                  onClick={() => handleBatchResolution("keep-cloud")}
                  className="flex-1 py-2 px-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-xl transition"
                >
                  Keep cloud
                </button>
                <button
                  onClick={() => handleBatchResolution("skip")}
                  className="flex-1 py-2 px-3 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 text-sm font-medium rounded-xl transition"
                >
                  Skip all
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-slate-200 dark:border-slate-800 flex-shrink-0">
          <div className="flex items-center justify-between">
            <button
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <CaretLeft weight="duotone" className="w-5 h-5" />
              Previous
            </button>

            <div className="flex items-center gap-3">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={resolvedCount === 0 || loading}
                className="px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>
                    <Check weight="duotone" className="w-5 h-5" />
                    Apply ({resolvedCount}/{conflicts.length})
                  </>
                )}
              </button>
            </div>

            <button
              onClick={handleNext}
              disabled={currentIndex === conflicts.length - 1}
              className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Next
              <CaretRight weight="duotone" className="w-5 h-5" />
            </button>
          </div>
        </div>
      </MotionDiv>
    </div>
  );
}
