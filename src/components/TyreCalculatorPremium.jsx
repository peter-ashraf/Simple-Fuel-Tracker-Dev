import { useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowCounterClockwise,
  Calculator,
  CaretDown,
  CaretLeft,
  Clock,
  FloppyDisk,
  Gauge,
  Info,
  ListChecks,
  RoadHorizon,
  Scales,
  Tire,
  Trash,
  TrendUp,
  WarningCircle,
  Wrench,
} from "@phosphor-icons/react";
// eslint-disable-next-line no-unused-vars
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ConfirmModal, Input, Modal, cn } from "./ui";
import { useFuel } from "../hooks/useFuelContext";
import {
  commonTyreSizes,
  compareTyreSizes,
  formatTyreSize,
  validateTyreDimensions,
} from "../utils/tyreCalculator";
import "./tools/ToolScreen.css";
import "./TyreCalculator.css";

const toTyreLabel = (tyre) => formatTyreSize(tyre).replace(" R", " R");

const getDifferenceTone = (value, inverse = false) => {
  const numeric = Number(String(value).replace("%", ""));
  if (!Number.isFinite(numeric) || numeric === 0) return "neutral";
  const positive = numeric > 0;
  return positive !== inverse ? "negative" : "positive";
};

const StatLine = ({ icon: LineIcon, label, original, delta, next, tone }) => (
  <div className="tyre-result-line">
    <span className="tyre-line-icon">
      <LineIcon weight="duotone" />
    </span>
    <span className="tyre-line-label">{label}</span>
    <strong className="is-original">{original}</strong>
    <strong className={cn("is-delta", `is-${tone || "neutral"}`)}>
      {delta}
    </strong>
    <strong className="is-new">{next}</strong>
  </div>
);

const TyreSummaryCard = ({ title, tyre, tone = "blue", badge }) => (
  <div className={`tyre-summary-card is-${tone}`}>
    <span className="tyre-summary-icon">
      {tone === "purple" ? <Tire weight="duotone" /> : <RoadHorizon weight="duotone" />}
    </span>
    <div>
      <p>{title}</p>
      <h3>{toTyreLabel(tyre)}</h3>
      {badge && <em>{badge}</em>}
    </div>
  </div>
);

