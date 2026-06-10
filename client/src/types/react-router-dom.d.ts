// react-router-dom v7 types don't resolve cleanly under this project's
// moduleResolution, so we declare the exports the app uses with loose types.
// This keeps tsc/IDE clean; runtime behavior comes from the real package.
declare module 'react-router-dom' {
  import * as React from 'react';
  export const BrowserRouter: React.FC<{ children?: React.ReactNode }>;
  export const Routes: React.FC<{ children?: React.ReactNode }>;
  export const Route: React.FC<any>;
  export const Navigate: React.FC<{ to: string; replace?: boolean }>;
  export const Link: React.FC<any>;
  export const NavLink: React.FC<any>;
  export function useLocation(): { pathname: string; search: string; hash: string; state: any; key: string };
  export function useNavigate(): (to: string | number, opts?: any) => void;
  export function useParams<T = Record<string, string>>(): T;
  export function useSearchParams(): [URLSearchParams, (next: any) => void];
}
