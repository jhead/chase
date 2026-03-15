import { useSyncExternalStore } from "react";
import type { AlertFeature } from "./useAlertsData";

interface AlertsState {
  activeAlertId: string | null;
  dataByLayer: Map<string, AlertFeature[]>;
  metaByLayer: Map<string, { alertCount: number; lastUpdated: Date | null }>;
}

const state: AlertsState = {
  activeAlertId: null,
  dataByLayer: new Map(),
  metaByLayer: new Map(),
};

let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version++;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function getSnapshot() {
  return version;
}

export function setActiveAlertId(id: string | null) {
  state.activeAlertId = id;
  emit();
}

export function setAlertsData(layerId: string, data: AlertFeature[]) {
  const prev = state.dataByLayer.get(layerId);
  // Only emit (and update lastUpdated) when the actual alert IDs change to avoid
  // triggering re-renders from filtered-but-unchanged data every poll cycle.
  const prevIds = prev ? prev.map((a) => a.id).join("\0") : null;
  const newIds = data.map((a) => a.id).join("\0");
  state.dataByLayer.set(layerId, data);
  if (prevIds !== newIds) {
    state.metaByLayer.set(layerId, { alertCount: data.length, lastUpdated: new Date() });
    emit();
  }
}

export function useAlertsStore() {
  useSyncExternalStore(subscribe, getSnapshot);
  return state;
}

export function useAlertsMeta(layerId: string) {
  useSyncExternalStore(subscribe, getSnapshot);
  return state.metaByLayer.get(layerId) ?? { alertCount: 0, lastUpdated: null };
}

export function useActiveAlert() {
  useSyncExternalStore(subscribe, getSnapshot);
  if (!state.activeAlertId) return null;
  for (const data of state.dataByLayer.values()) {
    const found = data.find((a) => a.id === state.activeAlertId);
    if (found) return found;
  }
  return null;
}

export function useActiveAlertId() {
  useSyncExternalStore(subscribe, getSnapshot);
  return state.activeAlertId;
}
