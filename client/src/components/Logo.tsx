// client/src/components/Logo.tsx
// ============================================================
//  COMPANY LOGO  —  theme-aware
//  The artwork lives at  client/public/logo.png  (transparent, original
//  colours) with a white knock-out twin at  client/public/logo-dark.png.
//  Both are rendered; CSS shows the colour one on light surfaces and the
//  white one on dark surfaces (driven by [data-theme] on <html>), so the
//  mark always reads correctly and never sits on a white box. Until the
//  files exist, a branded "JC" monogram placeholder is shown instead.
// ============================================================
import { useState } from 'react';
import { cn } from '../lib/utils';

const BRAND = '#9E5B5B'; // Jain Cord maroon
const V = '2';           // bump to bust the browser cache when the artwork changes

export function Logo({
  className = '',
  imgClassName = 'h-14 w-auto max-w-[180px] object-contain',
  tagline = 'Production Monitor',
}: { className?: string; imgClassName?: string; tagline?: string }) {
  const [failed, setFailed] = useState(false);

  if (!failed) {
    return (
      <>
        <img src={`/logo.png?v=${V}`} alt="Jain Cord" className={cn('brand-logo brand-logo--light', imgClassName, className)} onError={() => setFailed(true)} />
        <img src={`/logo-dark.png?v=${V}`} alt="Jain Cord" className={cn('brand-logo brand-logo--dark', imgClassName, className)} onError={() => setFailed(true)} />
      </>
    );
  }

  // fallback — branded monogram + wordmark (shown only until logo.png is added)
  return (
    <span className={cn('inline-flex items-center gap-2.5 min-w-0', className)}>
      <span className="w-9 h-9 rounded-lg grid place-items-center font-extrabold text-[15px] shrink-0" style={{ background: `${BRAND}1a`, color: BRAND }}>JC</span>
      <span className="leading-tight min-w-0">
        <span className="block font-extrabold text-sm tracking-wide truncate" style={{ color: BRAND }}>JAIN CORD</span>
        {tagline && <span className="block text-[10px] text-steel truncate">{tagline}</span>}
      </span>
    </span>
  );
}
