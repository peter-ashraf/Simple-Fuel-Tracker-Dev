import { useState } from 'react';
import { Trash, GasPump, CalendarBlank, MapPin, FloppyDisk, X, CheckSquare, Square } from '@phosphor-icons/react';
import { format } from 'date-fns';
import { calculateTripMetrics } from '../utils/calculations';
import { ConfirmModal, Input, Label, FuelGaugeSlider, cn } from './ui';
import { formatTo2Decimals } from '../utils/formatting';
import { calculateEfficiencyThresholds, getEfficiencyTextClass } from '../utils/efficiencyThresholds';
import './HistoryCard.css';
import { useTranslation } from 'react-i18next';

export default function HistoryCard({ fill, index, fillUps, onDelete, onUpdate }) {
  const { t, i18n } = useTranslation();
  const [isFlipped, setIsFlipped] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const isRtl = i18n.language.startsWith('ar');

  const [editForm, setEditForm] = useState({
    liters: fill.liters,
    odometer: fill.odometer,
    fuelType: fill.fuelType,
    station: fill.station || '',
    notes: fill.notes || '',
    date: new Date(fill.timestamp).toISOString().substring(0, 10),
    totalCost: fill.liters * (fill.pricePerLiter || 0),
    tankLevelAfter: fill.tankLevelAfter !== undefined ? fill.tankLevelAfter : 100
  });
  const [showPartialSlider, setShowPartialSlider] = useState(fill.isPartialFill || (fill.tankLevelAfter < 100));

  const metrics = calculateTripMetrics(fillUps, index);
  const tripCost = (fill.liters * (fill.pricePerLiter || 0)).toFixed(2);
  const kmPerLiterRaw = metrics.kmPerLiter;
  const kmPerLiter = kmPerLiterRaw > 0 ? formatTo2Decimals(kmPerLiterRaw).toFixed(2) : '-';
  const litersPer100km = metrics.litersPer100km > 0 ? formatTo2Decimals(metrics.litersPer100km).toFixed(2) : '-';
  const tripDistance = metrics.distance > 0 ? formatTo2Decimals(metrics.distance).toFixed(2) : '-';
  const efficiencyThresholds = calculateEfficiencyThresholds(fillUps);

  const handleEdit = () => setIsFlipped(true);

  const handleSave = () => {
    const baseDate = new Date(editForm.date);
    const originalDate = new Date(fill.timestamp);
    baseDate.setHours(originalDate.getHours(), originalDate.getMinutes(), originalDate.getSeconds());
    
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
      isPartialFill: showPartialSlider
    });
    setIsFlipped(false);
  };

  const handleCancel = () => {
    setEditForm({
      liters: fill.liters,
      odometer: fill.odometer,
      fuelType: fill.fuelType,
      station: fill.station || '',
      notes: fill.notes || '',
      date: new Date(fill.timestamp).toISOString().substring(0, 10),
      totalCost: fill.liters * (fill.pricePerLiter || 0),
      tankLevelAfter: fill.tankLevelAfter !== undefined ? fill.tankLevelAfter : 100
    });
    setIsFlipped(false);
  };

  return (
    <div className={`flip-card ${isFlipped ? 'flipped' : ''} ${isRtl ? 'rtl' : ''}`}>
      <div className="flip-card-inner">
        <div className="flip-card-front">
          <div className="grid grid-cols-[1fr_auto] gap-4 items-start mb-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  {format(new Date(fill.timestamp), "MMM d, yyyy")}
                </p>
                <span className="text-[10px] font-black bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                  P{fill.fuelType || "92"}
                </span>
              </div>
              {fill.station && (
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <MapPin weight="fill" className="w-3 h-3 text-emerald-500" />{" "}
                  {fill.station}
                </p>
              )}
              <div className="flex items-center gap-1.5 opacity-60">
                 <div className="w-1 h-1 rounded-full bg-slate-400" />
                 <p className="text-[10px] font-bold text-slate-500">
                   {fill.odometer.toLocaleString()} {t("unit_km_h").replace("/h", "")}
                 </p>
              </div>
            </div>
            
            <div className="text-end cursor-pointer group" onClick={handleEdit}>
              <div className="flex items-baseline justify-end gap-1 mb-0.5">
                <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter">
                   {formatTo2Decimals(Number(tripCost)).toFixed(2)}
                </span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                   {t("currency")}
                </span>
              </div>
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-white/[0.05] px-1.5 py-0.5 rounded-md">
                   {fill.liters} {t("liters_abbr")}
                </span>
                <span className="text-[10px] font-bold text-slate-400">@</span>
                <span className="text-[10px] font-bold text-slate-500">
                   {fill.pricePerLiter}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-slate-50/50 dark:bg-white/[0.02] rounded-[1.5rem] p-4 grid grid-cols-3 gap-1 border border-slate-200/60 dark:border-white/[0.05] shadow-inner">
            <div className="text-center space-y-1">
              <p className="text-[9px] uppercase font-black text-slate-400 tracking-[0.1em]">{t("distance")}</p>
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                {index === 0 ? t("untracked") : (tripDistance !== "-" ? `${tripDistance} ${isRtl ? "كم" : ""}` : "-")}
              </p>
            </div>
            <div className="text-center space-y-1 border-s border-e border-slate-200 dark:border-white/[0.05]">
              <p className="text-[9px] uppercase font-black text-slate-400 tracking-[0.1em]">{t("avg_km_l_short")}</p>
              <p className={cn("text-xs font-black", getEfficiencyTextClass(kmPerLiterRaw, efficiencyThresholds))}>
                {index === 0 ? t("untracked") : kmPerLiter}
              </p>
            </div>
            <div className="text-center space-y-1">
              <p className="text-[9px] uppercase font-black text-slate-400 tracking-[0.1em]">{t("l_100km_short")}</p>
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                {index === 0 ? t("untracked") : litersPer100km}
              </p>
            </div>
          </div>
          
          {fill.notes && (
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-4 italic bg-slate-100 dark:bg-slate-950/50 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800/50">
              "{fill.notes}"
            </p>
          )}
        </div>

        <div className="flip-card-back p-4">
          <div className="flex flex-col h-full">
            <div className="flex justify-between items-start mb-4">
              <div className="flex gap-2">
                <button onClick={handleSave} className="bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs">{t('save')}</button>
                <button onClick={handleCancel} className="bg-slate-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs">{t('cancel')}</button>
                <button 
                  onClick={() => setShowPartialSlider(!showPartialSlider)} 
                  className={cn(
                    "font-bold px-3 py-1.5 rounded-lg text-[10px] transition-colors",
                    showPartialSlider ? "bg-amber-500/10 text-amber-500" : "bg-slate-100 dark:bg-white/5 text-slate-500"
                  )}
                >
                  {showPartialSlider ? t('no_not_partial') : t('was_it_partial')}
                </button>
              </div>
              <button onClick={() => setDeleteModal(true)} className="text-red-500 p-1"><Trash weight="duotone" className="w-4 h-4" /></button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <Label className="text-[10px]">{t('date')}</Label>
                <Input type="date" value={editForm.date} onChange={e => setEditForm({...editForm, date: e.target.value})} className="py-1 px-2 text-xs" />
              </div>
              <div>
                <Label className="text-[10px]">{t('odometer')}</Label>
                <Input type="number" value={editForm.odometer} onChange={e => setEditForm({...editForm, odometer: e.target.value})} className="py-1 px-2 text-xs" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-[10px]">{t('liters')}</Label>
                <Input type="number" step="0.01" value={editForm.liters} onChange={e => {
                  const val = parseFloat(e.target.value) || 0;
                  setEditForm({...editForm, liters: e.target.value, totalCost: (val * (fill.pricePerLiter || 1)).toFixed(2)});
                }} className="py-1 px-2 text-xs" />
              </div>
              <div>
                <Label className="text-[10px]">{t('total_spent')}</Label>
                <Input type="number" step="0.01" value={editForm.totalCost} onChange={e => {
                  const val = parseFloat(e.target.value) || 0;
                  setEditForm({...editForm, totalCost: e.target.value, liters: (val / (fill.pricePerLiter || 1)).toFixed(2)});
                }} className="py-1 px-2 text-xs" />
              </div>
            </div>

            {showPartialSlider && (
              <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800/50">
                <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">{t('fuel_level_after_fill')}</p>
                <FuelGaugeSlider 
                  value={editForm.tankLevelAfter} 
                  onChange={(val) => setEditForm({...editForm, tankLevelAfter: val})} 
                />
              </div>
            )}
          </div>
        </div>
      </div>
      
      <ConfirmModal isOpen={deleteModal} onClose={() => setDeleteModal(false)} onConfirm={() => onDelete(fill.id)} title={t('delete')} message={t('delete') + "?"} confirmText={t('delete')} variant="danger" />
    </div>
  );
}
