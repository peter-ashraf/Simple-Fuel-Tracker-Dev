import { useFuel } from '../hooks/useFuelContext';
import { Card, MetricCard, PageWrapper, cn } from './ui';
import { calculateAverageDailyDistance, calculateTripMetrics } from '../utils/calculations';
import { format } from 'date-fns';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Trophy, 
  Warning, 
  Circle, 
  TrendUp, 
  Wallet, 
  CaretLeft, 
  CaretRight, 
  CalendarBlank, 
  Pulse, 
  Gauge, 
  CurrencyDollar, 
  CaretDown 
} from '@phosphor-icons/react';
import { useCallback, useState, useMemo, useRef, useEffect } from 'react';
import { formatEfficiency2Dec } from '../utils/formatting';
import { calculateEfficiencyThresholds } from '../utils/efficiencyThresholds';
import { useTranslation } from 'react-i18next';
import chartjsPluginAnnotation from 'chartjs-plugin-annotation';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler, chartjsPluginAnnotation);

const MotionDiv = motion.div;

export default function Analytics() {
  const { activeVehicleFillUps, activeVehicle } = useFuel();
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language.startsWith('ar');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [activeGraphIndex, setActiveGraphIndex] = useState(0);
  const graphDropdownRef = useRef(null);
  const [isGraphDropdownOpen, setIsGraphDropdownOpen] = useState(false);
  const [expandedHealthIssueIds, setExpandedHealthIssueIds] = useState([]);

  const formatMonthLabel = useCallback((dateStr) => {
    const d = new Date(dateStr + '-01');
    const monthName = t(format(d, 'MMMM'));
    const year = format(d, 'yyyy');
    return `${monthName} ${year}`;
  }, [t]);

  const monthlyGroups = useMemo(() => {
    const groups = {};
    activeVehicleFillUps.forEach((fill, index) => {
      const date = new Date(fill.timestamp);
      const key = format(date, 'yyyy-MM');
      if (!groups[key]) groups[key] = { key, fills: [], totalCost: 0, totalLiters: 0, distance: 0 };
      groups[key].fills.push({ fill, index });
      groups[key].totalCost += fill.liters * (fill.pricePerLiter || 0);
      groups[key].totalLiters += fill.liters;
      if (index > 0) {
        const prevFill = activeVehicleFillUps[index - 1];
        if (prevFill.vehicleId === fill.vehicleId) groups[key].distance += (fill.odometer - prevFill.odometer);
      }
    });
    return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key));
  }, [activeVehicleFillUps]);

  const yearsWithMonths = useMemo(() => {
    const years = {};
    monthlyGroups.forEach(group => {
      const year = group.key.split('-')[0];
      if (!years[year]) years[year] = [];
      years[year].push(group);
    });
    return Object.entries(years).sort((a, b) => b[0].localeCompare(a[0]));
  }, [monthlyGroups]);

  const selectedData = useMemo(() => {
    if (monthlyGroups.length === 0) return null;
    const group = monthlyGroups.find(g => g.key === selectedMonth) || monthlyGroups[0];
    if (!group) return null;
    const avgEff = group.distance > 0 && group.totalLiters > 0 ? group.distance / group.totalLiters : 0;
    const costPerKm = group.distance > 0 ? group.totalCost / group.distance : 0;
    return { ...group, avgEff, costPerKm, monthLabel: formatMonthLabel(group.key) };
  }, [monthlyGroups, selectedMonth, formatMonthLabel]);

  const [isMonthDropdownOpen, setIsMonthDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setIsMonthDropdownOpen(false);
      if (graphDropdownRef.current && !graphDropdownRef.current.contains(event.target)) setIsGraphDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (activeVehicleFillUps.length < 2) {
    return <PageWrapper className="py-20 text-center"><p className="text-slate-500 font-medium">{t('untracked')}</p></PageWrapper>;
  }

  const tripData = activeVehicleFillUps.map((fill, index) => ({
    date: format(new Date(fill.timestamp), 'MMM d'),
    ...calculateTripMetrics(activeVehicleFillUps, index)
  })).slice(1);

  const sortedByEfficiency = [...tripData].sort((a,b) => b.kmPerLiter - a.kmPerLiter);
  const bestTrip = sortedByEfficiency[0];
  const worstTrip = sortedByEfficiency[sortedByEfficiency.length - 1];
  const efficiencyThresholds = calculateEfficiencyThresholds(activeVehicleFillUps);
  const predictiveDailyDistance = calculateAverageDailyDistance(activeVehicleFillUps);
  const dataHealth = (() => {
    const sortedByDate = [...activeVehicleFillUps].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const issues = [];
    const dateCounts = sortedByDate.reduce((counts, fill) => {
      const dateKey = format(new Date(fill.timestamp), 'yyyy-MM-dd');
      counts[dateKey] = (counts[dateKey] || 0) + 1;
      return counts;
    }, {});
    const duplicateDateCount = Object.values(dateCounts).filter((count) => count > 1).length;
    const missingPriceCount = sortedByDate.filter((fill) => !Number(fill.pricePerLiter)).length;
    const invalidVolumeCount = sortedByDate.filter((fill) => Number(fill.liters) <= 0).length;
    const odometerReversalCount = sortedByDate.filter((fill, index) => index > 0 && Number(fill.odometer) < Number(sortedByDate[index - 1].odometer)).length;
    const suspiciousEfficiencyCount = tripData.filter((trip) => trip.kmPerLiter > 0 && (trip.kmPerLiter < 4 || trip.kmPerLiter > 30)).length;
    const partialFillCount = sortedByDate.filter((fill) => fill.isPartial || fill.partialFill).length;

    if (duplicateDateCount > 0) {
      issues.push({
        id: "duplicate-dates",
        title: `${duplicateDateCount} date${duplicateDateCount === 1 ? '' : 's'} have multiple fill-ups`,
        details: Object.entries(dateCounts)
          .filter(([, count]) => count > 1)
          .map(([date, count]) => `${date}: ${count} fill-ups`),
      });
    }
    if (missingPriceCount > 0) {
      issues.push({
        id: "missing-price",
        title: `${missingPriceCount} fill-up${missingPriceCount === 1 ? '' : 's'} missing price`,
        details: sortedByDate
          .filter((fill) => !Number(fill.pricePerLiter))
          .map((fill) => `${format(new Date(fill.timestamp), 'yyyy-MM-dd')} · ${Number(fill.odometer || 0).toLocaleString()} km`),
      });
    }
    if (invalidVolumeCount > 0) {
      issues.push({
        id: "invalid-liters",
        title: `${invalidVolumeCount} fill-up${invalidVolumeCount === 1 ? '' : 's'} with invalid liters`,
        details: sortedByDate
          .filter((fill) => Number(fill.liters) <= 0)
          .map((fill) => `${format(new Date(fill.timestamp), 'yyyy-MM-dd')} · ${Number(fill.odometer || 0).toLocaleString()} km`),
      });
    }
    if (odometerReversalCount > 0) {
      issues.push({
        id: "odometer-reversal",
        title: `${odometerReversalCount} odometer reversal${odometerReversalCount === 1 ? '' : 's'} by date order`,
        details: sortedByDate
          .filter((fill, index) => index > 0 && Number(fill.odometer) < Number(sortedByDate[index - 1].odometer))
          .map((fill) => `${format(new Date(fill.timestamp), 'yyyy-MM-dd')} · ${Number(fill.odometer || 0).toLocaleString()} km`),
      });
    }
    if (suspiciousEfficiencyCount > 0) {
      issues.push({
        id: "suspicious-efficiency",
        title: `${suspiciousEfficiencyCount} unusual efficiency result${suspiciousEfficiencyCount === 1 ? '' : 's'}`,
        details: tripData
          .filter((trip) => trip.kmPerLiter > 0 && (trip.kmPerLiter < 4 || trip.kmPerLiter > 30))
          .map((trip) => `${trip.date} · ${formatEfficiency2Dec(trip.kmPerLiter)} km/L`),
      });
    }
    if (partialFillCount > 0) {
      issues.push({
        id: "partial-fill",
        title: `${partialFillCount} partial fill-up${partialFillCount === 1 ? '' : 's'} may affect averages`,
        details: sortedByDate
          .filter((fill) => fill.isPartial || fill.partialFill)
          .map((fill) => `${format(new Date(fill.timestamp), 'yyyy-MM-dd')} · ${Number(fill.odometer || 0).toLocaleString()} km`),
      });
    }

    return {
      status: issues.length === 0 ? 'good' : issues.length <= 2 ? 'review' : 'attention',
      issues,
    };
  })();

  const toggleHealthIssue = (issueId) => {
    setExpandedHealthIssueIds((current) =>
      current.includes(issueId)
        ? current.filter((id) => id !== issueId)
        : [...current, issueId],
    );
  };

  const graphs = [
    { id: 'efficiency', title: t('efficiency_history'), subtitle: t('km_per_liter_over_time'), icon: TrendUp, color: 'emerald', data: tripData.map(t => t.kmPerLiter), labels: tripData.map(t => t.date) },
    { id: 'spending', title: t('monthly_spending'), subtitle: t('total_spent'), icon: Wallet, color: 'blue', data: monthlyGroups.map(g => g.totalCost).reverse(), labels: monthlyGroups.map(g => format(new Date(g.key + '-01'), 'MMM yy')).reverse() },
    { id: 'price', title: t('fuel_price_evolution'), subtitle: t('price'), icon: CurrencyDollar, color: 'indigo', data: activeVehicleFillUps.map(f => f.pricePerLiter), labels: activeVehicleFillUps.map(f => format(new Date(f.timestamp), 'MMM d')) },
    { id: 'costs', title: t('trip_cost_distribution'), subtitle: t('total_spent'), icon: Pulse, color: 'violet', data: tripData.map(t => t.tripCost), labels: tripData.map(t => t.date) },
  ];

  const paginate = (newIndex) => {
    setActiveGraphIndex(newIndex);
  };

  const currentGraph = graphs[activeGraphIndex];

  return (
    <PageWrapper className="space-y-8 pb-10">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{t('analytics')}</h2>
        <div className="bg-emerald-500/10 px-3 py-1 rounded-full">
          <span className="text-[10px] font-bold text-emerald-600 uppercase">{activeVehicle?.name || t('active_vehicle')}</span>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarBlank weight="duotone" className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-bold">{t('monthly_insights')}</h3>
          </div>
          
          <div className="relative" ref={dropdownRef}>
            <button onClick={() => setIsMonthDropdownOpen(!isMonthDropdownOpen)} className="flex items-center gap-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-full px-4 py-2 text-[10px] font-bold shadow-sm">
              <span>{selectedData?.monthLabel}</span>
              <CaretDown weight="duotone" size={14} className={cn("text-slate-400 transition-transform", isMonthDropdownOpen && "rotate-180")} />
            </button>
            <AnimatePresence>
              {isMonthDropdownOpen && (
                <MotionDiv initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className={cn("absolute top-full mt-2 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl z-50", isRtl ? "left-0" : "right-0")}>
                  <div className="p-1 max-h-60 overflow-y-auto no-scrollbar">
                    {yearsWithMonths.map(([year, months]) => (
                      <div key={year}>
                        <div className="px-3 py-1 text-[9px] font-black text-slate-400 uppercase tracking-widest">{year}</div>
                        {months.map(g => (
                          <button key={g.key} onClick={() => { setSelectedMonth(g.key); setIsMonthDropdownOpen(false); }} className={cn("w-full text-start px-3 py-2 rounded-xl text-xs font-bold", selectedMonth === g.key ? "bg-emerald-500 text-white" : "hover:bg-slate-50 dark:hover:bg-white/5")}>
                            {t(format(new Date(g.key + '-01'), 'MMMM'))}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </MotionDiv>
              )}
            </AnimatePresence>
          </div>
        </div>

        {selectedData && (
          <div className="grid grid-cols-2 gap-3">
             <div className="col-span-2 relative overflow-hidden bg-gradient-to-br from-emerald-500 to-teal-600 rounded-[2rem] p-6 text-white shadow-xl">
                <div className="relative z-10">
                   <p className="text-[10px] font-bold uppercase opacity-80 mb-1">{selectedData.monthLabel} {t('spend')}</p>
                   <div className="flex items-baseline gap-2">
                      <span className="text-5xl font-black">{selectedData.totalCost.toFixed(0)}</span>
                      <span className="text-sm font-bold opacity-80">EGP</span>
                   </div>
                   <div className="flex items-center gap-4 mt-6">
                      <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl"><Pulse weight="duotone" size={14}/> <span className="text-xs font-bold">{selectedData.fills.length} {t('trips')}</span></div>
                      <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl"><TrendUp weight="duotone" size={14}/> <span className="text-xs font-bold">{formatEfficiency2Dec(selectedData.avgEff)}</span></div>
                   </div>
                </div>
             </div>
             <div className="bg-white dark:bg-white/5 rounded-3xl p-5 border border-slate-200 dark:border-white/10">
                <div className="flex items-center gap-2 mb-3"><CurrencyDollar weight="duotone" className="w-4 h-4 text-indigo-500"/><p className="text-[10px] font-bold text-slate-400 uppercase">{t('cost_per_km')}</p></div>
                <div className="flex items-baseline gap-1"><span className="text-2xl font-bold">{selectedData.costPerKm.toFixed(2)}</span><span className="text-[10px] text-slate-500">EGP</span></div>
             </div>
             <div className="bg-white dark:bg-white/5 rounded-3xl p-5 border border-slate-200 dark:border-white/10">
                <div className="flex items-center gap-2 mb-3"><Gauge weight="duotone" className="w-4 h-4 text-amber-500"/><p className="text-[10px] font-bold text-slate-400 uppercase">{t('distance')}</p></div>
                <div className="flex items-baseline gap-1"><span className="text-2xl font-bold">{selectedData.distance.toLocaleString()}</span><span className="text-[10px] text-slate-500">KM</span></div>
             </div>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Trophy weight="duotone" className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-bold">{t('all_time_records')}</h3>
        </div>
        <div className="grid grid-cols-3 gap-3">
           <MetricCard variant="default" className="flex flex-col gap-2 p-4 border border-emerald-500/10">
              <span className="text-[9px] font-bold uppercase text-slate-400">{t('best_efficiency')}</span>
              <p className="text-2xl font-bold text-slate-900 dark:text-white tracking-tighter">{formatEfficiency2Dec(bestTrip.kmPerLiter)}</p>
              <p className="text-[10px] text-slate-500">{bestTrip.date}</p>
           </MetricCard>
           <MetricCard variant="secondary" className="flex flex-col gap-2 p-4 border border-red-500/10">
              <span className="text-[9px] font-bold uppercase text-slate-400">{t('worst_efficiency')}</span>
              <p className="text-2xl font-bold text-slate-900 dark:text-white tracking-tighter">{formatEfficiency2Dec(worstTrip.kmPerLiter)}</p>
              <p className="text-[10px] text-slate-500">{worstTrip.date}</p>
           </MetricCard>
           <MetricCard variant="default" className="flex flex-col gap-2 p-4 border border-indigo-500/10">
              <span className="text-[9px] font-bold uppercase text-slate-400">{t('tyre_profile')}</span>
              <p className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                {activeVehicle?.tyreSize ? `${activeVehicle.tyreSize.width}/${activeVehicle.tyreSize.aspectRatio} R${activeVehicle.tyreSize.rimSize}` : '-'}
              </p>
              <p className="text-[10px] text-slate-500 truncate">{activeVehicle?.name}</p>
           </MetricCard>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Gauge weight="duotone" className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-bold">{t('efficiency_levels')}</h3>
        </div>

        <Card className="p-5">
          {efficiencyThresholds.ready ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {t('vehicle_baseline')}
                  </p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white">
                    {efficiencyThresholds.baseline.toFixed(2)} km/L
                  </p>
                </div>
                <div className="text-end">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {t('samples_used')}
                  </p>
                  <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                    {efficiencyThresholds.sampleCount}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl bg-red-50 dark:bg-red-500/10 p-3 border border-red-100 dark:border-red-500/20">
                  <p className="text-[9px] font-black uppercase text-red-500 mb-1">
                    {t('low_level')}
                  </p>
                  <p className="text-xs font-bold text-red-700 dark:text-red-300">
                    &lt; {efficiencyThresholds.low.toFixed(2)}
                  </p>
                </div>
                <div className="rounded-2xl bg-amber-50 dark:bg-amber-500/10 p-3 border border-amber-100 dark:border-amber-500/20">
                  <p className="text-[9px] font-black uppercase text-amber-500 mb-1">
                    {t('normal_level')}
                  </p>
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
                    {efficiencyThresholds.low.toFixed(2)}-{efficiencyThresholds.high.toFixed(2)}
                  </p>
                </div>
                <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 p-3 border border-emerald-100 dark:border-emerald-500/20">
                  <p className="text-[9px] font-black uppercase text-emerald-500 mb-1">
                    {t('efficient_level')}
                  </p>
                  <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    ≥ {efficiencyThresholds.high.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {t('thresholds_learning')}
              </p>
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {t('thresholds_learning_description', {
                  count: efficiencyThresholds.sampleCount,
                  required: efficiencyThresholds.minSampleSize,
                })}
              </p>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {t('predictive_daily_distance')}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('predictive_daily_distance_description')}
              </p>
            </div>
            <div className="text-end">
              <p className="text-2xl font-black text-slate-900 dark:text-white">
                {predictiveDailyDistance > 0 ? predictiveDailyDistance.toFixed(1) : '-'}
              </p>
              <p className="text-[10px] font-bold uppercase text-slate-400">
                {t('km_day')}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Data Health
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Quick checks for entries that can distort stats, forecasts, or sync review.
              </p>
            </div>
            <span
              className={cn(
                "rounded-full px-3 py-1 text-[10px] font-black uppercase",
                dataHealth.status === 'good'
                  ? "bg-emerald-500/10 text-emerald-500"
                  : dataHealth.status === 'review'
                    ? "bg-amber-500/10 text-amber-500"
                    : "bg-red-500/10 text-red-500",
              )}
            >
              {dataHealth.status === 'good' ? 'Good' : dataHealth.status === 'review' ? 'Review' : 'Attention'}
            </span>
          </div>
          {dataHealth.issues.length === 0 ? (
            <div className="mt-4 flex items-center gap-2 rounded-2xl bg-emerald-500/10 p-3 text-xs font-bold text-emerald-600 dark:text-emerald-300">
              <Circle weight="fill" className="h-2 w-2" />
              No obvious data issues found for this vehicle.
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {dataHealth.issues.map((issue) => {
                const isExpanded = expandedHealthIssueIds.includes(issue.id);

                return (
                  <div
                    key={issue.id}
                    className="rounded-2xl bg-slate-50 text-xs font-bold text-slate-600 dark:bg-white/[0.04] dark:text-slate-300"
                  >
                    <button
                      type="button"
                      onClick={() => toggleHealthIssue(issue.id)}
                      className="flex w-full items-start gap-2 p-3 text-start"
                    >
                      <Warning weight="duotone" className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      <span className="flex-1">{issue.title}</span>
                      <CaretDown
                        weight="bold"
                        className={cn(
                          "mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform",
                          isExpanded && "rotate-180",
                        )}
                      />
                    </button>
                    {isExpanded && (
                      <div className="border-t border-slate-200 px-4 pb-3 pt-2 dark:border-white/10">
                        <div className="max-h-32 space-y-1 overflow-y-auto pr-1">
                          {issue.details.map((detail) => (
                            <p
                              key={detail}
                              className="rounded-xl bg-white px-3 py-2 text-[11px] font-semibold text-slate-500 dark:bg-slate-950/40 dark:text-slate-400"
                            >
                              {detail}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </section>

      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Pulse weight="duotone" className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-bold">{t('trends_visualization')}</h3>
          </div>
          
          <div className="relative" ref={graphDropdownRef}>
            <button onClick={() => setIsGraphDropdownOpen(!isGraphDropdownOpen)} className="flex items-center gap-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-full px-4 py-2 text-[10px] font-bold shadow-sm">
              <span>{currentGraph.title}</span>
              <CaretDown weight="duotone" size={14} className={cn("text-slate-400 transition-transform", isGraphDropdownOpen && "rotate-180")} />
            </button>
            <AnimatePresence>
              {isGraphDropdownOpen && (
                <MotionDiv initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className={cn("absolute top-full mt-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl z-50", isRtl ? "left-0" : "right-0")}>
                  <div className="p-1">
                    {graphs.map((g, idx) => {
                      const Icon = g.icon;
                      return (
                        <button key={g.id} onClick={() => { paginate(idx); setIsGraphDropdownOpen(false); }} className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-start", activeGraphIndex === idx ? "bg-emerald-500 text-white" : "hover:bg-slate-50 dark:hover:bg-white/5")}>
                          <Icon size={16}/> <div><p className="text-xs font-bold">{g.title}</p><p className="text-[9px] opacity-70">{g.subtitle}</p></div>
                        </button>
                      );
                    })}
                  </div>
                </MotionDiv>
              )}
            </AnimatePresence>
          </div>
        </div>
        
        <div className="relative min-h-[350px]">
           <Card className="p-6 h-full">
              <div className="flex items-center gap-3 mb-8">
                 <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center", `bg-${currentGraph.color}-500/10 text-${currentGraph.color}-500`)}>
                    <currentGraph.icon size={20} />
                 </div>
                 <div>
                    <h3 className="text-base font-bold">{currentGraph.title}</h3>
                    <p className="text-[10px] font-bold uppercase opacity-50">{currentGraph.subtitle}</p>
                 </div>
              </div>
              
              <div className="h-[200px]">
                 {currentGraph.id === 'spending' || currentGraph.id === 'costs' ? (
                   <Bar options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} data={{ labels: currentGraph.labels, datasets: [{ data: currentGraph.data, backgroundColor: '#10b981', borderRadius: 4 }] }} />
                 ) : (
                   <Line options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} data={{ labels: currentGraph.labels, datasets: [{ data: currentGraph.data, borderColor: '#10b981', tension: 0.4, fill: false }] }} />
                 )}
              </div>

              <div className="flex justify-center gap-1.5 mt-8">
                 {graphs.map((_, idx) => (
                    <button key={idx} onClick={() => paginate(idx)} className={cn("h-1 rounded-full transition-all", activeGraphIndex === idx ? "w-6 bg-emerald-500" : "w-2 bg-slate-200 dark:bg-white/10")} />
                 ))}
              </div>
           </Card>
           
           <button onClick={() => paginate((activeGraphIndex - 1 + graphs.length) % graphs.length)} className={cn("absolute top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-emerald-500 z-10", isRtl ? "right-[-40px]" : "left-[-40px]")}>
             <CaretLeft weight="duotone" size={32} className={isRtl ? "rotate-180" : ""}/>
           </button>
           <button onClick={() => paginate((activeGraphIndex + 1) % graphs.length)} className={cn("absolute top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-emerald-500 z-10", isRtl ? "left-[-40px]" : "right-[-40px]")}>
             <CaretRight weight="duotone" size={32} className={isRtl ? "rotate-180" : ""}/>
           </button>
        </div>
      </section>
    </PageWrapper>
  );
}
