import { useState, useMemo } from "react";
import {
  Pulse,
  TrendUp,
  CurrencyDollar,
  Wrench,
  Warning,
  Bell,
  GearSix,
  Path,
  CaretRight,
  ChartBar,
  TrendUp as TrendUpIcon,
} from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Card, MetricCard, PageWrapper, Modal, cn } from "./ui";
import { useFuel } from "../hooks/useFuelContext";
import {
  calculateTripMetrics,
  calculateAverageDailyDistance,
} from "../utils/calculations";
import { buildMaintenanceForecast } from "../utils/maintenanceForecast";
import {
  calculateEfficiencyThresholds,
  getEfficiencyBarClass,
  getEfficiencyTextClass,
} from "../utils/efficiencyThresholds";
import {
  formatTo2Decimals,
  formatCurrency2Dec,
  formatEfficiency2Dec,
} from "../utils/formatting";
import { useTranslation } from "react-i18next";

export default function Dashboard() {
  const {
    stats,
    activeVehicleFillUps,
    activeVehicleFillUpsByOdometer,
    maintenanceEntries,
    maintenanceSettings,
    categories,
  } = useFuel();
  const { t, i18n } = useTranslation();
  const [predictedModalOpen, setPredictedModalOpen] = useState(false);
  const [selectedMaintenanceDetail, setSelectedMaintenanceDetail] = useState(null);
  const [selectedBarIdx, setSelectedBarIdx] = useState(null);
  const [selectedDotIdx, setSelectedDotIdx] = useState(null);
  const [efficiencyUnit, setEfficiencyUnit] = useState("km_l");
  const isRtl = i18n.language.startsWith("ar");

  const currentOdometer =
    activeVehicleFillUps.length > 0
      ? activeVehicleFillUps[activeVehicleFillUps.length - 1].odometer
      : 0;

  const avgDailyDistance = calculateAverageDailyDistance(activeVehicleFillUps);

  const maintenanceForecast = useMemo(
    () =>
      buildMaintenanceForecast({
        categories,
        entries: maintenanceEntries,
        maintenanceSettings,
        currentOdometer,
        avgDailyDistance,
      }),
    [
      avgDailyDistance,
      categories,
      currentOdometer,
      maintenanceEntries,
      maintenanceSettings,
    ],
  );

  const maintenanceAlerts = maintenanceForecast
    .filter((item) => item.status === "overdue")
    .sort((a, b) => Math.abs(a.remainingKm) - Math.abs(b.remainingKm))
    .slice(0, 3);

  const upcomingMaintenance = maintenanceForecast
    .filter((item) => item.status === "due-soon" && item.projectedDate)
    .sort((a, b) => (a.daysRemaining ?? 999999) - (b.daysRemaining ?? 999999))
    .slice(0, 3);

  const getMaintenanceDetailRows = (item) => {
    if (!item) return [];

    const log = item.latestLog || {};
    const serviceDate = item.date || item.timestamp || log.date || log.timestamp
      ? format(new Date(item.date || item.timestamp || log.date || log.timestamp), "MMM d, yyyy")
      : "-";
    const projectedDate = item.projectedDate
      ? format(item.projectedDate, "MMM d, yyyy")
      : "-";
    const performedOdo = Number(item.performedAtODO ?? log.performedAtODO ?? item.odometer ?? log.odometer ?? 0);
    const interval = Number(item.intervalKm ?? log.intervalKm ?? item.distance ?? log.distance ?? 0);
    const safety = Number(item.safetyMarginKm ?? log.safetyMarginKm ?? item.safety ?? log.safety ?? 0);
    const nextDue = Number(item.nextDueODO ?? log.nextDueODO ?? item.next_due_odometer ?? log.next_due_odometer ?? 0);
    const remainingKm = Math.max(
      0,
      Number(item.kmUntilDue ?? item.remainingKm ?? item.kmRemaining ?? 0),
    );

    return [
      [t("date"), serviceDate],
      [t("odometer"), performedOdo ? `${performedOdo.toLocaleString()} km` : "-"],
      [t("current_mileage"), `${currentOdometer.toLocaleString()} km`],
      [t("distance"), interval ? `${interval.toLocaleString()} km` : "-"],
      [t("safety_margin"), safety ? `${safety.toLocaleString()} km` : "-"],
      [t("next_due"), nextDue ? `${nextDue.toLocaleString()} km` : "-"],
      [t("remaining"), `${remainingKm.toLocaleString()} ${t("km_left")}`],
      [t("due_soon"), projectedDate],
      [t("price"), item.cost != null ? `${Number(item.cost).toFixed(2)} ${t("currency")}` : log.cost != null ? `${Number(log.cost).toFixed(2)} ${t("currency")}` : "-"],
      [t("notes"), item.notes || log.notes || "-"],
    ];
  };

  const efficiencyThresholds = useMemo(
    () => calculateEfficiencyThresholds(activeVehicleFillUpsByOdometer),
    [activeVehicleFillUpsByOdometer],
  );

  const avgKmL =
    stats.avgKmPerLiter > 0
      ? formatTo2Decimals(stats.avgKmPerLiter).toFixed(2)
      : "-";
  const avgKm20L =
    stats.avgKmPerLiter > 0
      ? formatTo2Decimals(stats.avgKmPerLiter * 20).toFixed(2)
      : "-";
  const avgL100 =
    stats.avgL100km > 0 ? formatTo2Decimals(stats.avgL100km).toFixed(2) : "-";
  const displayedEfficiency =
    efficiencyUnit === "km_20l" ? avgKm20L : avgKmL;
  const displayedEfficiencyLabel =
    efficiencyUnit === "km_20l" ? t("avg_km_20l_short") : t("avg_km_l_short");

  // --- Widget Data: Monthly Spending (last 6 months) ---
  const monthlySpending = useMemo(() => {
    if (activeVehicleFillUps.length === 0) return [];
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth(), total: 0, label: format(d, 'MMM') });
    }
    activeVehicleFillUps.forEach(f => {
      const fd = new Date(f.timestamp);
      const match = months.find(m => m.year === fd.getFullYear() && m.month === fd.getMonth());
      if (match) match.total += f.liters * (f.pricePerLiter || 0);
    });
    return months;
  }, [activeVehicleFillUps]);

  // --- Widget Data: Efficiency Trend (last 10 fill-ups) ---
  const efficiencyTrend = useMemo(() => {
    if (activeVehicleFillUps.length < 2) return [];
    const points = [];
    for (let i = 1; i < activeVehicleFillUps.length; i++) {
      const m = calculateTripMetrics(activeVehicleFillUps, i);
      if (m.kmPerLiter > 0) points.push({ index: i, value: m.kmPerLiter });
    }
    return points.slice(-10);
  }, [activeVehicleFillUps]);

  // --- Widget Data: Cost per KM ---
  const costPerKm = useMemo(() => {
    if (stats.totalDistance > 0 && stats.totalCost > 0) {
      return formatTo2Decimals(stats.totalCost / stats.totalDistance);
    }
    return 0;
  }, [stats]);

  return (
    <div className="flex flex-col min-h-[calc(100vh-180px)] overflow-hidden">
      <PageWrapper className="flex-1 flex flex-col min-h-0 space-y-6 overflow-x-hidden">
        <div className="flex-shrink-0 pt-1">
          <div className="mb-4">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
              {t("overview")}
            </h1>
          </div>

          <section className="grid grid-cols-2 gap-3 mb-6">
            <MetricCard
              as="button"
              type="button"
              onClick={() =>
                setEfficiencyUnit((current) =>
                  current === "km_l" ? "km_20l" : "km_l",
                )
              }
              aria-label={t("toggle_efficiency_metric")}
              className="flex flex-col justify-between min-h-[120px] p-4 text-start transition-transform active:scale-[0.98]"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Pulse weight="duotone" className="w-3 h-3 text-emerald-500" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                  {displayedEfficiencyLabel}
                </span>
              </div>
              <span
                className={`text-4xl font-bold tracking-tighter ${getEfficiencyTextClass(stats.avgKmPerLiter, efficiencyThresholds)}`}
              >
                {displayedEfficiency}
              </span>
            </MetricCard>

            <MetricCard
              variant="secondary"
              className="flex flex-col justify-between min-h-[120px] p-4"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <TrendUp weight="duotone" className="w-3 h-3 text-blue-500" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                  {t('l_100km_short')}
                </span>
              </div>
              <span className="text-4xl font-bold text-slate-900 dark:text-white tracking-tighter">
                {avgL100}
              </span>
            </MetricCard>

            <MetricCard className="flex flex-col justify-between min-h-[120px] p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <CurrencyDollar weight="duotone" className="w-3 h-3 text-indigo-500" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                  {t("total_spent")}
                </span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-slate-900 dark:text-white tracking-tighter">
                  {formatCurrency2Dec(stats.totalCost, "").replace("L.E ", "")}
                </span>
                <span className="text-[10px] font-medium text-slate-500">
                  {t('currency')}
                </span>
              </div>
            </MetricCard>

            <MetricCard
              variant="secondary"
              className="flex flex-col justify-between min-h-[120px] p-4"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <CurrencyDollar weight="duotone" className="w-3 h-3 text-indigo-500" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                  {t("cost_per_km")}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-bold text-slate-900 dark:text-white tracking-tighter">
                  {costPerKm.toFixed(2)}
                </span>
                <span className="text-[10px] font-medium text-slate-500">
                  {t("currency")}/km
                </span>
              </div>
            </MetricCard>
          </section>

          {(maintenanceAlerts.length > 0 || upcomingMaintenance.length > 0) && (
            <div className="grid grid-cols-1 gap-2 mb-6">
              {maintenanceAlerts.length > 0 && (
                <Link
                  to="/maintenance"
                  className="w-full flex items-center justify-between p-3 bg-red-500/10 dark:bg-red-500/20 border border-red-500/20 rounded-2xl"
                >
                  <div className="flex items-center gap-2">
                    <Bell weight="duotone" className="w-4 h-4 text-red-500" />
                    <span className="text-xs font-bold text-red-600 dark:text-red-400">
                      {maintenanceAlerts.length} {t("overdue_excl")}
                    </span>
                  </div>
                  <CaretRight weight="duotone"
                    className={cn(
                      "w-4 h-4 text-red-400",
                      isRtl && "rotate-180",
                    )}
                  />
                </Link>
              )}
              {upcomingMaintenance.length > 0 && (
                <button
                  onClick={() => setPredictedModalOpen(true)}
                  className="w-full flex items-center justify-between p-3 bg-blue-500/10 dark:bg-blue-500/20 border border-blue-500/20 rounded-2xl"
                >
                  <div className="flex items-center gap-2">
                    <Path weight="duotone" className="w-4 h-4 text-blue-500" />
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                        {t("due_soon")}: {t(upcomingMaintenance[0].categoryId)}
                      </span>
                      <span className="text-[10px] text-blue-500/70 dark:text-blue-400/50 font-medium">
                        {avgDailyDistance.toFixed(1)} {t('km_day')} {t('predicted')}
                      </span>
                    </div>
                  </div>
                  <CaretRight weight="duotone"
                    className={cn(
                      "w-4 h-4 text-blue-400",
                      isRtl && "rotate-180",
                    )}
                  />
                </button>
              )}
            </div>
          )}

          {/* --- Insights Widgets --- */}
          {activeVehicleFillUps.length >= 2 && (
            <section className="space-y-3 mb-6 overflow-x-hidden">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight px-1">
                {t('insights') || 'Insights'}
              </h2>

              {/* Monthly Spending Bar Chart */}
              {monthlySpending.length > 0 && monthlySpending.some(m => m.total > 0) && (
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <ChartBar weight="duotone" className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                        {t('monthly_spending')}
                      </span>
                    </div>
                    {selectedBarIdx !== null && monthlySpending[selectedBarIdx] && (
                      <span className="text-xs font-black text-emerald-500 animate-pulse">
                        {formatTo2Decimals(monthlySpending[selectedBarIdx].total).toFixed(0)} {t('currency')}
                      </span>
                    )}
                  </div>
                  {(() => {
                    const maxVal = Math.max(...monthlySpending.map(m => m.total), 1);
                    const chartH = 80;
                    const maxBarW = 32;
                    const minGap = 8;
                    const maxTotalW = 400; // Maximum width before scaling
                    const idealTotalW = monthlySpending.length * (maxBarW + minGap) - minGap;
                    const scale = Math.min(1, maxTotalW / idealTotalW);
                    const barW = maxBarW * scale;
                    const gap = minGap * scale;
                    const totalW = monthlySpending.length * (barW + gap) - gap;
                    return (
                      <div className="w-full overflow-x-auto no-scrollbar">
                        <div className="flex justify-center min-w-full">
                          <svg width={totalW} height={chartH + 22} viewBox={`0 0 ${totalW} ${chartH + 22}`} style={{ maxWidth: totalW }}>
                          {monthlySpending.map((m, i) => {
                            const barH = maxVal > 0 ? (m.total / maxVal) * chartH : 0;
                            const x = i * (barW + gap);
                            const isCurrentMonth = i === monthlySpending.length - 1;
                            const isSelected = selectedBarIdx === i;
                            return (
                              <g key={i} onClick={() => setSelectedBarIdx(isSelected ? null : i)} style={{ cursor: 'pointer' }}>
                                {/* Invisible wider tap target */}
                                <rect x={x - 4} y={0} width={barW + 8} height={chartH + 22} fill="transparent" />
                                <rect
                                  x={x} y={chartH - barH} width={barW} height={Math.max(barH, 3)}
                                  rx={6}
                                  fill={isSelected ? '#10b981' : isCurrentMonth ? '#10b981cc' : '#10b98140'}
                                  className="transition-all duration-300"
                                />
                                {isSelected && barH > 10 && (
                                  <text x={x + barW / 2} y={chartH - barH - 6} textAnchor="middle" className="fill-emerald-500" style={{ fontSize: `${9 * scale}px`, fontWeight: 800 }}>
                                    {formatTo2Decimals(m.total).toFixed(0)}
                                  </text>
                                )}
                                <text x={x + barW / 2} y={chartH + 14} textAnchor="middle" style={{ fontSize: `${9 * scale}px`, fontWeight: isSelected ? 800 : 600, fill: isSelected ? '#10b981' : '#94a3b8' }}>
                                  {m.label}
                                </text>
                              </g>
                            );
                          })}
                        </svg>
                        </div>
                      </div>
                    );
                  })()}
                </Card>
              )}

              {/* Efficiency Trend Sparkline */}
              {efficiencyTrend.length >= 3 && (
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <TrendUpIcon weight="duotone" className="w-3.5 h-3.5 text-blue-500" />
                      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                        {t('efficiency_trend')}
                      </span>
                    </div>
                    {selectedDotIdx !== null && efficiencyTrend[selectedDotIdx] ? (
                      <span className="text-xs font-black text-emerald-500">
                        {efficiencyTrend[selectedDotIdx].value.toFixed(2)} {t('avg_km_l_short')}
                      </span>
                    ) : (
                      <span className="text-[9px] font-medium text-slate-500">
                        {t('last_n_fillups', { count: efficiencyTrend.length })}
                      </span>
                    )}
                  </div>
                  {(() => {
                    const values = efficiencyTrend.map(p => p.value);
                    const minV = Math.min(...values) * 0.9;
                    const maxV = Math.max(...values) * 1.1;
                    const range = maxV - minV || 1;
                    const maxW = 320;
                    const h = 60;
                    const points = values.map((v, i) => {
                      const x = (i / (values.length - 1)) * maxW;
                      const y = h - ((v - minV) / range) * h;
                      return { x, y, value: v };
                    });
                    const linePath = `M${points.map(p => `${p.x},${p.y}`).join(' L')}`;
                    const areaPath = `${linePath} L${maxW},${h} L0,${h} Z`;
                    return (
                      <div className="w-full overflow-x-auto no-scrollbar">
                        <div className="flex justify-center min-w-full">
                          <svg width={maxW} height={h + 10} viewBox={`-4 -4 ${maxW + 8} ${h + 18}`} style={{ maxWidth: maxW }}>
                          <defs>
                            <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          <path d={areaPath} fill="url(#sparkGrad)" />
                          <path d={linePath} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          {points.map((p, i) => {
                            const isSelected = selectedDotIdx === i;
                            return (
                              <g key={i} onClick={() => setSelectedDotIdx(isSelected ? null : i)} style={{ cursor: 'pointer' }}>
                                {/* Wider tap target */}
                                <circle cx={p.x} cy={p.y} r={12} fill="transparent" />
                                {/* Visible dot */}
                                <circle cx={p.x} cy={p.y} r={isSelected ? 5 : 2.5} fill={isSelected ? '#10b981' : '#10b981'} className="transition-all duration-200" />
                                {isSelected && (
                                  <circle cx={p.x} cy={p.y} r={8} fill="none" stroke="#10b981" strokeWidth="1.5" opacity="0.4" />
                                )}
                                {isSelected && (
                                  <text x={p.x} y={p.y - 12} textAnchor="middle" style={{ fontSize: '10px', fontWeight: 800, fill: '#10b981' }}>
                                    {p.value.toFixed(2)}
                                  </text>
                                )}
                              </g>
                            );
                          })}
                        </svg>
                        </div>
                      </div>
                    );
                  })()}
                </Card>
              )}
            </section>
          )}
        </div>

        <section className="flex flex-col min-h-0 h-[250px] lg:h-[250px]">
          <div className="flex items-center justify-between mb-3 px-1 flex-shrink-0">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
              {t("history")}
            </h2>
            <Link
              to="/history"
              className="text-xs font-medium text-emerald-500 dark:text-emerald-400"
            >
              {isRtl ? "عرض التفاصيل" : "See Details"}
            </Link>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar pb-4">
            <ul className="space-y-2">
              {activeVehicleFillUps
                .slice()
                .reverse()
                .map((fill) => {
                  const originalIndex = activeVehicleFillUps.findIndex(
                    (f) => f.id === fill.id,
                  );
                  const metrics = calculateTripMetrics(
                    activeVehicleFillUps,
                    originalIndex,
                  );
                  return (
                    <li
                      key={fill.id}
                      className="bg-white dark:bg-white/[0.03] rounded-2xl p-4 flex items-center justify-between shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-1 h-6 rounded-full ${metrics.distance > 0 ? getEfficiencyBarClass(metrics.kmPerLiter, efficiencyThresholds) : "bg-slate-600"}`}
                        ></div>
                        <div>
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            {format(new Date(fill.timestamp), "MMM d")}
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            {fill.odometer.toLocaleString()} km
                          </p>
                        </div>
                      </div>
                      <div className="text-end">
                        <p className="text-sm font-bold text-slate-900 dark:text-white">
                          {formatCurrency2Dec(metrics.tripCost, "").replace(
                            "L.E ",
                            "",
                          )}{" "}
                          <span className="text-[10px] text-slate-500">
                            {t('currency')}
                          </span>
                        </p>
                        <p
                          className={`text-[10px] font-bold mt-0.5 ${getEfficiencyTextClass(metrics.kmPerLiter, efficiencyThresholds)}`}
                        >
                          {formatEfficiency2Dec(metrics.kmPerLiter)}
                        </p>
                      </div>
                    </li>
                  );
                })}
            </ul>
          </div>
        </section>

        <Modal
          isOpen={predictedModalOpen}
          onClose={() => {
            setPredictedModalOpen(false);
            setSelectedMaintenanceDetail(null);
          }}
          title={
            selectedMaintenanceDetail
              ? t(selectedMaintenanceDetail.categoryId)
              : t("due_soon")
          }
        >
          <div className="space-y-2 p-1">
            {selectedMaintenanceDetail ? (
              <>
                <button
                  type="button"
                  onClick={() => setSelectedMaintenanceDetail(null)}
                  className="mb-2 text-xs font-bold uppercase text-blue-600 dark:text-blue-400"
                >
                  {t("back")}
                </button>
                <div className="space-y-2">
                  {getMaintenanceDetailRows(selectedMaintenanceDetail).map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-start justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-white/[0.04]"
                    >
                      <span className="text-xs font-bold text-slate-500">{label}</span>
                      <span className="max-w-[60%] text-end text-sm font-bold text-slate-900 dark:text-white">
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              upcomingMaintenance.map((item) => {
                const remainingKm = Math.max(
                  0,
                  Number(item.kmUntilDue ?? item.remainingKm ?? item.kmRemaining ?? 0),
                );

                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => setSelectedMaintenanceDetail(item)}
                    className="w-full rounded-2xl p-4 text-start bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 transition-transform active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-1.5 h-10 rounded-full"
                        style={{ backgroundColor: item.categoryColor }}
                      />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-blue-700 dark:text-blue-400">
                          {t(item.categoryId)}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {remainingKm.toLocaleString()} {t("km_left")}
                        </p>
                      </div>
                      <div className="text-end text-xs font-bold text-blue-600 dark:text-blue-400">
                        {format(item.projectedDate, "MMM d")}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </Modal>
      </PageWrapper>
    </div>
  );
}
