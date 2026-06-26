import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  ArrowUp,
  CalendarDays,
  Car,
  ChevronDown,
  Fuel,
  Gauge,
  Leaf,
  Trophy,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useFuel } from "../hooks/useFuelContext";
import {
  calculateAverageDailyDistance,
  calculateTripMetrics,
} from "../utils/calculations";
import { calculateEfficiencyThresholds } from "../utils/efficiencyThresholds";
import { formatEfficiency2Dec, formatTo2Decimals } from "../utils/formatting";
import { cn } from "./ui";
import "./AnalyticsPremium.css";

const MotionDiv = motion.div;

const MONTH_WINDOW_SIZE = 6;

const RoadIcon = ({ className, strokeWidth = 1.8, ...props }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
    {...props}
  >
    <path d="M8.5 20 11 4" />
    <path d="M15.5 20 13 4" />
    <path d="M12 6.8v2.1" />
    <path d="M12 12v2.1" />
    <path d="M12 17.2v2.1" />
  </svg>
);


const numberOrZero = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const formatCompact = (value, digits = 0) => {
  const number = numberOrZero(value);
  return number.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const getMonthKey = (date) => format(date, "yyyy-MM");

const parseMonthKey = (key) => {
  const [year, month] = String(key || "").split("-").map(Number);
  if (!year || !month) return new Date();
  return new Date(year, month - 1, 1);
};

const getTyreProfile = (vehicle) => {
  const tyreSize = vehicle?.tyreSize || vehicle?.tyre_size;
  if (!tyreSize) return { main: "-", rim: "", vehicle: vehicle?.name || "" };

  if (typeof tyreSize === "string") {
    const rimMatch = tyreSize.match(/R\s?\d+/i);
    return {
      main: tyreSize.replace(/\s?R\s?\d+/i, ""),
      rim: rimMatch ? rimMatch[0].toUpperCase().replace(" ", "") : "",
      vehicle: vehicle?.name || "",
    };
  }

  const width = tyreSize.width ?? tyreSize.sectionWidth ?? tyreSize.section_width;
  const aspectRatio = tyreSize.aspectRatio ?? tyreSize.aspect_ratio ?? tyreSize.profile;
  const rimSize = tyreSize.rimSize ?? tyreSize.rim_size ?? tyreSize.rim;

  return {
    main: width && aspectRatio ? `${width}/${aspectRatio}` : "-",
    rim: rimSize ? `R${rimSize}` : "",
    vehicle: vehicle?.name || "",
  };
};

function AnalyticsVehicleChip({
  activeVehicle,
  vehicles,
  selectedVehicleId,
  setSelectedVehicleId,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected =
    activeVehicle || vehicles.find((vehicle) => vehicle.id === selectedVehicleId);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="analytics-filter-wrap analytics-vehicle-filter" ref={ref}>
      <button
        type="button"
        className="analytics-filter-chip"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="analytics-filter-icon">
          <Car className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <span className="analytics-filter-text">{selected?.name || "Vehicle"}</span>
        <ChevronDown
          className={cn("analytics-filter-chevron", open && "is-open")}
          strokeWidth={2}
        />
      </button>

      <AnimatePresence>
        {open && vehicles.length > 0 && (
          <MotionDiv
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="analytics-dropdown analytics-vehicle-dropdown"
          >
            {vehicles.map((vehicle) => {
              const isActive = vehicle.id === selectedVehicleId;
              return (
                <button
                  key={vehicle.id}
                  type="button"
                  className={cn("analytics-dropdown-item", isActive && "is-active")}
                  onClick={() => {
                    setSelectedVehicleId?.(vehicle.id);
                    setOpen(false);
                  }}
                >
                  <span>{vehicle.name}</span>
                  {isActive && <span className="analytics-dropdown-check">✓</span>}
                </button>
              );
            })}
          </MotionDiv>
        )}
      </AnimatePresence>
    </div>
  );
}

function AnalyticsMonthChip({
  selectedData,
  monthlyGroups,
  selectedMonth,
  setSelectedMonth,
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="analytics-filter-wrap analytics-month-filter" ref={ref}>
      <button
        type="button"
        className="analytics-filter-chip"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="analytics-filter-icon">
          <CalendarDays className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <span className="analytics-filter-text">{selectedData?.monthLabel || "Month"}</span>
        <ChevronDown
          className={cn("analytics-filter-chevron", open && "is-open")}
          strokeWidth={2}
        />
      </button>

      <AnimatePresence>
        {open && monthlyGroups.length > 0 && (
          <MotionDiv
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="analytics-dropdown analytics-month-dropdown"
          >
            {monthlyGroups.map((group) => {
              const date = parseMonthKey(group.key);
              const isActive = group.key === selectedMonth;
              return (
                <button
                  key={group.key}
                  type="button"
                  className={cn("analytics-dropdown-item", isActive && "is-active")}
                  onClick={() => {
                    setSelectedMonth(group.key);
                    setOpen(false);
                  }}
                >
                  <span>{t(format(date, "MMMM"))} {format(date, "yyyy")}</span>
                  {isActive && <span className="analytics-dropdown-check">✓</span>}
                </button>
              );
            })}
          </MotionDiv>
        )}
      </AnimatePresence>
    </div>
  );
}

function PremiumAreaChart({ values, labels, variant = "large", yLabels = [] }) {
  const safeValues = values.length ? values.map((value) => numberOrZero(value)) : [0];
  const width = 640;
  const height = variant === "large" ? 245 : 168;
  const paddingX = variant === "large" ? 36 : 28;
  const paddingTop = variant === "large" ? 22 : 18;
  const paddingBottom = variant === "large" ? 42 : 32;
  const chartHeight = height - paddingTop - paddingBottom;
  const chartWidth = width - paddingX * 2;
  const max = Math.max(...safeValues, 1);
  const min = Math.min(...safeValues, 0);
  const range = Math.max(max - min, 1);

  const points = safeValues.map((value, index) => {
    const x = paddingX + (chartWidth * index) / Math.max(safeValues.length - 1, 1);
    const y = paddingTop + chartHeight - ((value - min) / range) * (chartHeight * 0.82) - chartHeight * 0.06;
    return { x, y, value };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${height - paddingBottom} L ${points[0].x.toFixed(1)} ${height - paddingBottom} Z`;

  return (
    <div className={cn("analytics-chart-shell", `analytics-chart-${variant}`)}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={`analytics-fill-${variant}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(39, 255, 207, 0.48)" />
            <stop offset="74%" stopColor="rgba(39, 255, 207, 0.12)" />
            <stop offset="100%" stopColor="rgba(39, 255, 207, 0)" />
          </linearGradient>
          <filter id={`analytics-glow-${variant}`} x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {[0, 1, 2, 3].map((row) => {
          const y = paddingTop + (chartHeight * row) / 3;
          return (
            <line
              key={`grid-h-${row}`}
              x1={paddingX}
              y1={y}
              x2={width - paddingX}
              y2={y}
              className="analytics-chart-grid-line"
            />
          );
        })}

        {points.map((point, index) => (
          <line
            key={`grid-v-${index}`}
            x1={point.x}
            y1={paddingTop}
            x2={point.x}
            y2={height - paddingBottom}
            className="analytics-chart-grid-line analytics-chart-grid-vertical"
          />
        ))}

        <path d={areaPath} fill={`url(#analytics-fill-${variant})`} />
        <path d={linePath} className="analytics-chart-line" filter={`url(#analytics-glow-${variant})`} />

        {points.map((point, index) => (
          <circle
            key={`point-${index}`}
            cx={point.x}
            cy={point.y}
            r={variant === "large" ? 4.5 : 3.7}
            className="analytics-chart-point"
          />
        ))}
      </svg>

      <div className="analytics-chart-labels">
        {labels.map((label, index) => (
          <span key={`${label}-${index}`}>{label}</span>
        ))}
      </div>

      {yLabels.length > 0 && (
        <div className="analytics-chart-ylabels">
          {yLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function TrendPill({ value, label }) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const isUp = Number(value) >= 0;

  return (
    <span className="analytics-trend-pill">
      <ArrowUp className={cn("h-3.5 w-3.5", !isUp && "rotate-180")} strokeWidth={2.2} />
      {Math.abs(Number(value)).toFixed(1)} {label}
    </span>
  );
}

function AnalyticsSmallMetric({ icon: Icon, title, value, unit, trend, tone = "teal" }) {
  return (
    <section className="analytics-mini-card">
      <span className={cn("analytics-mini-icon", `analytics-mini-icon-${tone}`)}>
        <Icon className="h-5 w-5" strokeWidth={1.85} />
      </span>
      <div className="analytics-mini-copy">
        <p>{title}</p>
        <div>
          <strong>{value}</strong>
          {unit && <span>{unit}</span>}
        </div>
        {trend && <TrendPill value={trend.value} label={trend.label} />}
      </div>
    </section>
  );
}

function RecordCard({ title, value, unit, date, icon: Icon, tone = "gold", children }) {
  return (
    <article className="analytics-record-card">
      <div>
        <p>{title}</p>
        <strong>{value}</strong>
        {unit && <span>{unit}</span>}
        {date && <small>{date}</small>}
      </div>
      {children || (
        <span className={cn("analytics-record-icon", `analytics-record-icon-${tone}`)}>
          <Icon className="h-8 w-8" strokeWidth={1.75} />
        </span>
      )}
    </article>
  );
}

function TyreVisual() {
  return (
    <span className="analytics-tyre-visual" aria-hidden="true">
      <span />
    </span>
  );
}

export default function AnalyticsPremium() {
  const {
    activeVehicle,
    vehicles,
    selectedVehicleId,
    setSelectedVehicleId,
    activeVehicleFillUps,
  } = useFuel();
  const { t } = useTranslation();
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));

  const monthlyGroups = useMemo(() => {
    const groups = {};

    activeVehicleFillUps.forEach((fill, index) => {
      const date = new Date(fill.timestamp);
      const key = getMonthKey(date);
      if (!groups[key]) {
        groups[key] = {
          key,
          fills: [],
          totalCost: 0,
          totalLiters: 0,
          distance: 0,
          efficiencySamples: [],
        };
      }

      groups[key].fills.push({ fill, index });
      groups[key].totalCost += numberOrZero(fill.liters) * numberOrZero(fill.pricePerLiter);
      groups[key].totalLiters += numberOrZero(fill.liters);

      if (index > 0) {
        const previous = activeVehicleFillUps[index - 1];
        if (previous?.vehicleId === fill.vehicleId) {
          const distance = numberOrZero(fill.odometer) - numberOrZero(previous.odometer);
          if (distance > 0) groups[key].distance += distance;
        }
      }
    });

    return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key));
  }, [activeVehicleFillUps]);

  const chronologicalMonths = useMemo(
    () => [...monthlyGroups].reverse(),
    [monthlyGroups],
  );

  const selectedData = useMemo(() => {
    if (monthlyGroups.length === 0) return null;
    const group = monthlyGroups.find((entry) => entry.key === selectedMonth) || monthlyGroups[0];
    const avgEff = group.distance > 0 && group.totalLiters > 0
      ? group.distance / group.totalLiters
      : 0;
    const costPerKm = group.distance > 0 ? group.totalCost / group.distance : 0;
    const date = parseMonthKey(group.key);

    return {
      ...group,
      avgEff,
      costPerKm,
      monthLabel: `${t(format(date, "MMMM"))} ${format(date, "yyyy")}`,
    };
  }, [monthlyGroups, selectedMonth, t]);

  useEffect(() => {
    if (!selectedData && monthlyGroups[0]?.key) {
      setSelectedMonth(monthlyGroups[0].key);
    }
  }, [monthlyGroups, selectedData]);

  const selectedMonthIndex = useMemo(
    () => chronologicalMonths.findIndex((group) => group.key === selectedData?.key),
    [chronologicalMonths, selectedData?.key],
  );

  const previousMonth = selectedMonthIndex > 0 ? chronologicalMonths[selectedMonthIndex - 1] : null;
  const previousAvgEff = previousMonth && previousMonth.distance > 0 && previousMonth.totalLiters > 0
    ? previousMonth.distance / previousMonth.totalLiters
    : 0;

  const spendChange = previousMonth?.totalCost
    ? ((numberOrZero(selectedData?.totalCost) - previousMonth.totalCost) / previousMonth.totalCost) * 100
    : null;
  const efficiencyChange = previousAvgEff
    ? numberOrZero(selectedData?.avgEff) - previousAvgEff
    : null;
  const distanceChange = previousMonth
    ? numberOrZero(selectedData?.distance) - numberOrZero(previousMonth.distance)
    : null;

  const monthWindow = useMemo(() => {
    const endDate = parseMonthKey(selectedData?.key || getMonthKey(new Date()));
    const groupsByKey = new Map(monthlyGroups.map((group) => [group.key, group]));
    const months = [];

    for (let index = MONTH_WINDOW_SIZE - 1; index >= 0; index -= 1) {
      const date = new Date(endDate.getFullYear(), endDate.getMonth() - index, 1);
      const key = getMonthKey(date);
      const group = groupsByKey.get(key);
      const avgEff = group?.distance > 0 && group?.totalLiters > 0
        ? group.distance / group.totalLiters
        : 0;

      months.push({
        key,
        label: format(date, "MMM"),
        totalCost: formatTo2Decimals(group?.totalCost || 0),
        avgEff: formatTo2Decimals(avgEff),
        distance: group?.distance || 0,
      });
    }

    return months;
  }, [monthlyGroups, selectedData?.key]);

  const tripData = useMemo(
    () =>
      activeVehicleFillUps
        .map((fill, index) => ({
          date: format(new Date(fill.timestamp), "MMM d"),
          ...calculateTripMetrics(activeVehicleFillUps, index),
        }))
        .slice(1)
        .filter((trip) => trip.distance > 0 && trip.kmPerLiter > 0),
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

  const spendValues = monthWindow.map((month) => month.totalCost);
  const spendLabels = monthWindow.map((month) => month.label);
  const efficiencyValues = monthWindow.map((month) => month.avgEff);
  const efficiencyLabels = monthWindow.map((month) => month.label);
  const latestEfficiency = efficiencyValues.filter((value) => value > 0).at(-1) || numberOrZero(selectedData?.avgEff);
  const tyreProfile = getTyreProfile(activeVehicle);
  const totalChartMax = Math.max(...spendValues, numberOrZero(selectedData?.totalCost), 3000);
  const yLabels = [
    `${Math.ceil(totalChartMax / 1000)}K`,
    `${Math.ceil((totalChartMax * 2) / 3000)}K`,
    `${Math.ceil(totalChartMax / 3000)}K`,
    "0",
  ];
  const levelPercent = efficiencyThresholds.ready
    ? clamp(
        ((numberOrZero(efficiencyThresholds.baseline) - numberOrZero(efficiencyThresholds.low)) /
          Math.max(numberOrZero(efficiencyThresholds.high) - numberOrZero(efficiencyThresholds.low), 1)) *
          50 +
          25,
        5,
        95,
      )
    : 64;

  const efficiencyLevelThresholds = efficiencyThresholds.ready
    ? [
        { label: "Low", value: numberOrZero(efficiencyThresholds.low) },
        { label: "Baseline", value: numberOrZero(efficiencyThresholds.baseline) },
        { label: "High", value: numberOrZero(efficiencyThresholds.high) },
      ]
    : [];

  if (activeVehicleFillUps.length < 2) {
    return (
      <div className="analytics-premium-screen">
        <div className="analytics-premium-content">
          <header className="analytics-topbar">
            <h1>Analytics</h1>
          </header>
          <section className="analytics-empty-card">
            <Gauge className="h-10 w-10" strokeWidth={1.8} />
            <p>{t("untracked")}</p>
            <span>Add at least two fill-ups to build trends and records.</span>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-premium-screen">
      <div className="analytics-premium-content">
        <header className="analytics-topbar">
          <h1>Analytics</h1>
          <div className="analytics-filter-row">
            <AnalyticsVehicleChip
              activeVehicle={activeVehicle}
              vehicles={vehicles}
              selectedVehicleId={selectedVehicleId}
              setSelectedVehicleId={setSelectedVehicleId}
            />
            <AnalyticsMonthChip
              selectedData={selectedData}
              monthlyGroups={monthlyGroups}
              selectedMonth={selectedData?.key || selectedMonth}
              setSelectedMonth={setSelectedMonth}
            />
          </div>
        </header>

        <section className="analytics-hero-card">
          <div className="analytics-hero-copy">
            <p>Total Spent</p>
            <div>
              <strong>{formatCompact(selectedData?.totalCost || 0, 0)}</strong>
              <span>{t("currency")}</span>
            </div>
            <TrendPill value={spendChange} label="vs May" />
          </div>
          <PremiumAreaChart
            values={spendValues}
            labels={spendLabels}
            yLabels={yLabels}
            variant="large"
          />
        </section>

        <div className="analytics-mini-grid">
          <AnalyticsSmallMetric
            icon={Gauge}
            title="Avg. Mileage"
            value={selectedData?.avgEff ? selectedData.avgEff.toFixed(2) : "-"}
            unit="km/L"
            trend={efficiencyChange != null ? { value: efficiencyChange, label: "vs May" } : null}
          />
          <AnalyticsSmallMetric
            icon={RoadIcon}
            title="Total Distance"
            value={formatCompact(selectedData?.distance || 0, 0)}
            unit="km"
            tone="cyan"
            trend={distanceChange != null ? { value: distanceChange, label: "km vs May" } : { value: predictiveDailyDistance, label: t("km_day") }}
          />
        </div>

        <section className="analytics-trend-card">
          <div className="analytics-section-header">
            <div>
              <p>Efficiency Trend <span>km/L</span></p>
              <div>
                <strong>{latestEfficiency ? latestEfficiency.toFixed(2) : "-"}</strong>
                <span>km/L</span>
                {efficiencyChange != null && (
                  <TrendPill value={efficiencyChange} label="vs last month" />
                )}
              </div>
            </div>
            <button type="button" className="analytics-period-pill">
              This Year
              <ChevronDown className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
          <PremiumAreaChart
            values={efficiencyValues}
            labels={efficiencyLabels}
            variant="compact"
            yLabels={["14", "12", "10", "8", "6"]}
          />
        </section>

        <section className="analytics-records-card">
          <div className="analytics-records-header">
            <h2>All-Time Records</h2>
            <button type="button">View all</button>
          </div>
          <div className="analytics-record-grid">
            <RecordCard
              title="Best Efficiency"
              value={bestTrip ? formatEfficiency2Dec(bestTrip.kmPerLiter) : "-"}
              unit="km/L"
              date={bestTrip?.date || "-"}
              icon={Trophy}
              tone="gold"
            />
            <RecordCard
              title="Worst Efficiency"
              value={worstTrip ? formatEfficiency2Dec(worstTrip.kmPerLiter) : "-"}
              unit="km/L"
              date={worstTrip?.date || "-"}
              icon={Trophy}
              tone="red"
            />
            <RecordCard
              title="Tyre Profile"
              value={tyreProfile.main}
              unit={tyreProfile.rim}
              date={tyreProfile.vehicle}
            >
              <TyreVisual />
            </RecordCard>
          </div>
        </section>

        <section className="analytics-level-card">
          <div className="analytics-level-header">
            <h2>Efficiency Level</h2>
            <p>
              Based on latest <strong>{efficiencyThresholds.sampleCount}</strong> samples
            </p>
          </div>
          <div className="analytics-level-body">
            <div>
              <p>Vehicle Baseline</p>
              <strong>
                {efficiencyThresholds.ready ? efficiencyThresholds.baseline.toFixed(2) : "-"}
                <span> km/L</span>
              </strong>
            </div>
            <span className="analytics-good-badge">
              <Leaf className="h-4 w-4" strokeWidth={2} />
              Good
            </span>
          </div>
          <div className="analytics-level-meter" aria-label="Vehicle efficiency level">
            <span style={{ left: `${levelPercent}%` }} />
          </div>
          {efficiencyLevelThresholds.length > 0 && (
            <div className="analytics-level-thresholds" aria-label="Efficiency thresholds">
              {efficiencyLevelThresholds.map((threshold) => (
                <span key={threshold.label}>
                  <strong>{threshold.value.toFixed(2)}</strong>
                  <small>{threshold.label}</small>
                </span>
              ))}
            </div>
          )}
          <div className="analytics-level-labels">
            <span>Poor</span>
            <span>Average</span>
            <span>Good</span>
            <span>Excellent</span>
          </div>
        </section>
      </div>
    </div>
  );
}
