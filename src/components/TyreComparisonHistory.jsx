import { useState } from 'react';
import { Tire, Clock, CaretRight, Trash, Gauge, TrendUp, ArrowCounterClockwise, Check, CheckSquare, Square, X } from '@phosphor-icons/react';
import { Card, PageWrapper, ConfirmModal, Modal, cn } from './ui';
import { useFuel } from '../hooks/useFuelContext';
import { formatTyreSize } from '../utils/tyreCalculator';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

const FuelImpactSummary = ({ fuelImpact, t }) => {
  if (!fuelImpact) return null;

  return (
    <div className="rounded-2xl bg-violet-50 dark:bg-violet-500/10 border border-violet-100 dark:border-violet-500/20 p-4 mb-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-violet-500 mb-1">
            {t('fuel_consumption_impact')}
          </p>
          <p className={cn(
            "text-2xl font-black",
            fuelImpact.consumptionChangePercent > 0 ? "text-red-500" : "text-emerald-500"
          )}>
            {fuelImpact.consumptionChangePercent > 0 ? '+' : ''}{fuelImpact.consumptionChangeFormatted}
          </p>
        </div>
        <div className="text-end">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {t('expected_efficiency')}
          </p>
          <p className="text-sm font-black text-slate-900 dark:text-white">
            {fuelImpact.expectedKmPerLiter > 0 ? `${fuelImpact.expectedKmPerLiter.toFixed(2)} km/L` : '-'}
          </p>
          <p className="text-[10px] font-bold text-slate-500">
            {fuelImpact.expectedKmPer20Liter > 0 ? `${fuelImpact.expectedKmPer20Liter.toFixed(2)} km/20L` : t('limited_data')}
          </p>
        </div>
      </div>
      <p className="text-[10px] leading-relaxed text-violet-700 dark:text-violet-300">
        {fuelImpact.baselineKmPerLiter > 0
          ? t('fuel_impact_based_on_actual', { value: fuelImpact.baselineKmPerLiter.toFixed(2) })
          : t('fuel_impact_needs_history')}
      </p>
    </div>
  );
};

