import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Calculator,
  TrendUp,
  WarningCircle,
  Info,
  CaretDown,
  Check,
  CaretLeft,
  Trash,
  Clock,
  MapPin,
  ClockCounterClockwise,
} from "@phosphor-icons/react";
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from "framer-motion";
import { Card, Input, Label, PageWrapper, cn, Modal } from "../ui";
import { useFuel } from "../../hooks/useFuelContext";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import {
  calculateTripEstimate,
  convertDistance,
} from "../../utils/tripEstimator";
import {
  formatEfficiency2Dec,
} from "../../utils/formatting";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

const getConfidenceColor = (confidence) => {
  switch (confidence) {
    case "high":
      return "text-emerald-500";
    case "medium":
      return "text-amber-500";
    case "low":
      return "text-orange-500";
    default:
      return "text-slate-400";
  }
};

const EstimateDetails = ({ data, isModal = false, t, cn }) => (
  <div className={cn("space-y-6", isModal && "p-6")}>
    {!isModal && (
      <div className="flex items-center gap-2">
        <TrendUp weight="duotone" className="w-5 h-5 text-blue-500" />
        <h2 className="text-lg font-bold">{t("estimated_cost")}</h2>
      </div>
    )}

    <div className="grid grid-cols-2 gap-4">
      <div className="text-center p-4 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl border border-emerald-200 dark:border-emerald-500/20">
        <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
          {(data.estimatedCost || 0).toFixed(0)}
        </div>
        <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 mt-1 uppercase">
          {t("currency")} {t("total_spent")}
        </div>
      </div>
      <div className="text-center p-4 bg-blue-50 dark:bg-blue-500/10 rounded-2xl border border-blue-200 dark:border-blue-500/20">
        <div className="text-3xl font-black text-blue-600 dark:text-blue-400">
          {(data.estimatedLiters || 0).toFixed(1)}
        </div>
        <div className="text-[10px] font-bold text-blue-700 dark:text-blue-300 mt-1 uppercase">
          {t("liters")}
        </div>
      </div>
    </div>

    <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-white/10">
      <div className="flex justify-between text-sm">
        <span className="text-slate-500">{t("avg_consumption")}:</span>{" "}
        <span className="font-bold">
          {formatEfficiency2Dec(data.consumptionUsed)}
        </span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-slate-500">{t("price")}:</span>{" "}
        <span className="font-bold">
          {(data.priceUsed || 0).toFixed(2)} {t("unit_egp_l")}
        </span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-slate-500">{t("overview")}:</span>{" "}
        <span className="font-bold">{t(data.methodUsed)}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-slate-500">{t("confidence")}:</span>
        <div className="text-end">
          <span
            className={cn(
              "font-bold block",
              getConfidenceColor(data.confidence),
            )}
          >
            {t(data.confidence)}
          </span>
          {data.sampleSize > 0 && (
            <span className="text-[10px] text-slate-400 font-medium">
              {t("based_on_x_fillups", { count: data.sampleSize })}
            </span>
          )}
        </div>
      </div>
    </div>

    {/* Confidence Messages */}
    <AnimatePresence>
      {data.confidence !== "high" && (
        <motion.div
          key="confidence-warning"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2"
        >
          <WarningCircle weight="duotone" className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="text-[11px] text-amber-700 dark:text-amber-400">
            <p className="font-bold mb-0.5">{t("limited_data")}</p>
            <p>{t("add_more_data_hint")}</p>
          </div>
        </motion.div>
      )}
      {data.confidence === "low" && data.sampleSize > 0 && (
        <motion.div
          key="confidence-hint"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-start gap-2"
        >
          <Info weight="duotone" className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
          <div className="text-[11px] text-blue-700 dark:text-blue-400">
            <p>{t("estimate_hint", { count: data.sampleSize })}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Raw Data Preview */}
    {data.rawData && data.rawData.length > 0 && (
      <div className="pt-4 border-t border-slate-200 dark:border-white/10">
        <div className="flex items-center gap-2 mb-3">
          <ClockCounterClockwise weight="duotone" className="w-3.5 h-3.5 text-slate-400" />
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            {t("recent_data_used")}
          </h3>
        </div>
        <div className="space-y-2">
          {data.rawData.slice(0, isModal ? 5 : 3).map((d, i) => (
            <div
              key={i}
              className="flex justify-between items-center text-[11px]"
            >
              <span className="text-slate-500">{d.date}</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {d.kmPerLiter} km/L @ {d.pricePerLiter} EGP
              </span>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);

export default function TripCostEstimator() {
  const {
    activeVehicleFillUpsByOdometer,
    addTripEstimate,
    tripEstimates,
    deleteTripEstimate,
  } = useFuel();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language.startsWith("ar");

  const [tripDistance, setTripDistance] = useState("");
  const [distanceUnit, setDistanceUnit] = useState("km");
  const [manualConsumption, setManualConsumption] = useState("");
  const [manualFuelPrice, setManualFuelPrice] = useState("");
  const [useManualConsumption, setUseManualConsumption] = useState(false);
  const [useManualPrice, setUseManualPrice] = useState(false);
  const [isRoundTrip, setIsRoundTrip] = useState(false);
  const [isUnitDropdownOpen, setIsUnitDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const [sampleSize, setSampleSize] = useLocalStorage("fueltracker-trip-sample-size", 5);
  const [isSampleSizeDropdownOpen, setIsSampleSizeDropdownOpen] = useState(false);
  const sampleSizeDropdownRef = useRef(null);

  const [selectedEstimate, setSelectedEstimate] = useState(null);

  const estimate = useMemo(() => {
    if (!tripDistance || parseFloat(tripDistance) <= 0) return null;
    const distanceInKm = convertDistance(
      parseFloat(tripDistance),
      distanceUnit,
      "km",
    );
    const finalDistance = isRoundTrip ? distanceInKm * 2 : distanceInKm;
    const options = {
      manualConsumption:
        useManualConsumption && manualConsumption
          ? parseFloat(manualConsumption)
          : null,
      manualFuelPrice:
        useManualPrice && manualFuelPrice ? parseFloat(manualFuelPrice) : null,
      sampleSize: sampleSize === 'total' ? null : sampleSize,
      excludeOutliers: true,
    };
    const result = calculateTripEstimate(
      activeVehicleFillUpsByOdometer,
      finalDistance,
      options,
    );
    return { ...result, distance: finalDistance };
  }, [
    activeVehicleFillUpsByOdometer,
    distanceUnit,
    isRoundTrip,
    manualConsumption,
    manualFuelPrice,
    tripDistance,
    useManualConsumption,
    useManualPrice,
    sampleSize,
  ]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsUnitDropdownOpen(false);
      }
      if (sampleSizeDropdownRef.current && !sampleSizeDropdownRef.current.contains(event.target)) {
        setIsSampleSizeDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <>
      {createPortal(
        <div className="fixed-button-container-no-nav">
          <div className="max-w-lg mx-auto flex gap-3">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="flex-1 px-6 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold h-[64px] rounded-[1.5rem] flex items-center justify-center gap-2 transition-all"
            >
              <CaretLeft weight="duotone" className={cn("w-5 h-5", isRtl && "rotate-180")} />{" "}
              <span>{t("back")}</span>
            </button>
            <button
              type="button"
              onClick={() => estimate && addTripEstimate(estimate)}
              disabled={!estimate}
              className="flex-1 px-6 bg-emerald-500 text-white dark:text-slate-950 font-bold h-[64px] rounded-[1.5rem] flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-xl shadow-emerald-500/25 active:scale-[0.98]"
            >
              <Check weight="duotone" className="w-5 h-5" /> <span>{t("save")}</span>
            </button>
          </div>
        </div>,
        document.body,
      )}

      <PageWrapper className="space-y-6 pb-32">
        <div className="mb-2">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {t("trip_estimator")}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t("estimate_trip_subtitle")}
          </p>
        </div>

        <Card className="space-y-6">
          <div className="flex items-center gap-2 mb-4">
            <Calculator weight="duotone" className="w-5 h-5 text-emerald-500" />
            <h2 className="text-lg font-bold">{t("overview")}</h2>
          </div>

          <div className="space-y-2">
            <Label>{t("distance")}</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                step="0.1"
                value={tripDistance}
                onChange={(e) => setTripDistance(e.target.value)}
                placeholder="100"
                className="flex-1"
              />
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsUnitDropdownOpen(!isUnitDropdownOpen)}
                  className="px-4 h-full bg-slate-100 dark:bg-slate-800 rounded-xl font-bold text-xs uppercase flex items-center gap-1 min-w-[70px] justify-center"
                >
                  {distanceUnit}{" "}
                  <CaretDown weight="duotone"
                    className={cn(
                      "w-3 h-3 transition-transform",
                      isUnitDropdownOpen && "rotate-180",
                    )}
                  />
                </button>
                <AnimatePresence>
                  {isUnitDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className={cn(
                        "absolute top-full mt-2 w-24 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl shadow-xl z-20",
                        isRtl ? "left-0" : "right-0",
                      )}
                    >
                      <div className="p-1">
                        {["km", "miles"].map((unit) => (
                          <button
                            key={unit}
                            onClick={() => {
                              setDistanceUnit(unit);
                              setIsUnitDropdownOpen(false);
                            }}
                            className={cn(
                              "w-full text-center px-3 py-2 text-xs font-bold rounded-lg transition-colors",
                              distanceUnit === unit
                                ? "bg-emerald-500 text-white"
                                : "hover:bg-slate-50 dark:hover:bg-white/5 text-slate-600 dark:text-slate-400",
                            )}
                          >
                            {unit.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Sample Size</Label>
            <div className="relative" ref={sampleSizeDropdownRef}>
              <button
                type="button"
                onClick={() => setIsSampleSizeDropdownOpen(!isSampleSizeDropdownOpen)}
                className="w-full px-4 py-3 bg-slate-100 dark:bg-slate-800 rounded-xl font-bold text-xs flex items-center justify-between"
              >
                <span>{sampleSize === 'total' ? 'All Entries' : `Last ${sampleSize} Entries`}</span>
                <CaretDown weight="duotone"
                  className={cn(
                    "w-3 h-3 transition-transform",
                    isSampleSizeDropdownOpen && "rotate-180",
                  )}
                />
              </button>
              <AnimatePresence>
                {isSampleSizeDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute top-full mt-2 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl shadow-xl z-20"
                  >
                    <div className="p-1">
                      {[5, 10, 'total'].map((size) => (
                        <button
                          key={size}
                          onClick={() => {
                            setSampleSize(size);
                            setIsSampleSizeDropdownOpen(false);
                          }}
                          className={cn(
                            "w-full text-center px-3 py-2 text-xs font-bold rounded-lg transition-colors",
                            sampleSize === size
                              ? "bg-emerald-500 text-white"
                              : "hover:bg-slate-50 dark:hover:bg-white/5 text-slate-600 dark:text-slate-400",
                          )}
                        >
                          {size === 'total' ? 'All Entries' : `Last ${size} Entries`}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label className="mb-0">{t("round_trip")}</Label>
            <button
              onClick={() => setIsRoundTrip(!isRoundTrip)}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                isRoundTrip
                  ? "bg-emerald-500"
                  : "bg-slate-200 dark:bg-slate-700",
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                  isRoundTrip
                    ? isRtl
                      ? "-translate-x-5"
                      : "translate-x-5"
                    : isRtl
                      ? "-translate-x-1"
                      : "translate-x-1",
                )}
              />
            </button>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="mb-0">
                {t("manual_inputs")} ({t("avg_consumption")})
              </Label>
              <button
                onClick={() => setUseManualConsumption(!useManualConsumption)}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                  useManualConsumption
                    ? "bg-emerald-500"
                    : "bg-slate-200 dark:bg-slate-700",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                    useManualConsumption
                      ? isRtl
                        ? "-translate-x-5"
                        : "translate-x-5"
                      : isRtl
                        ? "-translate-x-1"
                        : "translate-x-1",
                  )}
                />
              </button>
            </div>
            {useManualConsumption && (
              <Input
                type="number"
                step="0.01"
                value={manualConsumption}
                onChange={(e) => setManualConsumption(e.target.value)}
                placeholder="km/L"
              />
            )}

            <div className="flex items-center justify-between">
              <Label className="mb-0">
                {t("manual_inputs")} ({t("price")})
              </Label>
              <button
                onClick={() => setUseManualPrice(!useManualPrice)}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                  useManualPrice
                    ? "bg-emerald-500"
                    : "bg-slate-200 dark:bg-slate-700",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                    useManualPrice
                      ? isRtl
                        ? "-translate-x-5"
                        : "translate-x-5"
                      : isRtl
                        ? "-translate-x-1"
                        : "translate-x-1",
                  )}
                />
              </button>
            </div>
            {useManualPrice && (
              <Input
                type="number"
                step="0.01"
                value={manualFuelPrice}
                onChange={(e) => setManualFuelPrice(e.target.value)}
                placeholder="EGP/L"
              />
            )}
          </div>
        </Card>

        {estimate && (
          <Card>
            <EstimateDetails data={estimate} t={t} cn={cn} />
          </Card>
        )}

        <section className="pt-2">
          <div className="flex items-center gap-2 mb-4">
            <ClockCounterClockwise weight="duotone" className="w-5 h-5 text-slate-500" />
            <h2 className="text-lg font-bold">{t("history")}</h2>
          </div>

          {tripEstimates.length === 0 ? (
            <div className="text-center py-8 px-6 border-2 border-dashed border-slate-200 dark:border-slate-800/80 rounded-3xl">
              <Clock weight="duotone" className="w-10 h-10 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium tracking-tight">
                {t("untracked")}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {tripEstimates.slice(0, 10).map((est, i) => {
                const displayDistance =
                  est.distance ||
                  est.estimatedLiters * est.consumptionUsed ||
                  0;
                return (
                  <Card
                    key={est.id || `est-${i}`}
                    className="p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
                    onClick={() => setSelectedEstimate(est)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <div className="bg-blue-500/10 p-2 rounded-lg">
                          <MapPin weight="duotone" className="w-4 h-4 text-blue-500" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold">
                            {displayDistance.toFixed(0)} km
                          </h4>
                          <p className="text-[10px] text-slate-500 flex items-center gap-1">
                            <Clock weight="duotone" className="w-2.5 h-2.5" />
                            {new Date(est.timestamp).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-end">
                        <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                          {(est.estimatedCost || 0).toFixed(0)} {t("currency")}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {(est.estimatedLiters || 0).toFixed(1)}{" "}
                          {t("liters_abbr")}
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-slate-400 pt-2 border-t border-slate-100 dark:border-white/5">
                      <span>{formatEfficiency2Dec(est.consumptionUsed)}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteTripEstimate(est.id);
                        }}
                        className="text-red-400 hover:text-red-500 transition-colors"
                      >
                        <Trash weight="duotone" className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </PageWrapper>

      <Modal
        isOpen={!!selectedEstimate}
        onClose={() => setSelectedEstimate(null)}
        title={t("trip_estimator")}
      >
        {selectedEstimate && (
          <EstimateDetails data={selectedEstimate} isModal t={t} cn={cn} />
        )}
      </Modal>
    </>
  );
}
