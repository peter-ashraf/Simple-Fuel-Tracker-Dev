import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Calculator,
  CaretDown,
  CaretLeft,
  Check,
  Clock,
  ClockCounterClockwise,
  CurrencyDollar,
  Database,
  Drop,
  FileX,
  Gauge,
  MapPin,
  Repeat,
  RoadHorizon,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
// eslint-disable-next-line no-unused-vars
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Input, Modal, cn } from "../ui";
import { useFuel } from "../../hooks/useFuelContext";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import {
  calculateTripEstimate,
  convertDistance,
} from "../../utils/tripEstimator";
import { formatEfficiency2Dec } from "../../utils/formatting";
import "../tools/ToolScreen.css";
import "./TripCostEstimator.css";

const sampleOptions = [5, 10, "total"];

const getConfidenceTone = (confidence) => {
  if (confidence === "high") return "good";
  if (confidence === "medium") return "warn";
  if (confidence === "low") return "caution";
  return "muted";
};

const ToggleRow = ({ icon: RowIcon, title, subtitle, checked, onChange }) => (
  <div className="tool-option-row">
    <span className="tool-option-icon">
      <RowIcon weight="duotone" />
    </span>
    <span className="tool-option-copy">
      <span>{title}</span>
      {subtitle && <small>{subtitle}</small>}
    </span>
    <button
      type="button"
      className={cn("tool-switch", checked && "is-on")}
      onClick={onChange}
      aria-pressed={checked}
    >
      <span />
    </button>
  </div>
);

