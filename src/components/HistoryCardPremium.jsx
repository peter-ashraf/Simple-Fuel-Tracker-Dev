import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import {
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Droplet,
  Fuel,
  Gauge,
  Route,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { calculateTripMetrics } from "../utils/calculations";
import { formatTo2Decimals } from "../utils/formatting";
import {
  calculateEfficiencyThresholds,
  getEfficiencyTextClass,
} from "../utils/efficiencyThresholds";
import {
  ConfirmModal,
  FuelGaugeSlider,
  Input,
  Label,
  cn,
} from "./ui";
import { SegmentedControl } from "./PremiumUI";
import "./HistoryCard.css";

const MotionDiv = motion.div;

const numberOrZero = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const sanitizeInteger = (value) => String(value ?? "").replace(/[^0-9]/g, "");
const sanitizeDecimal = (value) => {
  const raw = String(value ?? "").replace(/[^0-9.]/g, "");
  const [integerPart, ...decimalParts] = raw.split(".");
  return `${integerPart}${decimalParts.length ? `.${decimalParts.join("")}` : ""}`;
};

export default function HistoryCardPremium({
  fill,
  index,
  fillUps,
  onDelete,
  onUpdate,
}) {
  const { t, i18n } = useTranslation();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const isRtl = i18n.language.startsWith("ar");

  const getInitialForm = () => ({
    liters: fill.liters,
    odometer: fill.odometer,
    fuelType: fill.fuelType,
    station: fill.station || "",
    notes: fill.notes || "",
    date: new Date(fill.timestamp).toISOString().substring(0, 10),
    totalCost: (numberOrZero(fill.liters) * numberOrZero(fill.pricePerLiter)).toFixed(2),
    tankLevelAfter:
      fill.tankLevelAfter !== undefined ? fill.tankLevelAfter : 100,
  });

  const [editForm, setEditForm] = useState(getInitialForm);
  const [showPartialSlider, setShowPartialSlider] = useState(
    fill.isPartialFill || fill.tankLevelAfter < 100,
  );

  useEffect(() => {
    if (!editOpen || typeof document === "undefined") return undefined;

    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalHtmlOverscroll = document.documentElement.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.documentElement.style.overscrollBehavior = originalHtmlOverscroll;
    };
  }, [editOpen]);

  const metrics = calculateTripMetrics(fillUps, index);
  const tripCost = numberOrZero(fill.liters) * numberOrZero(fill.pricePerLiter);
  const kmPerLiterRaw = metrics.kmPerLiter;
  const kmPerLiter =
    kmPerLiterRaw > 0 ? formatTo2Decimals(kmPerLiterRaw).toFixed(2) : "-";
  const litersPer100km =
    metrics.litersPer100km > 0
      ? formatTo2Decimals(metrics.litersPer100km).toFixed(2)
      : "-";
  const tripDistance =
    metrics.distance > 0 ? Math.round(metrics.distance).toLocaleString() : "-";
  const efficiencyThresholds = calculateEfficiencyThresholds(fillUps);

  const editPricePerLiter = useMemo(() => {
    const liters = numberOrZero(editForm.liters);
    const cost = numberOrZero(editForm.totalCost);
    if (!liters) return fill.pricePerLiter || 0;
    return cost / liters;
  }, [editForm.liters, editForm.totalCost, fill.pricePerLiter]);

  const handleOpenEdit = () => {
    setEditForm(getInitialForm());
    setShowPartialSlider(fill.isPartialFill || fill.tankLevelAfter < 100);
    setEditOpen(true);
  };

  const handleSave = () => {
    const baseDate = new Date(editForm.date);
    const originalDate = new Date(fill.timestamp);
    baseDate.setHours(
      originalDate.getHours(),
      originalDate.getMinutes(),
      originalDate.getSeconds(),
    );

    onUpdate(fill.id, {
      date: editForm.date,
      timestamp: baseDate.toISOString(),
      liters: Number(editForm.liters),
      odometer: Number(editForm.odometer),
      fuelType: editForm.fuelType,
      station: editForm.station.trim(),
      notes: editForm.notes.trim(),
      totalCost: Number(editForm.totalCost),
      tankLevelAfter: showPartialSlider ? editForm.tankLevelAfter : 100,
      isPartialFill: showPartialSlider,
    });
    setEditOpen(false);
  };

  const handleCancel = () => {
    setEditForm(getInitialForm());
    setEditOpen(false);
  };

  const editSheet = (
    <AnimatePresence>
      {editOpen && (
        <MotionDiv
          className="history-edit-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          <button
            type="button"
            className="history-edit-backdrop"
            onClick={handleCancel}
            aria-label={t("cancel")}
          />
          <MotionDiv
            className="history-edit-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Edit fill-up"
            initial={{ opacity: 0, y: 40, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.985 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="history-edit-handle" />

            <header className="history-edit-header">
              <div>
                <h2>Edit Fill-up</h2>
                <p>{format(new Date(fill.timestamp), "MMM d, yyyy")}</p>
              </div>
              <div className="history-edit-actions">
                <button
                  type="button"
                  onClick={() => setDeleteModal(true)}
                  className="danger"
                  aria-label={t("delete")}
                >
                  <Trash2 className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  aria-label={t("cancel")}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </header>

            <div className="history-edit-content">
              <div className="history-edit-grid two">
                <div>
                  <Label>{t("date")}</Label>
                  <Input
                    type="date"
                    value={editForm.date}
                    onChange={(event) =>
                      setEditForm({ ...editForm, date: event.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>{t("odometer")}</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={editForm.odometer}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        odometer: sanitizeInteger(event.target.value),
                      })
                    }
                  />
                </div>
              </div>

              <div>
                <Label>{t("fuel_type")}</Label>
                <SegmentedControl
                  name={`edit-fuel-${fill.id}`}
                  value={editForm.fuelType}
                  onChange={(fuelType) => setEditForm({ ...editForm, fuelType })}
                  options={[
                    { value: "92", label: "92" },
                    { value: "95", label: "95" },
                    { value: "diesel", label: "Diesel" },
                  ]}
                />
              </div>

              <div className="history-edit-grid two">
                <div>
                  <Label>{t("liters")}</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={editForm.liters}
                    onChange={(event) => {
                      const cleanValue = sanitizeDecimal(event.target.value);
                      const val = parseFloat(cleanValue) || 0;
                      setEditForm({
                        ...editForm,
                        liters: cleanValue,
                        totalCost: (val * (fill.pricePerLiter || 1)).toFixed(2),
                      });
                    }}
                  />
                </div>
                <div>
                  <Label>{t("total_spent")}</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={editForm.totalCost}
                    onChange={(event) => {
                      const cleanValue = sanitizeDecimal(event.target.value);
                      const val = parseFloat(cleanValue) || 0;
                      setEditForm({
                        ...editForm,
                        totalCost: cleanValue,
                        liters: (val / (fill.pricePerLiter || 1)).toFixed(2),
                      });
                    }}
                  />
                </div>
              </div>

              <div className="history-edit-unit-card">
                <span>Unit price</span>
                <strong>
                  {Number.isFinite(editPricePerLiter)
                    ? editPricePerLiter.toFixed(2)
                    : "0.00"}{" "}
                  EGP/L
                </strong>
              </div>

              <div>
                <Label>{t("station")} ({t("optional")})</Label>
                <Input
                  type="text"
                  value={editForm.station}
                  onChange={(event) =>
                    setEditForm({ ...editForm, station: event.target.value })
                  }
                />
              </div>

              <div>
                <Label>{t("notes")} ({t("optional")})</Label>
                <textarea
                  className="input-field history-edit-textarea"
                  value={editForm.notes}
                  onChange={(event) =>
                    setEditForm({ ...editForm, notes: event.target.value })
                  }
                />
              </div>

              <button
                type="button"
                onClick={() => setShowPartialSlider((current) => !current)}
                className={cn(
                  "history-partial-toggle",
                  showPartialSlider && "active",
                )}
              >
                {showPartialSlider ? "Mark as full tank" : "Set as partial fill-up"}
              </button>

              <AnimatePresence initial={false}>
                {showPartialSlider && (
                  <MotionDiv
                    className="history-edit-gauge-card"
                    initial={{ opacity: 0, height: 0, y: -6 }}
                    animate={{ opacity: 1, height: "auto", y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -6 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                  >
                    <FuelGaugeSlider
                      value={editForm.tankLevelAfter}
                      onChange={(val) =>
                        setEditForm({ ...editForm, tankLevelAfter: val })
                      }
                    />
                  </MotionDiv>
                )}
              </AnimatePresence>
            </div>

            <footer className="history-edit-footer">
              <button type="button" onClick={handleSave}>
                <Save className="h-5 w-5" />
                {t("save")}
              </button>
            </footer>
          </MotionDiv>
        </MotionDiv>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <article className="premium-history-card">
        <button
          type="button"
          onClick={handleOpenEdit}
          className="history-card-main-button"
          aria-label="Edit history entry"
        >
          <div className="history-card-header">
            <div className="history-card-title-row">
              <span className="history-fuel-pill">P{fill.fuelType || "92"}</span>
              <time>{format(new Date(fill.timestamp), "MMM d, yyyy")}</time>
            </div>

            <div className="history-card-time-row">
              <span>{format(new Date(fill.timestamp), "h:mm a")}</span>
              <ChevronRight className={cn("h-5 w-5", isRtl && "rotate-180")} />
            </div>
          </div>

          <div className="history-card-amount-row">
            <strong>{formatTo2Decimals(Number(tripCost)).toFixed(2)}</strong>
            <span>{t("currency")}</span>
          </div>

          <div className="history-card-meta-row">
            <span>
              <CalendarDays className="h-4 w-4" />
              {fill.odometer.toLocaleString()} km
            </span>
            <i />
            <span>
              <Fuel className="h-4 w-4" />
              {fill.liters} {t("liters_abbr")}
            </span>
            <i />
            <span>
              <CircleDollarSign className="h-4 w-4" />
              {fill.pricePerLiter} {t("unit_egp_l")}
            </span>
          </div>

          <div className="history-card-metrics-panel">
            <Metric
              icon={Route}
              value={index === 0 ? "-" : tripDistance}
              unit={index === 0 ? "" : "km"}
              label={t("distance")}
            />
            <Metric
              icon={Gauge}
              value={index === 0 ? "-" : kmPerLiter}
              unit={index === 0 ? "" : "km/L"}
              label="Avg. Efficiency"
              valueClassName={cn(
                index !== 0 &&
                  getEfficiencyTextClass(kmPerLiterRaw, efficiencyThresholds),
              )}
            />
            <Metric
              icon={Droplet}
              value={index === 0 ? "-" : litersPer100km}
              unit={index === 0 ? "" : "L/100km"}
              label="Consumption"
            />
          </div>
        </button>

        <button
          type="button"
          className={cn("history-card-side-action", isRtl && "rtl")}
          onClick={handleOpenEdit}
          aria-label="Edit history entry"
        >
          <ChevronRight className="h-6 w-6" />
        </button>

        {fill.notes && <p className="history-card-note">{fill.notes}</p>}
      </article>

      {typeof document !== "undefined" ? createPortal(editSheet, document.body) : editSheet}

      {typeof document !== "undefined" ? createPortal(
        <ConfirmModal
          isOpen={deleteModal}
          onClose={() => setDeleteModal(false)}
          onConfirm={() => {
            setDeleteModal(false);
            setEditOpen(false);
            onDelete(fill.id);
          }}
          title={t("delete")}
          message={t("delete") + "?"}
          confirmText={t("delete")}
          variant="danger"
        />,
        document.body,
      ) : (
        <ConfirmModal
          isOpen={deleteModal}
          onClose={() => setDeleteModal(false)}
          onConfirm={() => {
            setDeleteModal(false);
            setEditOpen(false);
            onDelete(fill.id);
          }}
          title={t("delete")}
          message={t("delete") + "?"}
          confirmText={t("delete")}
          variant="danger"
        />
      )}
    </>
  );
}

function Metric({ icon: Icon, value, unit, label, valueClassName }) {
  return (
    <div className="history-card-metric">
      <Icon className="history-card-metric-icon" strokeWidth={1.75} />
      <div>
        <p className={cn("history-card-metric-value", valueClassName)}>
          {value}
          {unit && <span>{unit}</span>}
        </p>
        <small>{label}</small>
      </div>
    </div>
  );
}
