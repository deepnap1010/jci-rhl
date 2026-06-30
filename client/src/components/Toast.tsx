// ============================================================
//  TOAST  —  lightweight global notifications
//  Wrap the app in <ToastProvider>, then anywhere:
//     const toast = useToast();
//     toast.success('Saved'); toast.error('Failed'); toast.info('…');
// ============================================================
import { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '../lib/utils';

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem { id: number; kind: ToastKind; message: string }

interface ToastApi {
  show: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastCtx = createContext<ToastApi>({ show: () => {}, success: () => {}, error: () => {}, info: () => {} });
export const useToast = () => useContext(ToastCtx);

// per-kind accent + icon (EKC status tokens)
const STYLE: Record<ToastKind, { color: string; Icon: typeof CheckCircle2 }> = {
  success: { color: 'text-running', Icon: CheckCircle2 },
  error: { color: 'text-stopped', Icon: AlertTriangle },
  info: { color: 'text-accent', Icon: Info },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => setItems((p) => p.filter((t) => t.id !== id)), []);

  const show = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = ++idRef.current;
    setItems((p) => [...p, { id, kind, message }]);
    setTimeout(() => remove(id), 3800);
  }, [remove]);

  const api = useMemo<ToastApi>(() => ({
    show,
    success: (m) => show(m, 'success'),
    error: (m) => show(m, 'error'),
    info: (m) => show(m, 'info'),
  }), [show]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="fixed right-5 bottom-5 z-[2000] flex flex-col gap-2 max-w-[min(380px,92vw)]">
        {items.map((t) => {
          const s = STYLE[t.kind];
          return (
            <div key={t.id} className="toast-in panel shadow-panel px-4 py-3 flex items-center gap-2.5 min-w-[260px]">
              <s.Icon size={18} className={cn('flex-none', s.color)} />
              <span className="flex-1 text-sm text-primary">{t.message}</span>
              <button
                onClick={() => remove(t.id)}
                className="grid place-items-center text-steel hover:text-primary transition-colors"
                aria-label="Dismiss"
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
