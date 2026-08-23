import { createPortal } from 'react-dom';
import { Edit3, X } from 'lucide-react';
import { PrintablePCR } from './PCRWidgets';

export function PCRPreviewModal({ record, onClose, onEdit }) {
  if (!record) return null;

  return createPortal((
    <div className="fixed inset-0 z-[5000] flex items-start justify-center overflow-y-auto bg-black/70 p-3 md:p-5" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" onMouseDown={event => event.stopPropagation()}>
        <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-card p-3">
          <div>
            <h2 className="font-bold">{record.responseNumber || 'Patient Care Report'}</h2>
            <p className="text-xs text-muted-foreground">{record.patientName || 'Unnamed patient'}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {onEdit && (
              <button onClick={() => onEdit(record)} className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-2 text-xs">
                <Edit3 size={14} />Edit
              </button>
            )}
            <button onClick={onClose} aria-label="Close PCR preview" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-secondary text-foreground hover:bg-secondary/80">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="overflow-auto bg-slate-300 p-4">
          <div className="mx-auto max-w-[210mm] shadow-xl"><PrintablePCR record={record} /></div>
        </div>
      </div>
    </div>
  ), document.body);
}

export default PCRPreviewModal;
