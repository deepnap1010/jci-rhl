// ============================================================
//  TOAST  —  lightweight global notifications
//  Wrap the app in <ToastProvider>, then anywhere:
//     const toast = useToast();
//     toast.success('Saved'); toast.error('Failed'); toast.info('…');
// ============================================================
import { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

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

const STYLE: Record<ToastKind, { bg: string; border: string; color: string; Icon: typeof CheckCircle2 }> = {
  success: { bg: '#ecfdf3', border: '#a6e9c2', color: '#067647', Icon: CheckCircle2 },
  error: { bg: '#fef3f2', border: '#f5b5ad', color: '#b42318', Icon: AlertCircle },
  info: { bg: '#eff6ff', border: '#b2cffe', color: '#1453a8', Icon: Info },
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
      <div style={container}>
        {items.map((t) => {
          const s = STYLE[t.kind];
          return (
            <div key={t.id} className="toast-in" style={{ ...toastBase, background: s.bg, border: `1px solid ${s.border}`, color: s.color }}>
              <s.Icon size={18} style={{ flex: 'none' }} />
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{t.message}</span>
              <button onClick={() => remove(t.id)} style={{ border: 'none', background: 'none', color: s.color, cursor: 'pointer', display: 'grid', placeItems: 'center', opacity: 0.7 }} aria-label="Dismiss"><X size={15} /></button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

const container: React.CSSProperties = {
  position: 'fixed', right: 20, bottom: 20, zIndex: 200,
  display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 'min(380px, 92vw)',
};
const toastBase: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
  borderRadius: 12, boxShadow: '0 12px 32px rgba(20,28,46,.16)',
};
