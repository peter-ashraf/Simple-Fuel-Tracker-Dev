import { useState } from "react";
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

export default function HistoryCardPremium({
  fill,
  index,
  fillUps,
  onDelete,
  onUpdate,
}) {
  const { t, i18n } = useTranslation();
  const [isFlipped, setIsFlipped] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const isRtl = i18n.language.startsWith("ar");

  const [editForm, setEditForm] = useState({
    liters: fill.liters,
    odometer: fill.odometer,
    fuelType: fill.fuelType,
    station: fill.station || "",
    notes: fill.notes || "",
    date: new Date(fill.timestamp).toISOString().substring(0, 10),
    totalCost: fill.liters * (fill.pricePerLiter || 0),
    tankLevelAfter:
      fill.tankLevelAfter !== undefined ? fill.tankLevelAfter : 100,
  });
  const [showPartialSlider, setShowPartialSlider] = useState(
    fill.isPartialFill || fill.tankLevelAfter < 100,
  );

  const metrics = calculateTripMetrics(fillUps, index);
  const tripCost = (fill.liters * (fill.pricePerLiter || 0)).toFixed(2);
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
    setIsFlipped(false);
  };

  const handleCancel = () => {
    setEditForm({
      liters: fill.liters,
      odometer: fill.odometer,
      fuelType: fill.fuelType,
      station: fill.station || "",
      notes: fill.notes || "",
      date: new Date(fill.timestamp).toISOString().substring(0, 10),
      totalCost: fill.liters * (fill.pricePerLiter || 0),
      tankLevelAfter:
        fill.tankLevelAfter !== undefined ? fill.tankLevelAfter : 100,
    });
    setIsFlipped(false);
  };

  return (
    <div className={`flip-card premium-history-flip ${isFlipped ? "flipped" : ""} ${isRtl ? "rtl" : ""}`}>
      <div className="flip-card-inner">
        <div className="flip-card-front premium-history-card">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[var(--border-strong)] bg-[rgba(32,230,183,0.18)] px-3 py-0.5 text-sm font-black text-[var(--accent-primary)]">
                  P{fill.fuelType || "92"}
                </span>
                <p className="text-sm font-bold text-[var(--text-secondary)]">
                  {format(new Date(fill.timestamp), "MMM d, yyyy")}
                </p>
              </div>

              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-[28px] font-black leading-none tracking-normal text-[var(--text-primary)]">
                  {formatTo2Decimals(Number(tripCost)).toFixed(2)}
                </span>
                <span className="text-sm font-semibold text-[var(--text-secondary)]">
                  {t("currency")}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <p className="text-[11px] font-semibold text-[var(--text-secondary)]">
                {format(new Date(fill.timestamp), "h:mm a")}
              </p>
              <button
                type="button"
                onClick={() => setIsFlipped(true)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-secondary)] transition active:scale-95"
                aria-label={t("edit")}
              >
                <ChevronRight className={cn("h-5 w-5", isRtl && "rotate-180")} />
              </button>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-[var(--text-secondary)]">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {fill.odometer.toLocaleString()} km
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Fuel className="h-3.5 w-3.5" />
              {fill.liters} {t("liters_abbr")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CircleDollarSign className="h-3.5 w-3.5" />
              {fill.pricePerLiter} {t("unit_egp_l")}
            </span>
          </div>

          <div className="mt-2 grid grid-cols-3 gap-1 rounded-[20px] border border-[var(--border-soft)] bg-[rgba(127,139,154,0.08)] p-1.5">
            <div className="px-1 py-1 text-center">
              <Route className="mx-auto mb-0.5 h-3.5 w-3.5 text-[var(--text-secondary)]" />
              <p className="text-base font-black text-[var(--text-primary)]">
                {index === 0 ? "-" : tripDistance}
                {index !== 0 && <span className="ms-1 text-xs font-semibold">km</span>}
              </p>
              <p className="mt-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                {t("distance")}
              </p>
            </div>
            <div className="border-x border-[var(--border-soft)] px-1 py-1 text-center">
              <Gauge className="mx-auto mb-0.5 h-3.5 w-3.5 text-[var(--accent-primary)]" />
              <p
                className={cn(
                  "text-base font-black",
                  index === 0
                    ? "text-[var(--text-primary)]"
                    : getEfficiencyTextClass(kmPerLiterRaw, efficiencyThresholds),
                )}
              >
                {index === 0 ? "-" : kmPerLiter}
                {index !== 0 && <span className="ms-1 text-xs font-semibold">km/L</span>}
              </p>
              <p className="mt-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                Avg. Efficiency
              </p>
            </div>
            <div className="px-1 py-1 text-center">
              <Droplet className="mx-auto mb-0.5 h-3.5 w-3.5 text-[var(--text-secondary)]" />
              <p className="text-base font-black text-[var(--text-primary)]">
                {index === 0 ? "-" : litersPer100km}
                {index !== 0 && <span className="ms-1 text-xs font-semibold">L/100km</span>}
              </p>
              <p className="mt-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                Consumption
              </p>
            </div>
          </div>

          {fill.notes && (
            <p className="mt-4 rounded-2xl border border-[var(--border-soft)] bg-[rgba(127,139,154,0.08)] px-4 py-3 text-sm font-medium text-[var(--text-secondary)]">
              {fill.notes}
            </p>
          )}
        </div>

        <div className="flip-card-back premium-history-card p-5">
          <div className="flex h-full flex-col">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-black text-[var(--text-primary)]">
                  Edit Fill-up
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
                  {format(new Date(fill.timestamp), "MMM d, yyyy")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  className="flex h-11 items-center gap-2 rounded-2xl bg-[var(--accent-primary)] px-4 text-sm font-black text-slate-950"
                >
                  <Save className="h-4 w-4" />
                  {t("save")}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-[var(--text-secondary)]"
                  aria-label={t("cancel")}
                >
                  <X className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteModal(true)}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-500/10 text-red-400"
                  aria-label={t("delete")}
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="form-grid-2">
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
                    type="number"
                    value={editForm.odometer}
                    onChange={(event) =>
                      setEditForm({ ...editForm, odometer: event.target.value })
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

              <div className="form-grid-2">
                <div>
                  <Label>{t("liters")}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editForm.liters}
                    onChange={(event) => {
                      const val = parseFloat(event.target.value) || 0;
                      setEditForm({
                        ...editForm,
                        liters: event.target.value,
                        totalCost: (val * (fill.pricePerLiter || 1)).toFixed(2),
                      });
                    }}
                  />
                </div>
                <div>
                  <Label>{t("total_spent")}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editForm.totalCost}
                    onChange={(event) => {
                      const val = parseFloat(event.target.value) || 0;
                      setEditForm({
                        ...editForm,
                        totalCost: event.target.value,
                        liters: (val / (fill.pricePerLiter || 1)).toFixed(2),
                      });
                    }}
                  />
                </div>
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
                  className="input-field min-h-[92px] w-full"
                  value={editForm.notes}
                  onChange={(event) =>
                    setEditForm({ ...editForm, notes: event.target.value })
                  }
                />
              </div>

              <button
                type="button"
                onClick={() => setShowPartialSlider(!showPartialSlider)}
                className={cn(
                  "premium-secondary-button w-full",
                  showPartialSlider && "border-amber-500/30 text-amber-400",
                )}
              >
                {showPartialSlider ? t("no_not_partial") : t("was_it_partial")}
              </button>

              {showPartialSlider && (
                <div className="rounded-3xl border border-[var(--border-soft)] bg-[rgba(127,139,154,0.08)] p-4">
                  <FuelGaugeSlider
                    value={editForm.tankLevelAfter}
                    onChange={(val) =>
                      setEditForm({ ...editForm, tankLevelAfter: val })
                    }
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={deleteModal}
        onClose={() => setDeleteModal(false)}
        onConfirm={() => onDelete(fill.id)}
        title={t("delete")}
        message={t("delete") + "?"}
        confirmText={t("delete")}
        variant="danger"
      />
    </div>
  );
}
