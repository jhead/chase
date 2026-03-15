import { useState } from "react";
import styled from "@emotion/styled";
import { ChevronRight, ChevronLeft, Layers } from "lucide-react";
import { useWasm } from "../../ctx/WasmContext";
import { theme } from "./theme";
import type { AnimationState } from "../../hooks/useMultiLayerAnimation";
import type { Layer, AlertsLayer, RadarLayer, SitesLayer, Product } from "../../hooks/useLayers";
import type { AlertFeature } from "../../hooks/useAlertsData";
import { LayerCard } from "./LayerCard";
import { RadarLayerCard } from "./RadarLayerCard";
import { AlertsLayerCard } from "./AlertsLayerCard";

interface SidebarProps {
  animationState: AnimationState;
  onSetSpeed: (speed: number) => void;
  onToggleLoop: () => void;
  onSelectSite: (layerId: string, siteId: string) => void;
  layers: Layer[];
  addLayer: (kind: "radar" | "radar-sites") => void;
  removeLayer: (id: string) => void;
  updateLayer: <T extends Layer>(id: string, updates: Partial<T>) => void;
  activeAlert: AlertFeature | null;
  onDismissAlert: () => void;
  alertCount: number;
  lastUpdated: Date | null;
}

export function Sidebar({
  animationState,
  onSetSpeed,
  onToggleLoop,
  onSelectSite,
  layers,
  addLayer,
  removeLayer,
  updateLayer,
  activeAlert,
  onDismissAlert,
  alertCount,
  lastUpdated,
}: SidebarProps) {
  const [expanded, setExpanded] = useState(true);
  const { uiState, sendCommand } = useWasm();

  const radarLayers = layers.filter((l): l is RadarLayer => l.kind === "radar");
  const alertsLayers = layers.filter((l): l is AlertsLayer => l.kind === "nws-alerts");

  if (!expanded) {
    return (
      <Collapsed>
        <CollapseBtn title="Expand sidebar" onClick={() => setExpanded(true)}>
          <ChevronRight size={14} strokeWidth={1.5} />
        </CollapseBtn>
        <IconStub title="Layers">
          <Layers size={14} strokeWidth={1.5} />
        </IconStub>
      </Collapsed>
    );
  }

  return (
    <Panel>
      <CollapseRow>
        <SectionLabel>Controls</SectionLabel>
        <CollapseBtn title="Collapse sidebar" onClick={() => setExpanded(false)}>
          <ChevronLeft size={14} strokeWidth={1.5} />
        </CollapseBtn>
      </CollapseRow>

      {/* Layers */}
      <Section>
        <SectionLabel>Layers</SectionLabel>

        {/* Radar sites (clickable icons on map) */}
        {layers
          .filter((l): l is SitesLayer => l.kind === "radar-sites")
          .map((layer) => (
            <LayerCard
              key={layer.id}
              label="Radar Sites"
              enabled={layer.enabled}
              onToggle={() => {
                const visible = !layer.enabled;
                sendCommand({ type: "SetLayerVisible", layer_id: layer.id, visible });
                updateLayer(layer.id, { enabled: visible });
              }}
              onRemove={() => {
                removeLayer(layer.id);
                sendCommand({ type: "SetLayerVisible", layer_id: layer.id, visible: false });
              }}
            />
          ))}
        {!layers.some((l) => l.kind === "radar-sites") && (
          <AddLayerBtn
            onClick={() => {
              addLayer("radar-sites");
              sendCommand({ type: "SetLayerVisible", layer_id: "radar-sites", visible: true });
            }}
          >
            + Radar Sites
          </AddLayerBtn>
        )}

        {radarLayers.map((layer) => {
          const layerUiState = uiState.radar_layers.find((s) => s.layer_id === layer.id) ?? null;
          return (
            <RadarLayerCard
              key={layer.id}
              layer={layer}
              layerUiState={layerUiState}
              canRemove={radarLayers.length > 1}
              onToggle={() => updateLayer(layer.id, { enabled: !layer.enabled })}
              onRemove={() => {
                removeLayer(layer.id);
                sendCommand({ type: "RemoveLayer", layer_id: layer.id });
              }}
              onSiteSelect={(siteId) => {
                updateLayer(layer.id, { siteId });
                onSelectSite(layer.id, siteId);
              }}
              onProductChange={(product: Product) => updateLayer(layer.id, { product })}
            />
          );
        })}

        {alertsLayers.map((layer) => {
          return (
            <AlertsLayerCard
              key={layer.id}
              layer={layer}
              alertCount={alertCount}
              lastUpdated={lastUpdated}
              canRemove={alertsLayers.length > 1}
              onToggle={() => updateLayer(layer.id, { enabled: !layer.enabled })}
              onRemove={() => {
                removeLayer(layer.id);
                sendCommand({ type: "ClearAlerts", layer_id: layer.id });
              }}
              onUpdateLayer={(updates) => updateLayer(layer.id, updates)}
            />
          );
        })}

        <AddLayerBtn onClick={() => addLayer("radar")}>+ Radar</AddLayerBtn>
      </Section>

      {/* Alert detail panel — dismissable */}
      {activeAlert && (
        <AlertDetailSection>
          <AlertDetailHeader>
            <AlertDetailTitle>{activeAlert.ps}</AlertDetailTitle>
            <DismissBtn onClick={onDismissAlert} title="Dismiss">×</DismissBtn>
          </AlertDetailHeader>
          <AlertDetailMeta>
            {activeAlert.wfo} · Expires {formatAlertTime(activeAlert.expires)}
          </AlertDetailMeta>
          <AlertDetailScroll>
            {activeAlert.raw ?? `${activeAlert.ps} — ${activeAlert.id}. Issued ${activeAlert.issued}.`}
          </AlertDetailScroll>
        </AlertDetailSection>
      )}

      {/* Animation */}
      {animationState.ready && (
        <Section>
          <SectionLabel>Animation</SectionLabel>
          <SliderHeader>
            <SubLabel>Speed</SubLabel>
            <SliderValue>{animationState.speed}×</SliderValue>
          </SliderHeader>
          <Slider
            type="range"
            min={0.5}
            max={4}
            step={0.5}
            value={animationState.speed}
            onChange={(e) => onSetSpeed(Number(e.target.value))}
          />
          <LoopRow>
            <LoopLabel>Loop</LoopLabel>
            <LoopToggle
              active={animationState.loop}
              onClick={onToggleLoop}
              title={animationState.loop ? "Loop enabled" : "Loop disabled"}
            >
              {animationState.loop ? "ON" : "OFF"}
            </LoopToggle>
          </LoopRow>
          <FrameCountLabel>
            {animationState.loadedFrames.size} / {animationState.frameCount} frames loaded
          </FrameCountLabel>
        </Section>
      )}
    </Panel>
  );
}