const SelectMenu = ({
  value,
  label,
  isOpen,
  onToggle,
  onSelect,
  options,
  renderOption = (option) => option,
  align = "right",
  buttonClassName,
  menuClassName,
}) => (
  <div className="tool-select-wrap">
    <button
      type="button"
      className={cn("tool-select-button", buttonClassName)}
      onClick={onToggle}
    >
      <span>{label}</span>
      <CaretDown
        weight="bold"
        className={cn("tool-select-caret", isOpen && "is-open")}
      />
    </button>
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className={cn(
            "tool-select-menu",
            align === "left" ? "tool-select-menu-left" : "tool-select-menu-right",
            menuClassName,
          )}
        >
          {options.map((option) => (
            <button
              type="button"
              key={String(option)}
              className={cn("tool-select-option", value === option && "is-active")}
              onClick={() => onSelect(option)}
            >
              {renderOption(option)}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

const EstimateDetails = ({ data, isModal = false, t }) => (
  <div className={cn("trip-estimate-details", isModal && "is-modal")}>
    {!isModal && (
      <div className="tool-section-heading">
        <span className="tool-section-icon is-blue">
          <CurrencyDollar weight="duotone" />
        </span>
        <div>
          <h2>{t("estimated_cost")}</h2>
          <p>Calculated from current trip inputs</p>
        </div>
      </div>
    )}

    <div className="trip-result-hero">
      <div>
        <p>Total cost</p>
        <strong>{(data.estimatedCost || 0).toFixed(2)}</strong>
        <span>{t("currency")}</span>
      </div>
      <div>
        <p>Fuel required</p>
        <strong>{(data.estimatedLiters || 0).toFixed(2)}</strong>
        <span>{t("liters_abbr") || "L"}</span>
      </div>
    </div>

    <div className="tool-metric-list">
      <div>
        <span>{t("avg_consumption")}</span>
        <strong>{formatEfficiency2Dec(data.consumptionUsed)}</strong>
      </div>
      <div>
        <span>{t("price")}</span>
        <strong>{(data.priceUsed || 0).toFixed(2)} {t("unit_egp_l")}</strong>
      </div>
      <div>
        <span>{t("overview")}</span>
        <strong>{t(data.methodUsed)}</strong>
      </div>
      <div>
        <span>{t("confidence")}</span>
        <strong className={`tool-tone-${getConfidenceTone(data.confidence)}`}>
          {t(data.confidence)}
        </strong>
      </div>
    </div>

    {data.confidence !== "high" && (
      <div className="tool-note is-warning">
        <WarningCircle weight="duotone" />
        <div>
          <strong>{t("limited_data")}</strong>
          <span>{t("add_more_data_hint")}</span>
        </div>
      </div>
    )}

    {data.rawData?.length > 0 && (
      <div className="trip-data-used">
        <div className="tool-section-heading compact">
          <span className="tool-section-icon">
            <Database weight="duotone" />
          </span>
          <div>
            <h2>{t("recent_data_used")}</h2>
            <p>{t("based_on_x_fillups", { count: data.sampleSize })}</p>
          </div>
        </div>
        <div className="trip-data-rows">
          {data.rawData.slice(0, isModal ? 5 : 4).map((item, index) => (
            <div key={`${item.date}-${index}`}>
              <span>{item.date}</span>
              <strong>{item.kmPerLiter} km/L</strong>
              <em>{item.pricePerLiter} EGP/L</em>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);

export default function TripCostEstimatorPremium() {
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
  const [sampleSize, setSampleSize] = useLocalStorage(
    "fueltracker-trip-sample-size",
    5,
  );
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
      sampleSize: sampleSize === "total" ? null : sampleSize,
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
      if (
        sampleSizeDropdownRef.current &&
        !sampleSizeDropdownRef.current.contains(event.target)
      ) {
        setIsSampleSizeDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const sampleLabel =
    sampleSize === "total" ? "All records" : `Last ${sampleSize} records`;

  return (
    <>
      {createPortal(
        <div className="tool-action-bar">
          <div className="tool-action-inner trip-action-inner">
            <button
              type="button"
              onClick={() => estimate && addTripEstimate(estimate)}
              disabled={!estimate}
              className="tool-action-button tool-action-primary"
            >
              <Check weight="bold" className="tool-action-icon" />
              <span>{t("save")}</span>
            </button>
          </div>
        </div>,
        document.body,
      )}

      <main className="tool-screen trip-tool-screen">
        <div className="tool-content">
          <header className="trip-topbar">
            <button
              type="button"
              className="trip-icon-button"
              onClick={() => navigate("/")}
              aria-label={t("back")}
            >
              <CaretLeft weight="bold" className={cn(isRtl && "rotate-180")} />
            </button>
            <div>
              <h1>{t("trip_estimator")}</h1>
              <p>{t("estimate_trip_subtitle")}</p>
            </div>
          </header>

          <section className="tool-card trip-overview-card">
            <div className="tool-section-heading">
              <span className="tool-section-icon is-teal">
                <Calculator weight="duotone" />
              </span>
              <div>
                <h2>{t("overview")}</h2>
                <p>Provide trip details and preferences</p>
              </div>
            </div>

            <div className="trip-control-panel">
              <div className="trip-input-row">
                <span className="tool-option-icon">
                  <MapPin weight="duotone" />
                </span>
                <div className="trip-input-copy">
                  <strong>Trip distance</strong>
                  <span>Enter total distance</span>
                </div>
                <Input
                  type="number"
                  step="0.1"
                  value={tripDistance}
                  onChange={(event) => setTripDistance(event.target.value)}
                  placeholder="Enter distance"
                  className="trip-distance-input"
                />
                <div ref={dropdownRef}>
                  <SelectMenu
                    value={distanceUnit}
                    label={distanceUnit}
                    isOpen={isUnitDropdownOpen}
                    onToggle={() => setIsUnitDropdownOpen((value) => !value)}
                    onSelect={(unit) => {
                      setDistanceUnit(unit);
                      setIsUnitDropdownOpen(false);
                    }}
                    options={["km", "miles"]}
                    renderOption={(unit) => unit.toUpperCase()}
                    buttonClassName="trip-unit-button"
                  />
                </div>
              </div>

              <div className="trip-input-row">
                <span className="tool-option-icon">
                  <Database weight="duotone" />
                </span>
                <div className="trip-input-copy">
                  <strong>Sample size</strong>
                  <span>Select data samples</span>
                </div>
                <div className="trip-sample-wrap" ref={sampleSizeDropdownRef}>
                  <SelectMenu
                    value={sampleSize}
                    label={sampleLabel}
                    isOpen={isSampleSizeDropdownOpen}
                    onToggle={() =>
                      setIsSampleSizeDropdownOpen((value) => !value)
                    }
                    onSelect={(size) => {
                      setSampleSize(size);
                      setIsSampleSizeDropdownOpen(false);
                    }}
                    options={sampleOptions}
                    renderOption={(size) =>
                      size === "total" ? "All records" : `Last ${size} records`
                    }
                    buttonClassName="trip-sample-button"
                    menuClassName="trip-sample-menu"
                  />
                </div>
              </div>

              <ToggleRow
                icon={Repeat}
                title={t("round_trip")}
                subtitle="Include return journey"
                checked={isRoundTrip}
                onChange={() => setIsRoundTrip((value) => !value)}
              />
            </div>

            <div className="trip-control-panel compact">
              <ToggleRow
                icon={Drop}
                title="Use manual avg. consumption"
                subtitle="Override from history average"
                checked={useManualConsumption}
                onChange={() => setUseManualConsumption((value) => !value)}
              />
              {useManualConsumption && (
                <Input
                  type="number"
                  step="0.01"
                  value={manualConsumption}
                  onChange={(event) => setManualConsumption(event.target.value)}
                  placeholder="km/L"
                  className="trip-manual-input"
                />
              )}

              <ToggleRow
                icon={CurrencyDollar}
                title="Use manual fuel price"
                subtitle="Override from current fuel price"
                checked={useManualPrice}
                onChange={() => setUseManualPrice((value) => !value)}
              />
              {useManualPrice && (
                <Input
                  type="number"
                  step="0.01"
                  value={manualFuelPrice}
                  onChange={(event) => setManualFuelPrice(event.target.value)}
                  placeholder="EGP/L"
                  className="trip-manual-input"
                />
              )}
            </div>
          </section>

          {estimate ? (
            <section className="tool-card">
              <EstimateDetails data={estimate} t={t} />
            </section>
          ) : (
            <section className="tool-empty-card trip-live-empty">
              <span>
                <RoadHorizon weight="duotone" />
              </span>
              <div>
                <h2>Awaiting distance</h2>
                <p>Enter a trip distance to preview fuel required and cost.</p>
              </div>
            </section>
          )}

          <section className="trip-history-section">
            <div className="tool-section-heading">
              <span className="tool-section-icon is-teal">
                <ClockCounterClockwise weight="duotone" />
              </span>
              <div>
                <h2>{t("history")}</h2>
                <p>Your recent trip estimations</p>
              </div>
            </div>

            {tripEstimates.length === 0 ? (
              <div className="tool-empty-state">
                <span>
                  <FileX weight="duotone" />
                </span>
                <h3>{t("untracked")}</h3>
                <p>
                  You have not created any trip estimates yet. Saved estimates
                  will appear here.
                </p>
              </div>
            ) : (
              <div className="trip-history-list">
                {tripEstimates.slice(0, 10).map((est, index) => {
                  const displayDistance =
                    est.distance ||
                    est.estimatedLiters * est.consumptionUsed ||
                    0;

                  return (
                    <button
                      type="button"
                      key={est.id || `est-${index}`}
                      className="trip-history-card"
                      onClick={() => setSelectedEstimate(est)}
                    >
                      <span className="trip-history-icon">
                        <MapPin weight="duotone" />
                      </span>
                      <span className="trip-history-main">
                        <strong>{displayDistance.toFixed(0)} km</strong>
                        <small>
                          <Clock weight="duotone" />
                          {new Date(est.timestamp).toLocaleDateString()}
                        </small>
                      </span>
                      <span className="trip-history-stats">
                        <strong>
                          {(est.estimatedCost || 0).toFixed(0)} {t("currency")}
                        </strong>
                        <small>
                          {(est.estimatedLiters || 0).toFixed(1)}{" "}
                          {t("liters_abbr")}
                        </small>
                      </span>
                      <span className="trip-history-efficiency">
                        <Gauge weight="duotone" />
                        {formatEfficiency2Dec(est.consumptionUsed)}
                      </span>
                      <button
                        type="button"
                        className="trip-delete-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteTripEstimate(est.id);
                        }}
                        aria-label={t("delete")}
                      >
                        <Trash weight="duotone" />
                      </button>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>

      <Modal
        isOpen={!!selectedEstimate}
        onClose={() => setSelectedEstimate(null)}
        title={t("trip_estimator")}
      >
        {selectedEstimate && (
          <EstimateDetails data={selectedEstimate} isModal t={t} />
        )}
      </Modal>
    </>
  );
}
