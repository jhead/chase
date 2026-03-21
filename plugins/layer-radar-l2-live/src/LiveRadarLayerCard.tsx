import { useState, useEffect } from "react";
import styled from "@emotion/styled";
import { RADAR_SITES } from "../../../src/data/radarSites";
import { useWasm } from "../../../src/ctx/WasmContext";
import type { UiRadarLayerState } from "../../../src/ctx/WasmContext";
import { theme } from "../../../src/components/NexradPage/theme";
import { LayerCard } from "../../../src/components/NexradPage/LayerCard";
import type { SidebarCardProps } from "../../../src/plugins/registry";
import type { LiveRadarLayer, Product } from "./types";
import { PRODUCT_MOMENT } from "./types";

/** Shared mutable status updated by the layer effect, read by the card UI. */
export const liveStreamStatus = new Map<
  string,
  { lastUpdateTime: number; nextUpdateMs: number | null }
>();

const PRODUCTS: { id: Product; label: string }[] = [
  { id: "REF", label: "Reflectivity" },
  { id: "VEL", label: "Velocity" },
  { id: "SW", label: "Spec. Width" },
  { id: "ZDR", label: "Diff. Refl." },
  { id: "CC", label: "Corr. Coeff." },
  { id: "PHIDP", label: "Diff. Phase" },
];

const TILT_LABELS = [
  "0.5\u00b0",
  "0.9\u00b0",
  "1.3\u00b0",
  "1.8\u00b0",
  "2.4\u00b0",
  "3.1\u00b0",
  "4.0\u00b0",
  "5.1\u00b0",
  "6.4\u00b0",
  "8.0\u00b0",
  "10.0\u00b0",
  "12.5\u00b0",
  "15.6\u00b0",
  "19.5\u00b0",
];

export function LiveRadarLayerCard({
  layer,
  canRemove,
  onToggle,
  onRemove,
  onUpdateLayer,
}: SidebarCardProps<LiveRadarLayer>) {
  const [search, setSearch] = useState("");
  const { uiState, sendCommand } = useWasm();

  // Timing display: "Xs ago · next in Ys"
  const [timingText, setTimingText] = useState<string>("");

  const layerUiState: UiRadarLayerState | null =
    uiState.radar_layers.find((s) => s.layer_id === layer.id) ?? null;

  // Tick every second to update timing text
  useEffect(() => {
    if (!layer.enabled || !layer.siteId) {
      setTimingText("");
      return;
    }
    const interval = setInterval(() => {
      const status = liveStreamStatus.get(layer.id);
      if (!status) return;

      const agoSec = Math.round((Date.now() - status.lastUpdateTime) / 1000);
      const agoPart = agoSec < 3 ? "just now" : `${agoSec}s ago`;

      let nextPart = "";
      if (status.nextUpdateMs !== null) {
        // nextUpdateMs was measured at lastUpdateTime; compute remaining
        const elapsedSinceUpdate = Date.now() - status.lastUpdateTime;
        const remainingMs = status.nextUpdateMs - elapsedSinceUpdate;
        const remainingSec = Math.max(0, Math.round(remainingMs / 1000));
        nextPart = remainingSec <= 0 ? " · updating…" : ` · next in ${remainingSec}s`;
      }

      setTimingText(agoPart + nextPart);
    }, 1000);
    return () => clearInterval(interval);
  }, [layer.enabled, layer.siteId, layer.id]);

  const filtered =
    search.length >= 1
      ? RADAR_SITES.filter(
          (s) =>
            s.id.toLowerCase().includes(search.toLowerCase()) ||
            s.name.toLowerCase().includes(search.toLowerCase()),
        ).slice(0, 12)
      : [];

  function handleSiteSelect(siteId: string) {
    setSearch("");
    onUpdateLayer({ siteId } as Partial<LiveRadarLayer>);
  }

  function handleToggle() {
    const visible = !layer.enabled;
    sendCommand({ type: "SetLayerVisible", layer_id: layer.id, visible });
    onToggle();
  }

  const label = layer.siteId ? `Radar (Live) \u2014 ${layer.siteId}` : "Radar (Live)";

  return (
    <LayerCard
      label={label}
      enabled={layer.enabled}
      onToggle={handleToggle}
      onRemove={canRemove ? onRemove : undefined}
    >
      {/* Live badge */}
      {layer.enabled && layer.siteId && (
        <LiveBadgeRow>
          <LiveDot />
          <LiveLabel>LIVE</LiveLabel>
          {timingText && <TimingInfo>{timingText}</TimingInfo>}
        </LiveBadgeRow>
      )}

      {/* Site */}
      <Row>
        <SubLabel>Site</SubLabel>
        {layer.siteId && <SiteTag>{layer.siteId}</SiteTag>}
      </Row>
      <SearchInput
        placeholder="Search ID or name\u2026"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {filtered.length > 0 && (
        <SiteList>
          {filtered.map((site) => (
            <SiteItem key={site.id} onClick={() => handleSiteSelect(site.id)}>
              <SiteId>{site.id}</SiteId>
              <SiteName>{site.name}</SiteName>
            </SiteItem>
          ))}
        </SiteList>
      )}

      {/* Tilt */}
      <SliderHeader>
        <SubLabel>Tilt</SubLabel>
        <SliderValue>{TILT_LABELS[layer.tiltIndex] ?? `#${layer.tiltIndex}`}</SliderValue>
      </SliderHeader>
      <Slider
        type="range"
        min={0}
        max={TILT_LABELS.length - 1}
        value={layer.tiltIndex}
        onChange={(e) =>
          onUpdateLayer({ tiltIndex: Number(e.target.value) } as Partial<LiveRadarLayer>)
        }
      />

      {/* Product */}
      <SubLabel>Product</SubLabel>
      <ProductGrid>
        {PRODUCTS.map(({ id, label: plabel }) => {
          const momentName = PRODUCT_MOMENT[id];
          const available =
            !layerUiState || layerUiState.available_moments.includes(momentName);
          return (
            <ProductBtn
              key={id}
              active={layer.product === id}
              disabled={!available}
              title={available ? plabel : `${plabel} \u2014 not in this scan`}
              onClick={() => {
                if (!available) return;
                onUpdateLayer({ product: id } as Partial<LiveRadarLayer>);
                sendCommand({
                  type: "SetActiveMoment",
                  layer_id: layer.id,
                  moment: momentName,
                });
              }}
            >
              {id}
            </ProductBtn>
          );
        })}
      </ProductGrid>
    </LayerCard>
  );
}

