/**
 * Shared frontend helpers for the UI Kit pages. Fase 1.
 */
import { useEffect, useState } from 'react';
import { invoke } from '@forge/bridge';

export function useResolver(name, payload) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const key = JSON.stringify(payload ?? null);
  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, data: null, error: null });
    invoke(name, JSON.parse(key))
      .then((res) => {
        if (cancelled) return;
        if (res?.ok) setState({ loading: false, data: res.data, error: null });
        else setState({ loading: false, data: null, error: res?.error ?? 'Unknown error' });
      })
      .catch((err) => {
        if (!cancelled) setState({ loading: false, data: null, error: String(err?.message ?? err) });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, key]);
  return state;
}

export async function call(name, payload) {
  const res = await invoke(name, payload ?? {});
  if (res?.ok) return res.data;
  throw new Error(res?.error ?? 'Unknown error');
}

export function riskAppearance(level) {
  return level === 'high' ? 'removed' : level === 'medium' ? 'moved' : 'success';
}
