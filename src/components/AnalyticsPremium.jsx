import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Car,
  ChevronDown,
  CircleDollarSign,
  Gauge,
  Route,
  Trophy,
} from "lucide-react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useFuel } from "../hooks/useFuelContext";
import {
  calculateAverageDailyDistance,
  calculateTripMetrics,
} from "../utils/calculations";
import { calculateEfficiencyThresholds } from "../utils/efficiencyThresholds";
import { formatEfficiency2Dec, formatTo2Decimals } from "../utils/formatting";
import {
  GlassCard,
  MetricTile,
  ScreenHeader,
  SectionTitle,
  VehicleChip,
} from "./PremiumUI";
import { cn } from "./ui";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  Filler,
);

const MotionDiv = motion.div;

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { intersect: false, mode: "index" },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "rgba(3, 7, 13, 0.92)",
      borderColor: "rgba(32, 230, 183, 0.22)",
      borderWidth: 1,
      titleColor: "#f5faff",
      bodyColor: "#b9c7d6",
      displayColors: false,
      padding: 12,
    },
  },
  scales: {
    x: {
      grid: { color: "rgba(120, 210, 220, 0.07)", drawBorder: false },
      ticks: { color: "#8ea0b5", font: { size: 11, weight: 600 } },
    },
    y: {
      grid: { color: "rgba(120, 210, 220, 0.09)", drawBorder: false },
      ticks: { color: "#8ea0b5", font: { size: 11, weight: 600 } },
    },
  },
};

const buildLineData = (labels, values, color = "#20E6B7") => ({
  labels,
  datasets: [
    {
      data: values,
      borderColor: color,
      backgroundColor: (context) => {
        const chart = context.chart;
        const { ctx, chartArea } = chart;
        if (!chartArea) return "rgba(32, 230, 183, 0.24)";
        const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        gradient.addColorStop(0, "rgba(32, 230, 183, 0.44)");
        gradient.addColorStop(1, "rgba(32, 230, 183, 0)");
        return gradient;
      },
      fill: true,
      borderWidth: 3,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBackgroundColor: "#dffff7",
      pointBorderColor: color,
      pointBorderWidth: 2,
      tension: 0.42,
    },
  ],
});

