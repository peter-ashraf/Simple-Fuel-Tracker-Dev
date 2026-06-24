import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Wrench, CalendarBlank, Tag, CaretLeft, Shield, CaretRight } from '@phosphor-icons/react';
import { useFuel } from '../hooks/useFuelContext';
import { Input, Label, Card, PageWrapper, cn } from './ui';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function MaintenanceForm() {
  const { addMaintenanceEntry, maintenanceSettings, maintenanceSystems, getCategoryById } = useFuel();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language.startsWith('ar');
  
  const queryParams = new URLSearchParams(location.search);
  const initialType = queryParams.get('type');
  const activeMaintenanceSystems = maintenanceSystems.filter(
    (system) => !system.deletedAt && !system.deleted_at,
  );
  
  const getCategoryDefaults = (categoryId) => {
    if (!categoryId) return '';
    const category = getCategoryById(categoryId);
    const categorySettings = maintenanceSettings?.categorySettings?.[categoryId] || {};
    const interval = categorySettings.intervalKm ?? category?.defaultInterval?.value ?? '';
    const safety = categorySettings.safetyMarginKm ?? category?.defaultSafetyMarginKm ?? maintenanceSettings.defaultSafetyMarginKm ?? 2000;
    return {
      interval: interval === '' ? '' : String(interval),
      safety: safety === '' ? '' : String(safety),
    };
  };

  const [type, setType] = useState(initialType || '');
  const [date, setDate] = useState(new Date().toISOString().substring(0, 10));
  const [performedAtODO, setPerformedAtODO] = useState('');
  const [intervalKm, setIntervalKm] = useState(() => getCategoryDefaults(initialType).interval);
  const [safetyMarginKm, setSafetyMarginKm] = useState(() => getCategoryDefaults(initialType).safety);
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');

  const [selectedSystemId, setSelectedSystemId] = useState(null);
  const getSystemLabel = (system) => system?.name || system?.id || '';
  const getCategoryLabel = (category) => {
    if (!category) return '';
    if (category.isDefault === false || category.is_default === false) return category.name || category.id;
    return i18n.exists(category.id) ? t(category.id) : category.name || category.id;
  };

  const handleSelectType = (categoryId) => {
    const defaults = getCategoryDefaults(categoryId);
    setType(categoryId);
    setIntervalKm(defaults.interval);
    setSafetyMarginKm(defaults.safety);
  };

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!performedAtODO || !intervalKm || !type) return;

    addMaintenanceEntry({
      type: type,
      date,
      performedAtODO: Number(performedAtODO),
      intervalKm: Number(intervalKm),
      safetyMarginKm: Number(safetyMarginKm),
      cost: cost ? Number(cost) : null,
      notes: notes.trim()
    });

    navigate('/maintenance');
  };

  if (!type) {
    return (
      <PageWrapper>
        <div className="mb-6">
          <button onClick={() => navigate('/maintenance')} className="flex items-center gap-2 text-slate-500 font-bold text-xs uppercase tracking-widest mb-4">
            <CaretLeft weight="duotone" className={cn("w-4 h-4", isRtl && "rotate-180")} /> {t('back')}
          </button>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">{t('select_service')}</h2>
        </div>

        {!selectedSystemId ? (
          <div className="grid grid-cols-1 gap-3">
            {activeMaintenanceSystems.map(system => (
              <Card key={system.id} className="p-4 flex items-center justify-between cursor-pointer" onClick={() => setSelectedSystemId(system.id)}>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white" style={{ backgroundColor: system.color }}><Wrench weight="duotone" className="w-6 h-6" /></div>
                  <span className="font-bold text-slate-900 dark:text-white">{getSystemLabel(system)}</span>
                </div>
                <CaretRight weight="duotone" className={cn("w-5 h-5 text-slate-300", isRtl && "rotate-180")} />
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <button onClick={() => setSelectedSystemId(null)} className="text-xs font-bold text-emerald-500 uppercase flex items-center gap-1 mb-2">
              <CaretLeft weight="duotone" className={cn("w-3 h-3", isRtl && "rotate-180")} /> {t('back')}
            </button>
            {activeMaintenanceSystems.find(s => s.id === selectedSystemId)?.categories.map(catId => {
              const cat = getCategoryById(catId);
              if (!cat || cat.deletedAt || cat.deleted_at) return null;
              return (
                <Card key={catId} className="p-5 flex items-center justify-between cursor-pointer" onClick={() => handleSelectType(catId)}>
                  <div className="flex items-center gap-4">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                    <span className="font-bold text-slate-900 dark:text-white">{getCategoryLabel(cat)}</span>
                  </div>
                  <Plus weight="duotone" className="w-5 h-5 text-emerald-500" />
                </Card>
              );
            })}
          </div>
        )}
      </PageWrapper>
    );
  }

  const selectedCategory = getCategoryById(type);

  return (
    <>
      {createPortal(
        <div className="fixed-button-container">
          <div className="max-w-lg mx-auto flex gap-3">
            <button type="button" onClick={() => navigate('/maintenance')} className="flex-1 px-6 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold h-[64px] rounded-[1.5rem] flex items-center justify-center gap-2 transition-all">
              <CaretLeft weight="duotone" className={cn("w-5 h-5", isRtl && "rotate-180")} /> <span>{t('cancel')}</span>
            </button>
            <button type="button" onClick={handleSubmit} disabled={!performedAtODO || !intervalKm} className="flex-[2] px-6 bg-emerald-500 text-white dark:text-slate-950 font-bold h-[64px] rounded-[1.5rem] flex items-center justify-center gap-2 transition-all">
              <Plus weight="duotone" className="w-5 h-5" /> <span>{t('save')} {getCategoryLabel(selectedCategory)}</span>
            </button>
          </div>
        </div>,
        document.body
      )}

      <PageWrapper>
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
             <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: selectedCategory?.color }}><Wrench weight="duotone" className="w-5 h-5" /></div>
             <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white">{getCategoryLabel(selectedCategory)}</h2>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('add_maintenance')}</p>
             </div>
          </div>
        </div>

        <div className="pb-24">
          <form onSubmit={handleSubmit} className="space-y-5">
            <Card className="p-6">
              <div className="space-y-6">
                <div>
                  <Label className="flex items-center gap-2"><CalendarBlank weight="duotone" className="w-4 h-4" /> {t('date')} *</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                </div>
                <div>
                  <Label className="flex items-center gap-2"><CalendarBlank weight="duotone" className="w-4 h-4" /> {t('odometer')} (km) *</Label>
                  <Input type="number" value={performedAtODO} onChange={(e) => setPerformedAtODO(e.target.value)} placeholder={t('current_mileage')} min="0" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="flex items-center gap-2"><Wrench weight="duotone" className="w-4 h-4" /> {t('distance')} (km) *</Label>
                    <Input type="number" value={intervalKm} onChange={(e) => setIntervalKm(e.target.value)} placeholder="e.g. 10000" min="1" required />
                  </div>
                  <div>
                    <Label className="flex items-center gap-2"><Shield weight="duotone" className="w-4 h-4" /> {t('safety_margin')}</Label>
                    <Input type="number" value={safetyMarginKm} onChange={(e) => setSafetyMarginKm(e.target.value)} placeholder="2000" min="0" />
                  </div>
                </div>
                <div>
                  <Label className="flex items-center gap-2"><Tag weight="duotone" className="w-4 h-4" /> {t('price')} ({t('currency')})</Label>
                  <Input type="number" step="0.01" min="0" value={cost} onChange={(e) => setCost(e.target.value)} placeholder={t('optional')} />
                </div>
                <div>
                  <Label className="flex items-center gap-2"><Tag weight="duotone" className="w-4 h-4" /> {t('notes')}</Label>
                  <textarea className="input-field min-h-[100px]" rows="3" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="..." />
                </div>
              </div>
            </Card>
          </form>
        </div>
      </PageWrapper>
    </>
  );
}
