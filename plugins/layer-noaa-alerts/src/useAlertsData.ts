import { useState, useEffect, useCallback } from "react";
import type { AlertsLayer } from "./types";

const IEM_SBW_URL = "https://mesonet.agron.iastate.edu/geojson/sbw.geojson";
const POLL_MS = 30_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AlertFeature {
  id: string;
  phenomena: string;
  significance: string;
  wfo: string;
  issued: string;
  expires: string;
  ps: string;
  raw?: string;
  coordinates: [number, number][][];
  color: [number, number, number, number];
}

interface IEMFeatureProperties {
  phenomena?: string;
  significance?: string;
  wfo?: string;
  issue?: string;
  expire?: string;
  expire_utc?: string;
  ps?: string;
  product_id?: string;
  [key: string]: unknown;
}

interface IEMFeature {
  type: "Feature";
  id?: string;
  properties?: IEMFeatureProperties;
  geometry?: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
}

interface IEMFeatureCollection {
  type: "FeatureCollection";
  features: IEMFeature[];
}

// ── Color mapping ────────────────────────────────────────────────────────────

function colorForPhenomenaSignificance(
  phenomena: string,
  significance: string
): [number, number, number, number] {
  const p = (phenomena || "").toUpperCase();
  const s = (significance || "").toUpperCase();
  if (p === "TO" && s === "W") return [1, 0, 0, 0.5];
  if (p === "TO" && s === "A") return [1, 0.65, 0, 0.4];
  if (p === "SV" && s === "W") return [1, 1, 0, 0.4];
  if (p === "SV" && s === "A") return [0.85, 0.65, 0.13, 0.4];
  if (p === "FF" && s === "W") return [0, 0.5, 0, 0.4];
  if (p === "WS" && s === "W") return [1, 0.41, 0.71, 0.4];
  if (p === "FL" && s === "W") return [0, 0.5, 0, 0.4];
  return [0.71, 0.71, 0.71, 0.3];
}

// ── Extract first polygon ring from GeoJSON geometry ──────────────────────────

function extractRings(geom: IEMFeature["geometry"]): [number, number][][] {
  if (!geom?.coordinates) return [];
  const coords = geom.coordinates;
  if (geom.type === "Polygon") {
    return (coords as number[][][]).map((ring) =>
      ring.map((c) => [c[0], c[1]] as [number, number])
    );
  }
  if (geom.type === "MultiPolygon") {
    const rings: [number, number][][] = [];
    for (const poly of coords as number[][][][]) {
      for (const ring of poly) {
        rings.push(ring.map((c) => [c[0], c[1]] as [number, number]));
      }
    }
    return rings;
  }
  return [];
}

function firstOuterRing(geom: IEMFeature["geometry"]): [number, number][] {
  const rings = extractRings(geom);
  return rings[0] ?? [];
}

// ── Fetch and parse ───────────────────────────────────────────────────────────

async function fetchSBW(): Promise<AlertFeature[]> {
  const res = await fetch(IEM_SBW_URL);
  if (!res.ok) throw new Error(`IEM SBW fetch failed: ${res.status}`);
  const data = (await res.json()) as IEMFeatureCollection;
  if (!data?.features?.length) return [];

  const out: AlertFeature[] = [];
  for (const f of data.features) {
    const props = f.properties ?? {};
    const phenomena = props.phenomena ?? "";
    const significance = props.significance ?? "";
    const ring = firstOuterRing(f.geometry);
    if (ring.length < 3) continue;

    const id =
      typeof f.id === "string"
        ? f.id
        : `${props.wfo ?? "?"}.${phenomena}.${significance}.${props.eventid ?? "?"}`;
    const color = colorForPhenomenaSignificance(phenomena, significance);

    out.push({
      id,
      phenomena,
      significance,
      wfo: String(props.wfo ?? "?"),
      issued: String(props.issue ?? props.polygon_begin ?? ""),
      expires: String(props.expire ?? props.expire_utc ?? ""),
      ps: String(props.ps ?? ""),
      raw: undefined,
      coordinates: [ring],
      color,
    });
  }
  return out;
}

// ── Filter by layer config ───────────────────────────────────────────────────

function filterAlerts(
  features: AlertFeature[],
  layer: AlertsLayer | undefined
): AlertFeature[] {
  if (!layer) return [];
  const { phenomena: wantP, significance: wantS } = layer;
  return features.filter((f) => {
    if (wantP.length && !wantP.includes(f.phenomena)) return false;
    if (wantS.length && !wantS.includes(f.significance)) return false;
    return true;
  });
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface UseAlertsDataResult {
  alertsData: AlertFeature[];
  alertCount: number;
  lastUpdated: Date | null;
  error: Error | null;
}

export function useAlertsData(
  layer: AlertsLayer | undefined
): UseAlertsDataResult {
  const [rawFeatures, setRawFeatures] = useState<AlertFeature[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!layer?.enabled) return;
    try {
      setError(null);
      const data = await fetchSBW();
      setRawFeatures(data);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [layer?.enabled]);

  useEffect(() => {
    fetchData();
    if (!layer?.enabled) return;
    const id = setInterval(fetchData, POLL_MS);
    return () => clearInterval(id);
  }, [fetchData, layer?.enabled]);

  const alertsData = filterAlerts(rawFeatures, layer);
  return {
    alertsData,
    alertCount: alertsData.length,
    lastUpdated,
    error,
  };
}
