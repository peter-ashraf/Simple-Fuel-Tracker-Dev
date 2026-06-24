import { useState } from 'react';
import { Card, Modal, cn } from './ui';
import { Check, X, Warning, CaretRight, FloppyDisk, Trash, Stack } from '@phosphor-icons/react';

export default function ImportResolver({ analysis, onCancel, onApply }) {
  const [currentStep, setCurrentStep] = useState(0); // 0: Overview, 1: Conflicts, 2: New Records
  const [conflictIndex, setConflictIndex] = useState(0);
  const [resolutions, setResolutions] = useState([]); // [{id, type, action, data}]
  const [newRecordActions, setNewRecordActions] = useState(
    analysis.newRecords.map(r => ({ ...r, action: 'add' }))
  );

  const conflicts = analysis.conflicts;
  const newRecords = analysis.newRecords;
  const typeCounts = [...conflicts, ...newRecords].reduce((counts, record) => {
    const key = record.type || 'record';
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});

  const handleResolve = (action) => {
    const conflict = conflicts[conflictIndex];
    const resolution = {
      id: conflict.id,
      type: conflict.type,
      action,
      data: action === 'backup' ? conflict.backup : conflict.local
    };

    setResolutions(prev => [...prev, resolution]);

    if (conflictIndex < conflicts.length - 1) {
      setConflictIndex(prev => prev + 1);
    } else if (newRecords.length > 0) {
      setCurrentStep(2);
    } else {
      onApply(resolutions.concat([resolution]), newRecordActions);
    }
  };

  const handleBulkResolve = (action) => {
    const remainingConflicts = conflicts.slice(conflictIndex).map(c => ({
      id: c.id,
      type: c.type,
      action,
      data: action === 'backup' ? c.backup : c.local
    }));
    
    const allResolutions = resolutions.concat(remainingConflicts);
    
    if (newRecords.length > 0) {
      setResolutions(allResolutions);
      setCurrentStep(2);
    } else {
      onApply(allResolutions, newRecordActions);
    }
  };

  const toggleNewRecord = (index) => {
    setNewRecordActions(prev => prev.map((r, i) => 
      i === index ? { ...r, action: r.action === 'add' ? 'ignore' : 'add' } : r
    ));
  };

  const renderOverview = () => (
    <div className="space-y-6 py-4">
      <div className="text-center space-y-2">
        <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto">
          <Stack weight="duotone" className="text-blue-500 w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-white">Review Backup Data</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          We analyzed your file and found the following:
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
          <span className="text-2xl font-bold text-slate-900 dark:text-white">{conflicts.length}</span>
          <p className="text-xs text-slate-500 font-semibold uppercase mt-1">Conflicts</p>
        </div>
        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
          <span className="text-2xl font-bold text-slate-900 dark:text-white">{newRecords.length}</span>
          <p className="text-xs text-slate-500 font-semibold uppercase mt-1">New Records</p>
        </div>
      </div>

      <div className="bg-emerald-500/5 p-4 rounded-2xl border border-emerald-500/20">
        <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
          <Check weight="duotone" className="w-4 h-4" />
          {analysis.identical} records are already identical and will be skipped.
        </p>
      </div>

      {Object.keys(typeCounts).length > 0 && (
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
            Backup contents needing review
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(typeCounts).map(([type, count]) => (
              <span
                key={type}
                className="rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300"
              >
                {count} {type.replaceAll('-', ' ')}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <button onClick={onCancel} className="flex-1 py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-semibold text-sm">
          Cancel
        </button>
        <button 
          onClick={() => conflicts.length > 0 ? setCurrentStep(1) : setCurrentStep(2)}
          disabled={conflicts.length === 0 && newRecords.length === 0}
          className="flex-1 py-3 px-4 rounded-xl bg-blue-500 text-slate-950 font-bold text-sm shadow-lg shadow-blue-500/20"
        >
          {conflicts.length === 0 && newRecords.length === 0 ? "Nothing to Import" : "Start Import"}
        </button>
      </div>
    </div>
  );

  const renderConflict = () => {
    const conflict = conflicts[conflictIndex];
    const isFillup = conflict.type === 'fillup';

    return (
      <div className="space-y-6 py-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Resolve Conflict</h3>
          <span className="text-xs font-bold bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full text-slate-500">
            {conflictIndex + 1} / {conflicts.length}
          </span>
        </div>

        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-3">
          <Warning weight="duotone" className="text-amber-500 shrink-0" size={20} />
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            {conflict.label}
          </p>
        </div>

        <div className="space-y-4 max-h-[400px] overflow-y-auto px-1">
          {/* Current Version */}
          <Card className={cn("p-4 border-2 transition-all", "border-slate-200 dark:border-slate-800")}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-500 uppercase">Current Version</span>
            </div>
            <div className="space-y-2">
              {isFillup ? (
                <>
                  <div className="flex justify-between text-sm"><span className="text-slate-500">Odometer:</span> <span className="font-semibold text-slate-900 dark:text-white">{conflict.local.odometer} km</span></div>
                  <div className="flex justify-between text-sm"><span className="text-slate-500">Liters:</span> <span className="font-semibold text-slate-900 dark:text-white">{conflict.local.liters} L</span></div>
                  <div className="flex justify-between text-sm"><span className="text-slate-500">Total Price:</span> <span className="font-semibold text-slate-900 dark:text-white">{conflict.local.totalPrice} EGP</span></div>
                </>
              ) : (
                <div className="flex justify-between text-sm"><span className="text-slate-500">Name:</span> <span className="font-semibold text-slate-900 dark:text-white">{conflict.local.name}</span></div>
              )}
            </div>
            <button 
              onClick={() => handleResolve('current')}
              className="w-full mt-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Keep Current
            </button>
          </Card>

          {/* Backup Version */}
          <Card className={cn("p-4 border-2 transition-all border-blue-500/30 bg-blue-500/5 shadow-lg shadow-blue-500/5")}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-blue-500 uppercase">Backup Version</span>
              <Check weight="duotone" className="text-blue-500 w-4 h-4" />
            </div>
            <div className="space-y-2">
              {isFillup ? (
                <>
                  <div className="flex justify-between text-sm"><span className="text-slate-500">Odometer:</span> <span className="font-semibold text-slate-900 dark:text-white">{conflict.backup.odometer} km</span></div>
                  <div className="flex justify-between text-sm"><span className="text-slate-500">Liters:</span> <span className="font-semibold text-slate-900 dark:text-white">{conflict.backup.liters} L</span></div>
                  <div className="flex justify-between text-sm"><span className="text-slate-500">Total Price:</span> <span className="font-semibold text-slate-900 dark:text-white">{conflict.backup.totalPrice} EGP</span></div>
                </>
              ) : (
                <div className="flex justify-between text-sm"><span className="text-slate-500">Name:</span> <span className="font-semibold text-slate-900 dark:text-white">{conflict.backup.name}</span></div>
              )}
            </div>
            <button 
              onClick={() => handleResolve('backup')}
              className="w-full mt-4 py-2.5 rounded-xl bg-blue-500 text-slate-950 text-sm font-bold hover:bg-blue-400 transition-colors"
            >
              Use Backup
            </button>
          </Card>

          <button 
            onClick={() => handleResolve('remove_both')}
            className="w-full py-3 rounded-xl border border-red-500/20 text-red-500 text-xs font-bold hover:bg-red-500/5 transition flex items-center justify-center gap-2"
          >
            <Trash weight="duotone" size={14} /> Remove From Both
          </button>
        </div>

        {conflicts.length > 1 && (
          <div className="flex gap-3 pt-2 border-t border-slate-200 dark:border-slate-800 mt-2">
            <button onClick={() => handleBulkResolve('current')} className="flex-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider hover:text-slate-700">Keep All Remaining Current</button>
            <button onClick={() => handleBulkResolve('backup')} className="flex-1 text-[10px] font-bold text-blue-500 uppercase tracking-wider hover:text-blue-400 text-right">Use All Remaining Backup</button>
          </div>
        )}
      </div>
    );
  };

  const renderNewRecords = () => (
    <div className="space-y-6 py-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">New Records Found</h3>
        <span className="text-xs font-bold bg-emerald-500/10 px-2.5 py-1 rounded-full text-emerald-500">
          {newRecordActions.filter(r => r.action === 'add').length} to add
        </span>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        These records exist in the backup but not in your local data. Select which ones to import:
      </p>

      <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
        {newRecordActions.map((record, idx) => (
          <div 
            key={idx} 
            onClick={() => toggleNewRecord(idx)}
            className={cn(
              "flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer",
              record.action === 'add' 
                ? "bg-emerald-500/5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400" 
                : "bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800 text-slate-400"
            )}
          >
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-lg", record.action === 'add' ? "bg-emerald-500/20" : "bg-slate-200 dark:bg-slate-800")}>
                {record.type === 'fillup' ? <CaretRight weight="duotone" size={16} /> : <FloppyDisk weight="duotone" size={16} />}
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold">
                  {record.type === 'fillup' ? `Fill-up: ${record.data.odometer} km` : record.data.name}
                </span>
                <span className="text-[10px] opacity-70 uppercase tracking-tighter">
                  {record.type === 'fillup' ? new Date(record.data.timestamp).toLocaleDateString() : 'Vehicle Record'}
                </span>
              </div>
            </div>
            {record.action === 'add' ? <Check weight="duotone" size={18} /> : <X weight="duotone" size={18} />}
          </div>
        ))}
      </div>

      <div className="flex gap-3 pt-4">
        <button 
          onClick={() => onApply(resolutions, newRecordActions)}
          className="w-full py-4 rounded-2xl bg-emerald-500 text-slate-950 font-bold shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
        >
          <FloppyDisk weight="duotone" size={18} /> Complete Import
        </button>
      </div>
    </div>
  );

  return (
    <Modal isOpen={true} onClose={onCancel}>
      <div className="px-1">
        {currentStep === 0 && renderOverview()}
        {currentStep === 1 && renderConflict()}
        {currentStep === 2 && renderNewRecords()}
      </div>
    </Modal>
  );
}
