import { useEffect, useRef, useState } from 'react';

// Paginated fetch with a per-instance cache + next-page prefetch.
//
//  • While you view a page, the NEXT page is fetched in the background and cached.
//  • Returning to an already-visited page is served from cache — no server hit.
//  • The cache lives in a ref scoped to the component, so it is dropped automatically when the
//    component unmounts (e.g. a modal closes) — exactly "clear the cache on close, reduce load".
//  • Changing `cacheKey` (different machine / filters) resets the cache.
//
// `fetchPage` must return an object that includes `pages` (total page count) so prefetch knows
// when to stop. Keep it memoised (useCallback) on the same inputs as `cacheKey`.
export function usePagedData<T extends { pages: number }>(
  cacheKey: string,
  fetchPage: (page: number, signal?: AbortSignal) => Promise<T>,
  page: number,
): { data: T | null; loading: boolean } {
  const cache = useRef(new Map<number, T>());
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  // a new dataset (machine / filters changed) → drop the cached pages
  useEffect(() => { cache.current.clear(); setData(null); }, [cacheKey]);

  // load the requested page: instant from cache, else fetch (abortable)
  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    const cached = cache.current.get(page);
    if (cached) { setData(cached); setLoading(false); return () => { alive = false; ctrl.abort(); }; }
    setLoading(true);
    fetchPage(page, ctrl.signal)
      .then((d) => { if (alive) { cache.current.set(page, d); setData(d); } })
      .catch((e: { code?: string; name?: string }) => {
        if (alive && e?.code !== 'ERR_CANCELED' && e?.name !== 'CanceledError') setData(null);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; ctrl.abort(); };
  }, [page, cacheKey, fetchPage]);

  // prefetch the next page in the background — fire-and-forget so it isn't aborted on navigation,
  // and only when it isn't already cached and is within range.
  const pages = data?.pages ?? 1;
  useEffect(() => {
    const next = page + 1;
    if (next <= pages && !cache.current.has(next)) {
      fetchPage(next).then((d) => cache.current.set(next, d)).catch(() => { /* background; ignore */ });
    }
  }, [page, pages, cacheKey, fetchPage]);

  return { data, loading };
}