const ComparisonDetails = ({ result, isModal = false, t }) => (
  <div className={cn("space-y-6", isModal && "p-6")}>
    <Card className="space-y-6 border-0 shadow-none bg-transparent p-0">
      <h2 className="text-lg font-bold flex items-center gap-2"><TrendUp weight="duotone" className="w-5 h-5 text-emerald-500" /> {t('overview')}</h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl"><p className="text-[10px] font-bold uppercase text-blue-500 mb-1">{t('active_vehicle')}</p><p className="text-lg font-black">{formatTyreSize(result.original)}</p></div>
        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl"><p className="text-[10px] font-bold uppercase text-emerald-500 mb-1">{t('tires')}</p><p className="text-lg font-black">{formatTyreSize(result.new)}</p></div>
      </div>
    </Card>
    
    <Card className="p-0 border-0 shadow-none bg-transparent">
       <div className="flex items-center gap-2 mb-6"><Gauge weight="duotone" className="w-5 h-5 text-amber-500"/><h2 className="text-lg font-bold">{t('trends_visualization')}</h2></div>
       
       <div className="grid grid-cols-2 gap-4 mb-6">
         <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 space-y-3">
           <h3 className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">{t('original')}</h3>
           <div className="space-y-2">
             <div className="flex justify-between text-[11px]"><span className="text-slate-500">{t('diameter')}:</span><span className="font-bold">{result.original.diameter}"</span></div>
             <div className="flex justify-between text-[11px]"><span className="text-slate-500">{t('circumference')}:</span><span className="font-bold">{result.original.circumference}"</span></div>
             <div className="flex justify-between text-[11px]"><span className="text-slate-500">{t('sidewall')}:</span><span className="font-bold">{result.original.sidewallMm} mm</span></div>
           </div>
         </div>

         <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4 space-y-3">
           <h3 className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">{t('new')}</h3>
           <div className="space-y-2">
             <div className="flex justify-between text-[11px]"><span className="text-slate-500">{t('diameter')}:</span><span className="font-bold">{result.new.diameter}"</span></div>
             <div className="flex justify-between text-[11px]"><span className="text-slate-500">{t('circumference')}:</span><span className="font-bold">{result.new.circumference}"</span></div>
             <div className="flex justify-between text-[11px]"><span className="text-slate-500">{t('sidewall')}:</span><span className="font-bold">{result.new.sidewallMm} mm</span></div>
           </div>
         </div>
       </div>

       <div className="grid grid-cols-3 gap-4 text-center pb-6 border-b border-slate-100 dark:border-white/5 mb-6">
          <div><p className="text-[10px] font-bold text-slate-500 uppercase mb-1">{t('diameter')}</p><p className={cn("text-xl font-black", result.differences.diameterDifference > 0 ? "text-red-500" : "text-emerald-500")}>{result.differences.diameterDifference > 0 ? '+' : ''}{result.differences.diameterDifference}"</p></div>
          <div><p className="text-[10px] font-bold text-slate-500 uppercase mb-1">{t('speed_impact')}</p><p className="text-xl font-black text-amber-500">{result.speedImpact.speedPercentageChange}</p></div>
          <div><p className="text-[10px] font-bold text-slate-500 uppercase mb-1">{t('actual_at_speed', { speed: result.speedImpact.speedometerSpeed || 100 })}</p><p className="text-xl font-black">{result.speedImpact.actualSpeed} <span className="text-[10px]">{t('unit_km_h')}</span></p></div>
       </div>

       <FuelImpactSummary fuelImpact={result.fuelImpact} t={t} />

       <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t('rpm_change')} {t('rpm_at_speed', { speed: result.speedImpact.speedometerSpeed || 100 })}</h3>
            <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold", result.rpmImpact.newRPM > result.rpmImpact.originalRPM ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-500")}>
              {result.rpmImpact.rpmPercentageChange}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl"><p className="text-[9px] font-bold text-slate-500 uppercase mb-1">{t('original')} RPM</p><p className="text-lg font-black">{result.rpmImpact.originalRPM}</p></div>
            <div className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl"><p className="text-[9px] font-bold text-slate-500 uppercase mb-1">{t('new')} RPM</p><p className="text-lg font-black">{result.rpmImpact.newRPM}</p></div>
          </div>
       </div>

       <div className="mt-6 flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
          <Clock weight="duotone" size={12} /> {t('calculated_at')} {new Date(result.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
       </div>
    </Card>
  </div>
);

export default function TyreComparisonHistory() {
  const { tyreComparisons, deleteTyreComparison, deleteMultipleTyreComparisons } = useFuel();
  const { t } = useTranslation();
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, id: null, isBulk: false });
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  const [selectedComparison, setSelectedComparison] = useState(null);

  const toggleSelection = (id) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    if (selectedIds.size === tyreComparisons.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tyreComparisons.map(c => c.id)));
    }
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  };

  const handleBulkDelete = () => {
    deleteMultipleTyreComparisons(Array.from(selectedIds));
    setSelectedIds(new Set());
    setIsSelectionMode(false);
    setDeleteModal({ isOpen: false, id: null, isBulk: false });
  };

  if (tyreComparisons.length === 0) {
    return (
      <div className="text-center py-8 px-6 border-2 border-dashed border-slate-200 dark:border-slate-800/80 rounded-3xl">
        <Tire weight="duotone" className="w-10 h-10 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium tracking-tight">
          {t('untracked')}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('history')}</h3>
        {!isSelectionMode ? (
          <button 
            onClick={() => setIsSelectionMode(true)}
            className="text-[10px] font-bold text-indigo-500 hover:text-indigo-600 uppercase tracking-wider flex items-center gap-1"
          >
            <CheckSquare weight="duotone" className="w-3 h-3" /> {t('select')}
          </button>
        ) : (
          <button 
            onClick={clearSelection}
            className="text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-wider"
          >
            {t('cancel')}
          </button>
        )}
      </div>

      <div className="space-y-3">
        {tyreComparisons.slice(0, 10).map((comparison) => {
          const isSelected = selectedIds.has(comparison.id);
          return (
            <div key={comparison.id} className="relative flex items-center gap-3">
              {isSelectionMode && (
                <button 
                  onClick={() => toggleSelection(comparison.id)}
                  className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-slate-300 dark:border-slate-600 bg-transparent'}`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5" />}
                </button>
              )}
              <Card 
                className={`relative overflow-hidden flex-1 ${isSelectionMode ? 'cursor-pointer select-none' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors'}`}
                onClick={isSelectionMode ? () => toggleSelection(comparison.id) : () => setSelectedComparison(comparison)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="bg-indigo-500/10 p-2 rounded-lg">
                      <Tire weight="duotone" className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        {formatTyreSize(comparison.original)} → {formatTyreSize(comparison.new)}
                      </h4>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                        <Clock weight="duotone" className="w-2.5 h-2.5" />
                        {new Date(comparison.timestamp).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  {!isSelectionMode && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteModal({ isOpen: true, id: comparison.id, isBulk: false });
                      }}
                      className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors text-slate-400 hover:text-red-500"
                    >
                      <Trash weight="duotone" className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 dark:bg-white/[0.03] rounded-lg p-3">
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider font-bold">{t('speed_impact')}</p>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      {comparison.speedImpact.speedometerSpeed} → {comparison.speedImpact.actualSpeed} km/h
                    </p>
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 font-bold">
                      {comparison.speedImpact.speedPercentageChange} {t('diff')}
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-white/[0.03] rounded-lg p-3">
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider font-bold">{t('rpm_change')}</p>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      {comparison.rpmImpact.originalRPM} → {comparison.rpmImpact.newRPM}
                    </p>
                    <p className="text-[10px] text-purple-600 dark:text-purple-400 mt-1 font-bold">
                      {comparison.rpmImpact.rpmPercentageChange} {t('diff')}
                    </p>
                  </div>
                </div>

                {comparison.fuelImpact && (
                  <div className="mt-3 bg-violet-50 dark:bg-violet-500/10 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-violet-500 mb-1 uppercase tracking-wider font-bold">{t('fuel_consumption_impact')}</p>
                      <p className={cn(
                        "text-xs font-black",
                        comparison.fuelImpact.consumptionChangePercent > 0 ? "text-red-500" : "text-emerald-500"
                      )}>
                        {comparison.fuelImpact.consumptionChangePercent > 0 ? '+' : ''}{comparison.fuelImpact.consumptionChangeFormatted}
                      </p>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {comparison.fuelImpact.expectedKmPerLiter > 0 ? `${comparison.fuelImpact.expectedKmPerLiter.toFixed(2)} km/L` : t('limited_data')}
                    </p>
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800/50 flex justify-between text-[10px] text-slate-500 italic">
                  <span>{t('diameter')}: {comparison.original.diameter}" → {comparison.new.diameter}" ({comparison.differences.diameterDifference > 0 ? '+' : ''}{comparison.differences.diameterDifference}")</span>
                  <span>{t('circumference')}: {comparison.differences.circumferenceDifference}</span>
                </div>
              </Card>
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {isSelectionMode && selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 w-full max-w-[90%] sm:max-w-[400px] bg-slate-900 dark:bg-slate-800 text-white rounded-2xl shadow-2xl p-4 flex items-center justify-between z-[100] origin-bottom"
          >
             <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-sm">
                   {selectedIds.size}
                </div>
                <span className="font-semibold text-sm">{t('selected')}</span>
             </div>
             
             <div className="flex gap-2">
                <button 
                  onClick={selectAll}
                  className="px-4 py-2 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 font-semibold text-sm rounded-xl transition-all flex items-center gap-2"
                >
                  {selectedIds.size === tyreComparisons.length ? <Square weight="duotone" className="w-4 h-4" /> : <CheckSquare weight="duotone" className="w-4 h-4" />}
                  <span>{selectedIds.size === tyreComparisons.length ? t('deselect') : t('select_all')}</span>
                </button>
                <button 
                  onClick={() => setDeleteModal({ isOpen: true, id: null, isBulk: true })}
                  className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 font-semibold text-sm rounded-xl transition-all flex items-center gap-2"
                >
                  <Trash weight="duotone" className="w-4 h-4" /> {t('delete')}
                </button>
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: null, isBulk: false })}
        onConfirm={() => {
          if (deleteModal.isBulk) handleBulkDelete();
          else {
            deleteTyreComparison(deleteModal.id);
            setDeleteModal({ isOpen: false, id: null, isBulk: false });
          }
        }}
        title={t('delete')}
        message={t('delete') + "?"}
        confirmText={t('delete')}
        cancelText={t('cancel')}
        variant="danger"
      />

      <Modal 
        isOpen={!!selectedComparison} 
        onClose={() => setSelectedComparison(null)}
        title={t('tyre_calculator')}
      >
        {selectedComparison && <ComparisonDetails result={selectedComparison} isModal />}
      </Modal>
    </>
  );
}
