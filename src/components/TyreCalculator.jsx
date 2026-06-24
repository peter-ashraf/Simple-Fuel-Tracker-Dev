import { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  Calculator, 
  ArrowCounterClockwise, 
  FloppyDisk, 
  Clock, 
  Tire, 
  TrendUp, 
  Warning, 
  Check, 
  ClockCounterClockwise, 
  CaretDown, 
  Pencil, 
  Gauge, 
  CaretLeft 
} from '@phosphor-icons/react';
// eslint-disable-next-line no-unused-vars
import { AnimatePresence, motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Card, Input, Label, PageWrapper, cn } from './ui';
import { useFuel } from '../hooks/useFuelContext';
import { compareTyreSizes, validateTyreDimensions, commonTyreSizes, formatTyreSize } from '../utils/tyreCalculator';
import TyreComparisonHistory from './TyreComparisonHistory';
import { useTranslation } from 'react-i18next';

export default function TyreCalculator() {
  const { addTyreComparison, activeVehicle, stats } = useFuel();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language.startsWith('ar');
  
  const originalTyre = activeVehicle?.tyreSize || { width: 205, aspectRatio: 55, rimSize: 16 };
  const [newTyre, setNewTyre] = useState({ width: 215, aspectRatio: 55, rimSize: 16 });
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(false);
  const [sizesOpen, setSizesOpen] = useState(false);
  const [impactSpeedKmh, setImpactSpeedKmh] = useState(100);

  const handleCalculate = () => {
    setSaved(false);
    const originalValidation = validateTyreDimensions(originalTyre);
    const newValidation = validateTyreDimensions(newTyre);
    const allErrors = [
      ...originalValidation.errors.map(e => `${t('engine')}: ${e}`),
      ...newValidation.errors.map(e => `${t('tires')}: ${e}`)
    ];
    if (allErrors.length > 0) {
      setResult(null);
      return;
    }
    setResult(compareTyreSizes(originalTyre, newTyre, {
      speedKmh: impactSpeedKmh,
      gearRatio: 1.0,
      finalDriveRatio: 3.5,
      baselineKmPerLiter: stats.avgKmPerLiter,
    }));
  };

  const toggleImpactSpeed = () => {
    const nextSpeed = impactSpeedKmh === 100 ? 60 : 100;
    setImpactSpeedKmh(nextSpeed);
    if (!result) return;
    setResult(compareTyreSizes(originalTyre, newTyre, {
      speedKmh: nextSpeed,
      gearRatio: 1.0,
      finalDriveRatio: 3.5,
      baselineKmPerLiter: stats.avgKmPerLiter,
    }));
  };

  const handleReset = () => {
    setNewTyre({ width: 215, aspectRatio: 55, rimSize: 16 });
    setResult(null);
    setSaved(false);
    setSizesOpen(false);
  };

  return (
    <>
      {createPortal(
        <>
          <div className="fixed left-1/2 bottom-28 z-40 flex w-full max-w-lg -translate-x-1/2 gap-3 px-4">
            <button type="button" onClick={handleCalculate} className="flex-1 bg-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-all">{t('calculate')}</button>
            <button type="button" onClick={handleReset} className="bg-slate-100 dark:bg-slate-800 p-4 rounded-xl"><ArrowCounterClockwise weight="duotone" className="w-5 h-5" /></button>
          </div>
          <div className="fixed-button-container-no-nav">
            <div className="max-w-lg mx-auto flex gap-3">
              <button type="button" onClick={() => navigate('/')} className="flex-1 px-6 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold h-[64px] rounded-[1.5rem] flex items-center justify-center gap-2 transition-all">
                <CaretLeft weight="duotone" className={cn("w-5 h-5", isRtl && "rotate-180")} /> <span>{t('back')}</span>
              </button>
              <button type="button" onClick={() => { addTyreComparison(result); setSaved(true); setTimeout(() => setSaved(false), 3000); }} disabled={!result || saved} className="flex-1 px-6 bg-emerald-500 text-white dark:text-slate-950 font-bold h-[64px] rounded-[1.5rem] flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-xl shadow-emerald-500/25 active:scale-[0.98]">
                <FloppyDisk weight="duotone" className="w-5 h-5" /> <span>{saved ? t('save') : t('save')}</span>
              </button>
            </div>
          </div>
        </>,
        document.body
      )}

      <PageWrapper className="space-y-6 pb-56">
        <div className="mb-2">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Tire weight="duotone" className="w-6 h-6 text-emerald-500" /> {t('tyre_calculator')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('compare_tyre_subtitle')}</p>
        </div>

        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{t('overview')}</h2>
            <Link to="/settings" className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 rounded-lg transition-colors">
              <Pencil weight="duotone" className="w-3 h-3" /> {t('edit')}
            </Link>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-slate-500">{t('active_vehicle')}:</span> <span className="font-bold">{activeVehicle?.name}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-500">{t('tyre_size')}:</span> <span className="font-bold">{formatTyreSize(originalTyre)}</span></div>
          </div>
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center justify-between">
             <h2 className="text-lg font-bold text-emerald-500">{t('tires')}</h2>
             <div className="relative">
                <button type="button" onClick={() => setSizesOpen(!sizesOpen)} className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-bold flex items-center gap-1">
                   {t('common_sizes')} <CaretDown weight="duotone" size={14} className={cn("transition-transform", sizesOpen && "rotate-180")} />
                </button>
                <AnimatePresence>
                   {sizesOpen && (
                     <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className={cn("absolute top-full mt-2 w-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl shadow-xl z-20", isRtl ? "left-0" : "right-0")}>
                        <div className="p-1 max-h-48 overflow-y-auto no-scrollbar">
                           {commonTyreSizes.map((s, i) => (
                             <button type="button" key={i} onClick={() => { setNewTyre(s); setSizesOpen(false); }} className="w-full text-start px-3 py-2 text-xs font-bold hover:bg-slate-50 dark:hover:bg-white/5 rounded-lg">{s.label}</button>
                           ))}
                        </div>
                     </motion.div>
                   )}
                </AnimatePresence>
             </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label className="text-[10px] uppercase opacity-60 text-center block mb-2">{t('width')}</Label><Input type="number" value={newTyre.width} onChange={e => setNewTyre({...newTyre, width: parseInt(e.target.value) || 0})} className="text-center font-black text-lg" /></div>
            <div><Label className="text-[10px] uppercase opacity-60 text-center block mb-2">{t('ratio')}</Label><Input type="number" value={newTyre.aspectRatio} onChange={e => setNewTyre({...newTyre, aspectRatio: parseInt(e.target.value) || 0})} className="text-center font-black text-lg" /></div>
            <div><Label className="text-[10px] uppercase opacity-60 text-center block mb-2">{t('rim')}</Label><Input type="number" value={newTyre.rimSize} onChange={e => setNewTyre({...newTyre, rimSize: parseInt(e.target.value) || 0})} className="text-center font-black text-lg" /></div>
          </div>
          <div className="bg-slate-100 dark:bg-white/5 p-3 rounded-xl text-center font-black text-slate-500">
             {formatTyreSize(newTyre)}
          </div>
        </Card>

        {result && (
          <div className="space-y-6">
            <Card className="space-y-6">
              <h2 className="text-lg font-bold flex items-center gap-2"><TrendUp weight="duotone" className="w-5 h-5 text-emerald-500" /> {t('overview')}</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl"><p className="text-[10px] font-bold uppercase text-blue-500 mb-1">{t('active_vehicle')}</p><p className="text-lg font-black">{formatTyreSize(result.original)}</p></div>
                <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl"><p className="text-[10px] font-bold uppercase text-emerald-500 mb-1">{t('tires')}</p><p className="text-lg font-black">{formatTyreSize(result.new)}</p></div>
              </div>
            </Card>
            
            <Card className="p-6">
               <div className="flex items-center gap-2 mb-6"><Gauge weight="duotone" className="w-5 h-5 text-amber-500"/><h2 className="text-lg font-bold">{t('trends_visualization')}</h2></div>
               
               {/* Tyre Specs Comparison */}
               <div className="grid grid-cols-2 gap-4 mb-6">
                 <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 space-y-3">
                   <h3 className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">{t('original')}</h3>
                   <div className="space-y-2">
                     <div className="flex justify-between text-[11px]">
                       <span className="text-slate-500">{t('diameter')}:</span>
                       <span className="font-bold">{result.original.diameter}"</span>
                     </div>
                     <div className="flex justify-between text-[11px]">
                       <span className="text-slate-500">{t('circumference')}:</span>
                       <span className="font-bold">{result.original.circumference}"</span>
                     </div>
                     <div className="flex justify-between text-[11px]">
                       <span className="text-slate-500">{t('sidewall')}:</span>
                       <span className="font-bold">{result.original.sidewallMm} mm</span>
                     </div>
                   </div>
                 </div>

                 <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4 space-y-3">
                   <h3 className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">{t('new')}</h3>
                   <div className="space-y-2">
                     <div className="flex justify-between text-[11px]">
                       <span className="text-slate-500">{t('diameter')}:</span>
                       <span className="font-bold">{result.new.diameter}"</span>
                     </div>
                     <div className="flex justify-between text-[11px]">
                       <span className="text-slate-500">{t('circumference')}:</span>
                       <span className="font-bold">{result.new.circumference}"</span>
                     </div>
                     <div className="flex justify-between text-[11px]">
                       <span className="text-slate-500">{t('sidewall')}:</span>
                       <span className="font-bold">{result.new.sidewallMm} mm</span>
                     </div>
                   </div>
                 </div>
               </div>

               <div className="grid grid-cols-3 gap-4 text-center pb-6 border-b border-slate-100 dark:border-white/5 mb-6">
                  <div><p className="text-[10px] font-bold text-slate-500 uppercase mb-1">{t('diameter')}</p><p className={cn("text-xl font-black", result.differences.diameterDifference > 0 ? "text-red-500" : "text-emerald-500")}>{result.differences.diameterDifference > 0 ? '+' : ''}{result.differences.diameterDifference}"</p></div>
                  <div><p className="text-[10px] font-bold text-slate-500 uppercase mb-1">{t('speed_impact')}</p><p className="text-xl font-black text-amber-500">{result.speedImpact.speedPercentageChange}</p></div>
                  <button
                    type="button"
                    onClick={toggleImpactSpeed}
                    className="rounded-xl transition-colors hover:bg-slate-100 dark:hover:bg-white/5 active:scale-[0.98]"
                    aria-label={t('toggle_speed_reference')}
                  >
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">
                      {t('actual_at_speed', { speed: result.speedImpact.speedometerSpeed })}
                    </p>
                    <p className="text-xl font-black">{result.speedImpact.actualSpeed} <span className="text-[10px]">{t('unit_km_h')}</span></p>
                  </button>
               </div>

               {/* Fuel Consumption Impact */}
               <div className="rounded-2xl bg-violet-50 dark:bg-violet-500/10 border border-violet-100 dark:border-violet-500/20 p-4 mb-6">
                 <div className="flex items-start justify-between gap-4 mb-4">
                   <div>
                     <p className="text-[10px] font-bold uppercase tracking-wider text-violet-500 mb-1">
                       {t('fuel_consumption_impact')}
                     </p>
                     <p className={cn(
                       "text-2xl font-black",
                       result.fuelImpact.consumptionChangePercent > 0 ? "text-red-500" : "text-emerald-500"
                     )}>
                       {result.fuelImpact.consumptionChangePercent > 0 ? '+' : ''}{result.fuelImpact.consumptionChangeFormatted}
                     </p>
                   </div>
                   <div className="text-end">
                     <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                       {t('expected_efficiency')}
                     </p>
                     <p className="text-sm font-black text-slate-900 dark:text-white">
                       {result.fuelImpact.expectedKmPerLiter > 0 ? `${result.fuelImpact.expectedKmPerLiter.toFixed(2)} km/L` : '-'}
                     </p>
                     <p className="text-[10px] font-bold text-slate-500">
                       {result.fuelImpact.expectedKmPer20Liter > 0 ? `${result.fuelImpact.expectedKmPer20Liter.toFixed(2)} km/20L` : t('limited_data')}
                     </p>
                   </div>
                 </div>
                 <p className="text-[10px] leading-relaxed text-violet-700 dark:text-violet-300">
                   {result.fuelImpact.baselineKmPerLiter > 0
                     ? t('fuel_impact_based_on_actual', { value: result.fuelImpact.baselineKmPerLiter.toFixed(2) })
                     : t('fuel_impact_needs_history')}
                 </p>
               </div>

               {/* RPM Impact */}
               <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={toggleImpactSpeed}
                      className="text-start rounded-lg transition-colors hover:text-slate-600 dark:hover:text-slate-200"
                      aria-label={t('toggle_speed_reference')}
                    >
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        {t('rpm_change')} {t('rpm_at_speed', { speed: result.speedImpact.speedometerSpeed })}
                      </h3>
                    </button>
                    <button
                      type="button"
                      onClick={toggleImpactSpeed}
                      className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold", result.rpmImpact.newRPM > result.rpmImpact.originalRPM ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-500")}
                      aria-label={t('toggle_speed_reference')}
                    >
                      {result.rpmImpact.rpmPercentageChange}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl">
                      <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">{t('original')} RPM</p>
                      <p className="text-lg font-black">{result.rpmImpact.originalRPM}</p>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl">
                      <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">{t('new')} RPM</p>
                      <p className="text-lg font-black">{result.rpmImpact.newRPM}</p>
                    </div>
                  </div>
               </div>

               <div className="mt-6 flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                  <Clock size={12} /> {t('calculated_at')} {new Date(result.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
               </div>
            </Card>
          </div>
        )}

        <section className="pt-2">
          <div className="flex items-center gap-2 mb-4"><ClockCounterClockwise weight="duotone" className="w-5 h-5 text-slate-500" /><h2 className="text-lg font-bold">{t('history')}</h2></div>
          <TyreComparisonHistory />
        </section>
      </PageWrapper>
    </>
  );
}