export default function AnalyticsPremium() {
  const {
    activeVehicle,
    vehicles,
    selectedVehicleId,
    setSelectedVehicleId,
    activeVehicleFillUps,
  } = useFuel();
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language.startsWith("ar");
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [isMonthDropdownOpen, setIsMonthDropdownOpen] = useState(false);
  const [expandedHealthIssueIds, setExpandedHealthIssueIds] = useState([]);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsMonthDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const monthlyGroups = useMemo(() => {
    const groups = {};
    activeVehicleFillUps.forEach((fill, index) => {
      const date = new Date(fill.timestamp);
      const key = format(date, "yyyy-MM");
      if (!groups[key]) {
        groups[key] = {
          key,
          fills: [],
          totalCost: 0,
          totalLiters: 0,
          distance: 0,
        };
      }
      groups[key].fills.push({ fill, index });
      groups[key].totalCost += Number(fill.liters || 0) * Number(fill.pricePerLiter || 0);
      groups[key].totalLiters += Number(fill.liters || 0);
      if (index > 0) {
        const previous = activeVehicleFillUps[index - 1];
        if (previous.vehicleId === fill.vehicleId) {
          groups[key].distance += Number(fill.odometer || 0) - Number(previous.odometer || 0);
        }
      }
    });
    return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key));
  }, [activeVehicleFillUps]);

  const selectedData = useMemo(() => {
    if (monthlyGroups.length === 0) return null;
    const group = monthlyGroups.find((entry) => entry.key === selectedMonth) || monthlyGroups[0];
    const avgEff =
      group.distance > 0 && group.totalLiters > 0
        ? group.distance / group.totalLiters
        : 0;
    const costPerKm = group.distance > 0 ? group.totalCost / group.distance : 0;
    const date = new Date(group.key + "-01");
    return {
      ...group,
      avgEff,
      costPerKm,
      monthLabel: `${t(format(date, "MMMM"))} ${format(date, "yyyy")}`,
    };
  }, [monthlyGroups, selectedMonth, t]);

  const chronologicalMonths = useMemo(
    () => [...monthlyGroups].reverse(),
    [monthlyGroups],
  );

  const monthChange = useMemo(() => {
    if (!selectedData || chronologicalMonths.length < 2) return null;
    const index = chronologicalMonths.findIndex((group) => group.key === selectedData.key);
    const previous = chronologicalMonths[index - 1];
    if (!previous?.totalCost) return null;
    return ((selectedData.totalCost - previous.totalCost) / previous.totalCost) * 100;
  }, [chronologicalMonths, selectedData]);

  const tripData = useMemo(
    () =>
      activeVehicleFillUps
        .map((fill, index) => ({
          date: format(new Date(fill.timestamp), "MMM d"),
          ...calculateTripMetrics(activeVehicleFillUps, index),
        }))
        .slice(1)
        .filter((trip) => trip.distance > 0),
    [activeVehicleFillUps],
  );

  const sortedByEfficiency = useMemo(
    () => [...tripData].sort((a, b) => b.kmPerLiter - a.kmPerLiter),
    [tripData],
  );
  const bestTrip = sortedByEfficiency[0];
  const worstTrip = sortedByEfficiency[sortedByEfficiency.length - 1];
  const efficiencyThresholds = useMemo(
    () => calculateEfficiencyThresholds(activeVehicleFillUps),
    [activeVehicleFillUps],
  );
  const predictiveDailyDistance = useMemo(
    () => calculateAverageDailyDistance(activeVehicleFillUps),
    [activeVehicleFillUps],
  );

  const dataHealth = useMemo(() => {
    const sortedByDate = [...activeVehicleFillUps].sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
    );
    const issues = [];
    const dateCounts = sortedByDate.reduce((counts, fill) => {
      const dateKey = format(new Date(fill.timestamp), "yyyy-MM-dd");
      counts[dateKey] = (counts[dateKey] || 0) + 1;
      return counts;
    }, {});
    const duplicateDateCount = Object.values(dateCounts).filter((count) => count > 1).length;
    const missingPriceCount = sortedByDate.filter((fill) => !Number(fill.pricePerLiter)).length;
    const invalidVolumeCount = sortedByDate.filter((fill) => Number(fill.liters) <= 0).length;
    const odometerReversalCount = sortedByDate.filter(
      (fill, index) =>
        index > 0 && Number(fill.odometer) < Number(sortedByDate[index - 1].odometer),
    ).length;
    const suspiciousEfficiencyCount = tripData.filter(
      (trip) => trip.kmPerLiter > 0 && (trip.kmPerLiter < 4 || trip.kmPerLiter > 30),
    ).length;

    if (duplicateDateCount > 0) {
      issues.push({
        id: "duplicate-dates",
        title: `${duplicateDateCount} duplicate date group${duplicateDateCount === 1 ? "" : "s"}`,
      });
    }
    if (missingPriceCount > 0) {
      issues.push({
        id: "missing-price",
        title: `${missingPriceCount} fill-up${missingPriceCount === 1 ? "" : "s"} missing price`,
      });
    }
    if (invalidVolumeCount > 0) {
      issues.push({
        id: "invalid-liters",
        title: `${invalidVolumeCount} fill-up${invalidVolumeCount === 1 ? "" : "s"} with invalid liters`,
      });
    }
    if (odometerReversalCount > 0) {
      issues.push({
        id: "odometer-reversal",
        title: `${odometerReversalCount} odometer reversal${odometerReversalCount === 1 ? "" : "s"} by date order`,
      });
    }
    if (suspiciousEfficiencyCount > 0) {
      issues.push({
        id: "suspicious-efficiency",
        title: `${suspiciousEfficiencyCount} unusual efficiency result${suspiciousEfficiencyCount === 1 ? "" : "s"}`,
      });
    }

    return {
      status: issues.length === 0 ? "good" : issues.length <= 2 ? "review" : "attention",
      issues,
    };
  }, [activeVehicleFillUps, tripData]);

  const toggleHealthIssue = (issueId) => {
    setExpandedHealthIssueIds((current) =>
      current.includes(issueId)
        ? current.filter((id) => id !== issueId)
        : [...current, issueId],
    );
  };

  const spendLabels = chronologicalMonths.map((group) =>
    format(new Date(group.key + "-01"), "MMM"),
  );
  const spendValues = chronologicalMonths.map((group) => formatTo2Decimals(group.totalCost));
  const efficiencyLabels = tripData.slice(-8).map((trip) => trip.date);
  const efficiencyValues = tripData.slice(-8).map((trip) => formatTo2Decimals(trip.kmPerLiter));
  const levelPercent = efficiencyThresholds.ready
    ? Math.min(
        96,
        Math.max(
          4,
          ((efficiencyThresholds.baseline - efficiencyThresholds.low) /
            Math.max(efficiencyThresholds.high - efficiencyThresholds.low, 1)) *
            50 +
            25,
        ),
      )
    : 50;

  if (activeVehicleFillUps.length < 2) {
    return (
      <div className="space-y-6 pb-4">
        <ScreenHeader title={t("analytics")} />
        <GlassCard className="p-10 text-center">
          <BarChart3 className="mx-auto mb-4 h-12 w-12 text-[var(--text-muted)]" />
          <p className="font-bold text-[var(--text-secondary)]">{t("untracked")}</p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-4">
      <ScreenHeader title={t("analytics")} />

      <div className="grid grid-cols-2 gap-3">
        <VehicleChip
          vehicles={vehicles}
          selectedVehicleId={selectedVehicleId}
          setSelectedVehicleId={setSelectedVehicleId}
          activeVehicle={activeVehicle}
          className="min-w-0"
        />
        <div className="relative min-w-0" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsMonthDropdownOpen((current) => !current)}
            className="vehicle-chip w-full"
          >
            <CalendarDays className="h-5 w-5 shrink-0" strokeWidth={1.8} />
            <span className="min-w-0 truncate">{selectedData?.monthLabel}</span>
            <ChevronDown
              className={cn("h-4 w-4 shrink-0 transition-transform", isMonthDropdownOpen && "rotate-180")}
            />
          </button>
          <AnimatePresence>
            {isMonthDropdownOpen && (
              <MotionDiv
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                className={cn("vehicle-menu", isRtl && "left-0 right-auto")}
              >
                {monthlyGroups.map((group) => {
                  const date = new Date(group.key + "-01");
                  return (
                    <button
                      key={group.key}
                      type="button"
                      onClick={() => {
                        setSelectedMonth(group.key);
                        setIsMonthDropdownOpen(false);
                      }}
                      className={cn("vehicle-menu-item", selectedData?.key === group.key && "active")}
                    >
                      {t(format(date, "MMMM"))} {format(date, "yyyy")}
                    </button>
                  );
                })}
              </MotionDiv>
            )}
          </AnimatePresence>
        </div>
      </div>

      <GlassCard className="space-y-5 p-5">
        <div className="grid gap-4">
          <div>
            <p className="text-sm font-bold uppercase text-[var(--text-secondary)]">
              {t("total_spent")}
            </p>
            <div className="mt-5 flex items-baseline gap-3">
              <span className="text-[48px] font-black leading-none tracking-normal text-[var(--text-primary)]">
                {selectedData ? selectedData.totalCost.toFixed(0) : "0"}
              </span>
              <span className="text-xl font-semibold text-[var(--text-secondary)]">
                {t("currency")}
              </span>
            </div>
            {monthChange != null && (
              <span className="mt-5 inline-flex rounded-full border border-[var(--border-strong)] bg-[rgba(32,230,183,0.12)] px-3 py-1.5 text-sm font-bold text-[var(--accent-primary)]">
                {monthChange >= 0 ? "Up" : "Down"} {Math.abs(monthChange).toFixed(1)}% vs previous
              </span>
            )}
          </div>
          <div className="h-[190px]">
            <Line
              options={chartOptions}
              data={buildLineData(spendLabels, spendValues)}
            />
          </div>
        </div>
      </GlassCard>

      <div className="grid grid-cols-2 gap-3">
        <MetricTile
          icon={Gauge}
          label="Avg. Mileage"
          value={selectedData?.avgEff ? selectedData.avgEff.toFixed(2) : "-"}
          unit="km/L"
          trend={`${formatEfficiency2Dec(efficiencyThresholds.baseline || 0)} baseline`}
        />
        <MetricTile
          icon={Route}
          label={t("distance")}
          value={selectedData ? Math.round(selectedData.distance).toLocaleString() : "-"}
          unit="km"
          trend={`${predictiveDailyDistance.toFixed(1)} ${t("km_day")}`}
          tone="cyan"
        />
        <MetricTile
          icon={CircleDollarSign}
          label={t("cost_per_km")}
          value={selectedData?.costPerKm ? selectedData.costPerKm.toFixed(2) : "-"}
          unit={t("currency")}
          tone="blue"
        />
        <MetricTile
          icon={Car}
          label={t("active_vehicle")}
          value={activeVehicle?.name || "-"}
          unit=""
          tone="amber"
        />
      </div>

      <GlassCard className="space-y-5 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase text-[var(--text-secondary)]">
              {t("efficiency_trend")}
            </p>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-4xl font-black text-[var(--text-primary)]">
                {efficiencyValues.length
                  ? efficiencyValues[efficiencyValues.length - 1].toFixed(2)
                  : "-"}
              </span>
              <span className="text-lg font-semibold text-[var(--text-secondary)]">km/L</span>
            </div>
          </div>
          <span className="rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-bold text-[var(--text-secondary)]">
            This Year
          </span>
        </div>
        <div className="h-[170px]">
          <Line
            options={chartOptions}
            data={buildLineData(efficiencyLabels, efficiencyValues)}
          />
        </div>
      </GlassCard>

      <section className="space-y-4">
        <SectionTitle title={t("all_time_records")} />
        <div className="grid grid-cols-3 gap-2">
          <GlassCard className="p-3">
            <p className="text-sm font-bold uppercase text-[var(--text-secondary)]">
              {t("best_efficiency")}
            </p>
            <p className="mt-3 text-2xl font-black text-[var(--text-primary)]">
              {bestTrip ? formatEfficiency2Dec(bestTrip.kmPerLiter) : "-"}
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
              {bestTrip?.date || "-"}
            </p>
            <Trophy className="ms-auto mt-2 h-7 w-7 text-[var(--warning)]" />
          </GlassCard>
          <GlassCard className="p-3">
            <p className="text-sm font-bold uppercase text-[var(--text-secondary)]">
              {t("worst_efficiency")}
            </p>
            <p className="mt-3 text-2xl font-black text-[var(--text-primary)]">
              {worstTrip ? formatEfficiency2Dec(worstTrip.kmPerLiter) : "-"}
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
              {worstTrip?.date || "-"}
            </p>
            <AlertTriangle className="ms-auto mt-2 h-7 w-7 text-[var(--danger)]" />
          </GlassCard>
          <GlassCard className="p-3">
            <p className="text-sm font-bold uppercase text-[var(--text-secondary)]">
              {t("tyre_profile")}
            </p>
            <p className="mt-3 text-2xl font-black leading-tight text-[var(--text-primary)]">
              {activeVehicle?.tyreSize
                ? `${activeVehicle.tyreSize.width}/${activeVehicle.tyreSize.aspectRatio}`
                : "-"}
            </p>
            <p className="mt-1 text-lg font-bold text-[var(--text-primary)]">
              {activeVehicle?.tyreSize ? `R${activeVehicle.tyreSize.rimSize}` : ""}
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
              {activeVehicle?.name}
            </p>
          </GlassCard>
        </div>
      </section>

      <GlassCard className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-[var(--text-primary)]">
              {t("efficiency_levels")}
            </h2>
            <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
              Based on latest {efficiencyThresholds.sampleCount} samples
            </p>
          </div>
          <span className="rounded-full border border-[var(--border-strong)] bg-[rgba(32,230,183,0.12)] px-4 py-2 text-sm font-black text-[var(--accent-primary)]">
            GOOD
          </span>
        </div>
        <div>
          <p className="text-sm font-bold uppercase text-[var(--text-secondary)]">
            {t("vehicle_baseline")}
          </p>
          <p className="mt-2 text-3xl font-black text-[var(--text-primary)]">
            {efficiencyThresholds.ready
              ? efficiencyThresholds.baseline.toFixed(2)
              : "-"}{" "}
            <span className="text-lg font-semibold text-[var(--text-secondary)]">km/L</span>
          </p>
        </div>
        <div className="relative pt-4">
          <div className="h-5 overflow-hidden rounded-full bg-gradient-to-r from-red-500 via-amber-400 via-45% to-emerald-500" />
          <span
            className="absolute top-1 h-8 w-3 -translate-x-1/2 rounded-full border-2 border-white bg-[var(--bg-card-solid)] shadow-lg"
            style={{ left: `${levelPercent}%` }}
          />
          <div className="mt-3 grid grid-cols-4 text-center text-xs font-bold uppercase text-[var(--text-secondary)]">
            <span>Poor</span>
            <span>Average</span>
            <span>Good</span>
            <span>Excellent</span>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase text-[var(--text-secondary)]">
              Data Health
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
              Quick checks for entries that can distort stats, forecasts, or sync review.
            </p>
          </div>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-black uppercase",
              dataHealth.status === "good"
                ? "bg-emerald-500/10 text-[var(--accent-primary)]"
                : dataHealth.status === "review"
                  ? "bg-amber-500/10 text-[var(--warning)]"
                  : "bg-red-500/10 text-[var(--danger)]",
            )}
          >
            {dataHealth.status}
          </span>
        </div>
        {dataHealth.issues.length > 0 && (
          <div className="mt-4 space-y-2">
            {dataHealth.issues.map((issue) => {
              const isExpanded = expandedHealthIssueIds.includes(issue.id);
              return (
                <button
                  key={issue.id}
                  type="button"
                  onClick={() => toggleHealthIssue(issue.id)}
                  className="flex w-full items-center justify-between rounded-2xl border border-[var(--border-soft)] bg-[rgba(127,139,154,0.08)] px-4 py-3 text-start text-sm font-bold text-[var(--text-secondary)]"
                >
                  <span>{issue.title}</span>
                  <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} />
                </button>
              );
            })}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