// ── Styled components ─────────────────────────────────────────────────────────

const LiveBadgeRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const LiveDot = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ff4444;
  animation: pulse 1.5s ease-in-out infinite;

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }
`;

const LiveLabel = styled.span`
  font-family: ${theme.fontMono};
  font-size: 10px;
  font-weight: 700;
  color: #ff4444;
  letter-spacing: 0.08em;
`;

const TimingInfo = styled.span`
  font-family: ${theme.fontMono};
  font-size: 10px;
  color: ${theme.textDim};
  margin-left: auto;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const SubLabel = styled.span`
  font-family: ${theme.fontSans};
  font-size: 10px;
  color: ${theme.textSecondary};
`;

const SiteTag = styled.span`
  font-family: ${theme.fontMono};
  font-size: 11px;
  font-weight: 600;
  color: ${theme.accent};
`;

const SearchInput = styled.input`
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid ${theme.border};
  border-radius: ${theme.radius};
  color: ${theme.textPrimary};
  font-family: ${theme.fontSans};
  font-size: 12px;
  padding: 4px 8px;
  outline: none;
  &::placeholder {
    color: ${theme.textDim};
  }
  &:focus {
    border-color: ${theme.accent};
  }
`;

const SiteList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 160px;
  overflow-y: auto;
`;

const SiteItem = styled.button`
  background: none;
  border: none;
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 4px 6px;
  border-radius: ${theme.radius};
  cursor: pointer;
  text-align: left;
  &:hover {
    background: ${theme.bgHover};
  }
`;

const SiteId = styled.span`
  font-family: ${theme.fontMono};
  font-size: 12px;
  font-weight: 600;
  color: ${theme.accent};
  flex-shrink: 0;
`;

const SiteName = styled.span`
  font-family: ${theme.fontSans};
  font-size: 11px;
  color: ${theme.textSecondary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ProductGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 4px;
`;

const ProductBtn = styled.button<{ active?: boolean; disabled?: boolean }>`
  background: ${({ active }) => (active ? theme.bgActive : "rgba(255,255,255,0.04)")};
  border: 1px solid ${({ active }) => (active ? theme.accent : theme.border)};
  border-radius: ${theme.radius};
  color: ${({ active, disabled }) =>
    disabled ? theme.textDim : active ? theme.accent : theme.textSecondary};
  font-family: ${theme.fontMono};
  font-size: 12px;
  font-weight: 600;
  padding: 5px;
  cursor: ${({ disabled }) => (disabled ? "default" : "pointer")};
  opacity: ${({ disabled }) => (disabled ? 0.4 : 1)};
  &:hover:not(:disabled) {
    border-color: ${theme.accentHover};
  }
`;

const SliderHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const SliderValue = styled.span`
  font-family: ${theme.fontMono};
  font-size: 11px;
  color: ${theme.accent};
`;

const Slider = styled.input`
  width: 100%;
  accent-color: ${theme.accent};
  cursor: pointer;
`;
