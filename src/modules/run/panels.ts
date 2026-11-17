// Which full-screen panel is open over the dashboard (the expanded map, the
// route weather or the camera pulse check). Kept outside the dashboard so the live screen can draw it
// over the scrolling numbers, under Pause.

import { useSyncExternalStore } from 'react';

export type PanelId = 'map' | 'weather' | 'pulse' | null;
let panel: PanelId = null;
const listeners = new Set<() => void>();
export const openPanel = (p: Exclude<PanelId, null>) => { panel = p; listeners.forEach((l) => l()); };
export const closePanel = () => { panel = null; listeners.forEach((l) => l()); };
export const usePanel = (): PanelId =>
  useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => panel, () => panel);
