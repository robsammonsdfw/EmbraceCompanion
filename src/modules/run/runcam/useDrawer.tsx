// The hidden drawing page for a Runcam screen: put `element` anywhere in the
// screen, and call `drawer` when there is something to draw. Calls made before
// the page has finished loading wait for it.

import { useMemo, useRef, type ReactElement } from 'react';

import { DrawingHost, type DrawingHostHandle } from '@/shell/DrawingHost';

import { DRAWING_SCRIPT, makeDrawer, type Drawer } from './drawing';

const START_TIMEOUT_MS = 15000;

export const useDrawer = (onError?: (message: string) => void): { element: ReactElement; drawer: Drawer } => {
  const host = useRef<DrawingHostHandle>(null);
  const gate = useRef<{ promise: Promise<void>; open: () => void } | null>(null);
  if (!gate.current) {
    let open: () => void = () => undefined;
    const promise = new Promise<void>((resolve) => { open = resolve; });
    gate.current = { promise, open };
  }
  const drawer = useMemo(() => makeDrawer(async <T,>(message: unknown, timeoutMs?: number): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('The drawing page didn’t start. Close Runcam and open it again.')), START_TIMEOUT_MS); });
    try { await Promise.race([gate.current!.promise, late]); } finally { if (timer) clearTimeout(timer); }
    if (!host.current) throw new Error('The drawing page closed.');
    return host.current.ask<T>(message, timeoutMs);
  }), []);
  const element = <DrawingHost ref={host} script={DRAWING_SCRIPT} onReady={() => gate.current?.open()} onError={onError} />;
  return { element, drawer };
};