const ResultDetails = ({ result, t, onToggleSpeed, compact = false }) => {
  if (!result) return null;

  const speedTone = getDifferenceTone(result.speedImpact.speedPercentageChange, true);
  const rpmTone = getDifferenceTone(result.rpmImpact.rpmPercentageChange, true);
  const fuelTone = getDifferenceTone(result.fuelImpact.consumptionChangeFormatted);

  return (
    <div className={cn("tyre-result-details", compact && "is-compact")}>
      <div className="tyre-summary-grid">
        <TyreSummaryCard
          title="Original tire"
          tyre={result.original}
          tone="blue"
          badge="Baseline"
        />
        <TyreSummaryCard
          title="New tire"
          tyre={result.new}
          tone="purple"
          badge="New"
        />
      </div>

      <div className="tyre-result-table">
        <StatLine
          icon={Gauge}
          label={t("diameter")}
          original={`${result.original.diameter} in`}
          delta={`${result.differences.diameterDifference > 0 ? "+" : ""}${result.differences.diameterDifference} in`}
          next={`${result.new.diameter} in`}
          tone={getDifferenceTone(result.differences.diameterDifference)}
        />
        <StatLine
          icon={Tire}
          label={t("circumference")}
          original={`${result.original.circumferenceMm} mm`}
          delta={result.differences.circumferenceDifference}
          next={`${result.new.circumferenceMm} mm`}
          tone={getDifferenceTone(result.differences.circumferenceDifference)}
        />
        <StatLine
          icon={ListChecks}
          label={t("sidewall")}
          original={`${result.original.sidewallMm} mm`}
          delta={`${(result.new.sidewallMm - result.original.sidewallMm).toFixed(1)} mm`}
          next={`${result.new.sidewallMm} mm`}
          tone={getDifferenceTone(result.new.sidewallMm - result.original.sidewallMm)}
        />
        <button type="button" onClick={onToggleSpeed} className="tyre-result-line is-button">
          <span className="tyre-line-icon">
            <Gauge weight="duotone" />
          </span>
          <span className="tyre-line-label">{t("actual_at_speed", { speed: result.speedImpact.speedometerSpeed })}</span>
          <strong className="is-original">
            {result.speedImpact.speedometerSpeed} km/h
          </strong>
          <strong className={cn("is-delta", `is-${speedTone}`)}>
            {result.speedImpact.speedPercentageChange}
          </strong>
          <strong className="is-new">{result.speedImpact.actualSpeed} km/h</strong>
        </button>
        <StatLine
          icon={Wrench}
          label={t("rpm_change")}
          original={`${result.rpmImpact.originalRPM} RPM`}
          delta={result.rpmImpact.rpmPercentageChange}
          next={`${result.rpmImpact.newRPM} RPM`}
          tone={rpmTone}
        />
        <StatLine
          icon={TrendUp}
          label={t("fuel_consumption_impact")}
          original={
            result.fuelImpact.baselineKmPerLiter > 0
              ? `${result.fuelImpact.baselineKmPerLiter} km/L`
              : "No baseline"
          }
          delta={`${result.fuelImpact.consumptionChangePercent > 0 ? "+" : ""}${result.fuelImpact.consumptionChangeFormatted}`}
          next={
            result.fuelImpact.expectedKmPerLiter > 0
              ? `${result.fuelImpact.expectedKmPerLiter} km/L`
              : t("limited_data")
          }
          tone={fuelTone}
        />
      </div>

      <div className="tool-note tyre-result-note">
        <Info weight="duotone" />
        <div>
          <strong>{t("calculated_at")}</strong>
          <span>
            {new Date(result.timestamp).toLocaleDateString()} at{" "}
            {new Date(result.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>
    </div>
  );
};

const TyreHistory = ({ comparisons, onDelete, t }) => {
  const [selectedComparison, setSelectedComparison] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  if (!comparisons.length) {
    return (
      <div className="tool-empty-state">
        <span>
          <Tire weight="duotone" />
        </span>
        <h3>{t("untracked")}</h3>
        <p>No tire comparisons yet. Add values above and calculate to see the history here.</p>
      </div>
    );
  }

  return (
    <>
      <div className="tyre-history-list">
        {comparisons.slice(0, 10).map((comparison) => {
          const speedTone = getDifferenceTone(
            comparison.speedImpact.speedPercentageChange,
            true,
          );
          const rpmTone = getDifferenceTone(
            comparison.rpmImpact.rpmPercentageChange,
            true,
          );
          const fuelTone = getDifferenceTone(
            comparison.fuelImpact?.consumptionChangeFormatted || 0,
          );

          return (
            <button
              type="button"
              key={comparison.id}
              className="tyre-history-card"
              onClick={() => setSelectedComparison(comparison)}
            >
              <div className="tyre-history-top">
                <div>
                  <small>Old tire size</small>
                  <strong>{toTyreLabel(comparison.original)}</strong>
                </div>
                <span aria-hidden="true">to</span>
                <div>
                  <small>New tire size</small>
                  <strong>{toTyreLabel(comparison.new)}</strong>
                </div>
                <button
                  type="button"
                  className="tyre-history-delete"
                  onClick={(event) => {
                    event.stopPropagation();
                    setDeleteTarget(comparison.id);
                  }}
                  aria-label={t("delete")}
                >
                  <Trash weight="duotone" />
                </button>
              </div>
              <p className="tyre-history-date">
                <Clock weight="duotone" />
                {new Date(comparison.timestamp).toLocaleString([], {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
              <div className="tyre-impact-list">
                <div>
                  <Gauge weight="duotone" />
                  <span>{t("speed_impact")}</span>
                  <strong className={`is-${speedTone}`}>
                    {comparison.speedImpact.speedPercentageChange}
                  </strong>
                </div>
                <div>
                  <Wrench weight="duotone" />
                  <span>{t("rpm_change")}</span>
                  <strong className={`is-${rpmTone}`}>
                    {comparison.rpmImpact.rpmPercentageChange}
                  </strong>
                </div>
                {comparison.fuelImpact && (
                  <div>
                    <TrendUp weight="duotone" />
                    <span>{t("fuel_consumption_impact")}</span>
                    <strong className={`is-${fuelTone}`}>
                      {comparison.fuelImpact.consumptionChangePercent > 0 ? "+" : ""}
                      {comparison.fuelImpact.consumptionChangeFormatted}
                    </strong>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <ConfirmModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          onDelete(deleteTarget);
          setDeleteTarget(null);
        }}
        title={t("delete")}
        message={`${t("delete")}?`}
        confirmText={t("delete")}
        cancelText={t("cancel")}
        variant="danger"
      />

      <Modal
        isOpen={!!selectedComparison}
        onClose={() => setSelectedComparison(null)}
        title="Tire Comparison"
      >
        {selectedComparison && (
          <ResultDetails
            result={selectedComparison}
            t={t}
            onToggleSpeed={() => {}}
            compact
          />
        )}
      </Modal>
    </>
  );
};

export default function TyreCalculatorPremium() {
  const {
    activeVehicle,
    addTyreComparison,
    deleteTyreComparison,
    tyreComparisons,
    stats,
  } = useFuel();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language.startsWith("ar");

  const originalTyre = activeVehicle?.tyreSize || {
    width: 205,
    aspectRatio: 55,
    rimSize: 16,
  };
  const [newTyre, setNewTyre] = useState({
    width: 215,
    aspectRatio: 55,
    rimSize: 16,
  });
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(false);
  const [sizesOpen, setSizesOpen] = useState(false);
  const [impactSpeedKmh, setImpactSpeedKmh] = useState(100);
  const [validationErrors, setValidationErrors] = useState([]);

  const runCalculation = (speedKmh = impactSpeedKmh) => {
    setSaved(false);
    const originalValidation = validateTyreDimensions(originalTyre);
    const newValidation = validateTyreDimensions(newTyre);
    const allErrors = [
      ...originalValidation.errors.map((error) => `${t("active_vehicle")}: ${error}`),
      ...newValidation.errors.map((error) => `${t("tires")}: ${error}`),
    ];
    setValidationErrors(allErrors);

    if (allErrors.length > 0) {
      setResult(null);
      return null;
    }

    const nextResult = compareTyreSizes(originalTyre, newTyre, {
      speedKmh,
      gearRatio: 1.0,
      finalDriveRatio: 3.5,
      baselineKmPerLiter: stats.avgKmPerLiter,
    });
    setResult(nextResult);
    return nextResult;
  };

  const toggleImpactSpeed = () => {
    const nextSpeed = impactSpeedKmh === 100 ? 60 : 100;
    setImpactSpeedKmh(nextSpeed);
    if (result) runCalculation(nextSpeed);
  };

  const handleReset = () => {
    setNewTyre({ width: 215, aspectRatio: 55, rimSize: 16 });
    setResult(null);
    setSaved(false);
    setSizesOpen(false);
    setImpactSpeedKmh(100);
    setValidationErrors([]);
  };

  const handleSave = () => {
    if (!result) return;
    addTyreComparison(result);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <>
      {createPortal(
        <div className="tool-action-bar tyre-action-bar">
          <div className="tool-action-inner tyre-action-inner">
            <button
              type="button"
              onClick={() => runCalculation()}
              className="tool-action-button tool-action-primary tyre-primary-action"
            >
              <Calculator weight="bold" className="tool-action-icon" />
              <span>{t("calculate")}</span>
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="tool-action-button tool-action-secondary"
            >
              <ArrowCounterClockwise weight="bold" className="tool-action-icon" />
              <span>Reset</span>
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!result || saved}
              className="tool-action-button tool-action-primary tyre-save-action"
            >
              <FloppyDisk weight="bold" className="tool-action-icon" />
              <span>{t("save")}</span>
            </button>
          </div>
        </div>,
        document.body,
      )}

      <main className="tool-screen tyre-tool-screen">
        <div className="tool-content">
          <header className="tyre-topbar">
            <button
              type="button"
              className="tyre-icon-button"
              onClick={() => navigate("/")}
              aria-label={t("back")}
            >
              <CaretLeft weight="bold" className={cn(isRtl && "rotate-180")} />
            </button>
            <div>
              <h1>Tire Comparison</h1>
              <p>Compare tire sizes and impacts</p>
            </div>
            <button type="button" className="tyre-icon-button" aria-label="Help">
              <Info weight="bold" />
            </button>
          </header>

          <section className="tool-card tyre-overview-card">
            <div className="tool-section-heading">
              <span className="tool-section-icon is-purple">
                <Info weight="duotone" />
              </span>
              <div>
                <h2>{t("overview")}</h2>
                <p>Active vehicle tire size</p>
              </div>
            </div>
            <div className="tyre-active-card">
              <span className="tyre-hex-icon">
                <RoadHorizon weight="duotone" />
              </span>
              <div>
                <p>{t("active_vehicle")}</p>
                <h3>{activeVehicle?.name || t("select_vehicle")}</h3>
                <span>
                  Current tire size <strong>{toTyreLabel(originalTyre)}</strong>
                </span>
              </div>
            </div>
          </section>

          <section className="tool-card tyre-input-card">
            <div className="tool-section-heading">
              <span className="tool-section-icon is-purple">
                <Tire weight="duotone" />
              </span>
              <div>
                <h2>{t("tires")} (input)</h2>
                <p>Enter the comparison tire size</p>
              </div>
            </div>

            <div className="tyre-input-grid">
              <label>
                <span>{t("width")} (mm)</span>
                <Input
                  type="number"
                  value={newTyre.width}
                  onChange={(event) =>
                    setNewTyre({
                      ...newTyre,
                      width: parseInt(event.target.value, 10) || 0,
                    })
                  }
                  placeholder="e.g. 185"
                />
              </label>
              <label>
                <span>{t("ratio")} (%)</span>
                <Input
                  type="number"
                  value={newTyre.aspectRatio}
                  onChange={(event) =>
                    setNewTyre({
                      ...newTyre,
                      aspectRatio: parseInt(event.target.value, 10) || 0,
                    })
                  }
                  placeholder="e.g. 65"
                />
              </label>
              <label>
                <span>{t("rim")} (in)</span>
                <Input
                  type="number"
                  value={newTyre.rimSize}
                  onChange={(event) =>
                    setNewTyre({
                      ...newTyre,
                      rimSize: parseInt(event.target.value, 10) || 0,
                    })
                  }
                  placeholder="e.g. 15"
                />
              </label>
            </div>

            <div className="tyre-common-row">
              <span>{t("common_sizes")}</span>
              <div className="tool-select-wrap">
                <button
                  type="button"
                  onClick={() => setSizesOpen((value) => !value)}
                  className="tool-select-button tyre-size-select"
                >
                  <span>{toTyreLabel(newTyre)}</span>
                  <CaretDown
                    weight="bold"
                    className={cn("tool-select-caret", sizesOpen && "is-open")}
                  />
                </button>
                <AnimatePresence>
                  {sizesOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      className="tool-select-menu tool-select-menu-right tyre-size-menu"
                    >
                      {commonTyreSizes.map((size) => (
                        <button
                          type="button"
                          key={size.label}
                          className="tool-select-option"
                          onClick={() => {
                            setNewTyre(size);
                            setSizesOpen(false);
                          }}
                        >
                          {size.label}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {validationErrors.length > 0 && (
              <div className="tool-note is-warning">
                <WarningCircle weight="duotone" />
                <div>
                  <strong>Check tire values</strong>
                  <span>{validationErrors.join(" ")}</span>
                </div>
              </div>
            )}
          </section>

          {result ? (
            <section className="tool-card tyre-result-card">
              <div className="tool-section-heading">
                <span className="tool-section-icon is-purple">
                  <Scales weight="duotone" />
                </span>
                <div>
                  <h2>Trends & visualization</h2>
                  <p>Detailed comparison results</p>
                </div>
              </div>
              <ResultDetails
                result={result}
                t={t}
                onToggleSpeed={toggleImpactSpeed}
              />
            </section>
          ) : (
            <section className="tool-card tyre-history-shell">
              <div className="tool-section-heading">
                <span className="tool-section-icon is-purple">
                  <Clock weight="duotone" />
                </span>
                <div>
                  <h2>{t("history")}</h2>
                  <p>Your saved tire comparisons</p>
                </div>
              </div>
              <TyreHistory
                comparisons={tyreComparisons}
                onDelete={deleteTyreComparison}
                t={t}
              />
            </section>
          )}

          {result && (
            <section className="tool-card tyre-history-shell">
              <div className="tool-section-heading">
                <span className="tool-section-icon is-purple">
                  <Clock weight="duotone" />
                </span>
                <div>
                  <h2>{t("history")}</h2>
                  <p>Your saved tire comparisons</p>
                </div>
              </div>
              <TyreHistory
                comparisons={tyreComparisons}
                onDelete={deleteTyreComparison}
                t={t}
              />
            </section>
          )}
        </div>
      </main>
    </>
  );
}
