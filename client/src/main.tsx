// client/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { applyTheme } from './lib/theme';   // ← ADD

// Apply the saved (or OS-preferred) theme before first paint.
applyTheme();                                // ← ADD

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);