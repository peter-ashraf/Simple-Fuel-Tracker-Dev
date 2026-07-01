import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Wrench, CalendarBlank, Tag, CaretLeft, Shield, Trash, FloppyDisk, CheckCircle, Bell } from '@phosphor-icons/react';
import { useFuel } from '../hooks/useFuelContext';
import { Input, Label, Card, PageWrapper, ConfirmModal, cn } from './ui';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './Maintenance.css';

const parseDescription = (description) => {
  if (!description || typeof description !== 'string') return {};
  try {
    const parsed = JSON.parse(description);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return { notes: description };
  }
};

export default function MaintenanceLogEdit() {
  const { maintenanceEntries, updateMaintenanceEntry, deleteMaintenanceEntry, getCategoryById } = useFuel();
  const navigate = useNavigate();
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language.startsWith('ar');
  
  const log = maintenanceEntries.find(l => String(l.id) === String(id));
  const parsedDescription = parseDescription(log?.description);
  const [date, setDate] = useState(() => (log?.date || log?.timestamp || new Date().toISOString()).substring(0, 10));
  const [performedAtODO, setPerformedAtODO] = useState(() => {
    const value = log?.performedAtODO ?? log?.odometer;
    return value !== undefined && value !== null ? String(value) : '';
  });
  const [intervalKm, setIntervalKm] = useState(() => {
    const value = log?.intervalKm ?? log?.distance ?? parsedDescription.distance;
    return value !== undefined && value !== null ? String(value) : '';
  });
  const [safetyMarginKm, setSafetyMarginKm] = useState(() => {
    const value = log?.safetyMarginKm ?? log?.safety ?? parsedDescription.safety;
    return value !== undefined && value !== null ? String(value) : '';
  });
  const [cost, setCost] = useState(() => log?.cost !== undefined && log?.cost !== null ? String(log.cost) : '');
  const [notes, setNotes] = useState(() => log?.notes || parsedDescription.notes || '');
  const [deleteModal, setDeleteModal] = useState(false);

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!performedAtODO || !intervalKm) return;
    updateMaintenanceEntry(log.id, {
      date,
      performedAtODO: Number(performedAtODO),
      intervalKm: Number(intervalKm),
      safetyMarginKm: Number(safetyMarginKm),
      cost: cost ? Number(cost) : null,
      notes: notes.trim()
    });
    navigate('/maintenance');
  };

  const confirmDelete = () => {
    deleteMaintenanceEntry(log.id);
    setDeleteModal(false);
    navigate('/maintenance');
  };

  if (!log) {
    return <Navigate to="/maintenance" replace />;
  }

  const category = getCategoryById(log.type);
  const categoryLabel = category
    ? (category.isDefault === false || category.is_default === false
      ? category.name || category.id
      : i18n.exists(category.id) ? t(category.id) : category.name || category.id)
    : t('unknown');
  const nextDueOdometer =
    performedAtODO && intervalKm
      ? Number(performedAtODO) + Number(intervalKm)
      : null;

  return (
    <>
      {createPortal(
        <div className="fixed-button-container maintenance-form-actions">
          <div className="max-w-lg mx-auto flex gap-3">
            <button type="button" onClick={() => navigate('/maintenance')} className="flex-1 px-6 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold h-[64px] rounded-[1.5rem] flex items-center justify-center gap-2 transition-all">
              <CaretLeft weight="duotone" className={cn("w-5 h-5", isRtl && "rotate-180")} /> <span>{t('back')}</span>
            </button>
            <button type="button" onClick={() => navigate(`/maintenance/add?type=${log.type}`)} className="px-6 bg-emerald-500/15 dark:bg-emerald-500/10 text-emerald-500 font-bold h-[64px] rounded-[1.5rem] flex items-center justify-center gap-2 transition-all active:scale-[0.98]">
              <CheckCircle weight="duotone" className="w-5 h-5" />
            </button>
            <button type="button" onClick={() => setDeleteModal(true)} className="px-6 bg-red-50 dark:bg-red-500/10 text-red-500 font-bold h-[64px] rounded-[1.5rem] flex items-center justify-center gap-2 transition-all active:scale-[0.98]">
              <Trash weight="duotone" className="w-5 h-5" />
            </button>
            <button type="button" onClick={handleSubmit} disabled={!performedAtODO || !intervalKm} className="flex-[2] px-6 bg-emerald-500 text-white dark:text-slate-950 font-bold h-[64px] rounded-[1.5rem] flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-xl shadow-emerald-500/25 active:scale-[0.98]">
              <FloppyDisk weight="duotone" className="w-5 h-5" /> <span>{t('save')}</span>
            </button>
          </div>
        </div>,
        document.body
      )}

      <PageWrapper className="maintenance-form-screen">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
             <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: category?.color }}><Wrench weight="duotone" className="w-5 h-5" /></div>
             <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white">{categoryLabel}</h2>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('edit')}</p>
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
                  <Input type="number" inputMode="numeric" value={performedAtODO} onChange={(e) => setPerformedAtODO(e.target.value)} placeholder="..." required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="flex items-center gap-2"><Wrench weight="duotone" className="w-4 h-4" /> {t('distance')} (km) *</Label>
                    <Input type="number" inputMode="numeric" value={intervalKm} onChange={(e) => setIntervalKm(e.target.value)} placeholder="..." required />
                  </div>
                  <div>
                    <Label className="flex items-center gap-2"><Shield weight="duotone" className="w-4 h-4" /> {t('safety_margin')}</Label>
                    <Input type="number" inputMode="numeric" value={safetyMarginKm} onChange={(e) => setSafetyMarginKm(e.target.value)} placeholder="..." />
                  </div>
                </div>
                <div>
                  <Label className="flex items-center gap-2"><Tag className="w-4 h-4" /> {t('price')} ({t('currency')})</Label>
                  <Input type="number" inputMode="decimal" step="0.01" min="0" value={cost} onChange={(e) => setCost(e.target.value)} placeholder={t('optional')} />
                </div>
                <div>
                  <Label className="flex items-center gap-2"><Tag className="w-4 h-4" /> {t('notes')}</Label>
                  <textarea className="input-field min-h-[100px]" rows="3" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="..." />
                </div>
                <div className="maintenance-form-preview">
                  <div>
                    <Label className="flex items-center gap-2"><CalendarBlank weight="duotone" className="w-4 h-4" /> Next Due Odometer</Label>
                    <strong>{nextDueOdometer ? `${nextDueOdometer.toLocaleString()} km` : '-'}</strong>
                  </div>
                  <div>
                    <Label className="flex items-center gap-2"><Bell weight="duotone" className="w-4 h-4" /> Reminder</Label>
                    <strong>{safetyMarginKm ? `${Number(safetyMarginKm).toLocaleString()} km before` : 'At due point'}</strong>
                  </div>
                </div>
              </div>
            </Card>
          </form>
        </div>
      </PageWrapper>

      <ConfirmModal isOpen={deleteModal} onClose={() => setDeleteModal(false)} onConfirm={confirmDelete} title={t('delete')} message={t('delete') + "?"} confirmText={t('delete')} cancelText={t('cancel')} variant="danger" />
    </>
  );
}