// ── Styled components ─────────────────────────────────────────────────────────

const PANEL_W = "220px";
const COLLAPSED_W = "36px";

const Panel = styled.div`
  width: ${PANEL_W};
  height: 100%;
  background: ${theme.bg};
  backdrop-filter: ${theme.blur};
  border-right: 1px solid ${theme.border};
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  pointer-events: all;
  flex-shrink: 0;
`;

const Collapsed = styled.div`
  width: ${COLLAPSED_W};
  height: 100%;
  background: ${theme.bg};
  backdrop-filter: ${theme.blur};
  border-right: 1px solid ${theme.border};
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 4px;
  gap: 8px;
  pointer-events: all;
  flex-shrink: 0;
`;

const CollapseRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px 0;
`;

const CollapseBtn = styled.button`
  background: none;
  border: none;
  color: ${theme.textSecondary};
  cursor: pointer;
  padding: 2px 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  &:hover { color: ${theme.textPrimary}; }
`;

const IconStub = styled.button`
  background: none;
  border: none;
  color: ${theme.textDim};
  cursor: pointer;
  opacity: 0.5;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  &:hover { opacity: 0.9; }
`;

const Section = styled.div`
  padding: 10px;
  border-bottom: 1px solid ${theme.border};
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const SectionLabel = styled.span`
  font-family: ${theme.fontSans};
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${theme.textDim};
`;

const SubLabel = styled.span`
  font-family: ${theme.fontSans};
  font-size: 10px;
  color: ${theme.textSecondary};
`;

const AddLayerBtn = styled.button`
  background: none;
  border: 1px dashed ${theme.border};
  border-radius: ${theme.radius};
  color: ${theme.textDim};
  font-family: ${theme.fontSans};
  font-size: 11px;
  padding: 4px 8px;
  cursor: pointer;
  text-align: left;
  &:hover {
    border-color: ${theme.accent};
    color: ${theme.accent};
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

const LoopRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const LoopLabel = styled.span`
  font-family: ${theme.fontSans};
  font-size: 11px;
  color: ${theme.textSecondary};
`;

const LoopToggle = styled.button<{ active?: boolean }>`
  background: ${({ active }) => (active ? theme.bgActive : "rgba(255,255,255,0.04)")};
  border: 1px solid ${({ active }) => (active ? theme.accent : theme.border)};
  border-radius: ${theme.radius};
  color: ${({ active }) => (active ? theme.accent : theme.textDim)};
  font-family: ${theme.fontMono};
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  cursor: pointer;
`;

const FrameCountLabel = styled.span`
  font-family: ${theme.fontMono};
  font-size: 10px;
  color: ${theme.textDim};
`;

// ── Alert detail panel ───────────────────────────────────────────────────────

function formatAlertTime(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

const AlertDetailSection = styled.div`
  padding: 10px;
  border-top: 1px solid ${theme.border};
  background: rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  flex-shrink: 0;
`;

const AlertDetailHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const AlertDetailTitle = styled.span`
  font-family: ${theme.fontSans};
  font-size: 12px;
  font-weight: 600;
  color: ${theme.textPrimary};
`;

const DismissBtn = styled.button`
  background: none;
  border: none;
  color: ${theme.textDim};
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
  &:hover { color: ${theme.textSecondary}; }
`;

const AlertDetailMeta = styled.span`
  font-family: ${theme.fontMono};
  font-size: 10px;
  color: ${theme.textDim};
`;

const AlertDetailScroll = styled.div`
  font-family: ${theme.fontSans};
  font-size: 11px;
  color: ${theme.textSecondary};
  white-space: pre-wrap;
  word-break: break-word;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
`;
