import { useState } from "react";
import styled from "@emotion/styled";
import { useWasm } from "../../ctx/WasmContext";
import { theme } from "./theme";
import type { AnimationState } from "../../hooks/useMultiLayerAnimation";
import type { Layer, AlertsLayer, RadarLayer, Product } from "../../hooks/useLayers";
import { LayerCard } from "./LayerCard";
import { RadarLayerCard } from "./RadarLayerCard";

interface SidebarProps {
  animationState: AnimationState;
  onSetSpeed: (speed: number) => void;
  onToggleLoop: () => void;
  onSelectSite: (layerId: string, siteId: string) => void;
  layers: Layer[];
  addLayer: (kind: "radar") => void;
  removeLayer: (id: string) => void;
  updateLayer: <T extends Layer>(id: string, updates: Partial<T>) => void;
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
}: SidebarProps) {
  const [expanded, setExpanded] = useState(true);
  const { uiState, sendCommand } = useWasm();

  const radarLayers = layers.filter((l): l is RadarLayer => l.kind === "radar");

  if (!expanded) {
    return (
      <Collapsed>
        <CollapseBtn title="Expand sidebar" onClick={() => setExpanded(true)}>›</CollapseBtn>
        <IconStub title="Layers">🗂</IconStub>
      </Collapsed>
    );
  }

  return (
    <Panel>
      <CollapseRow>
        <SectionLabel>Controls</SectionLabel>
        <CollapseBtn title="Collapse sidebar" onClick={() => setExpanded(false)}>‹</CollapseBtn>
      </CollapseRow>

      {/* Layers */}
      <Section>
        <SectionLabel>Layers</SectionLabel>

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

        <AddLayerBtn onClick={() => addLayer("radar")}>+ Radar</AddLayerBtn>

        <LayerDivider />

        {/* NWS Alerts */}
        {layers
          .filter((l): l is AlertsLayer => l.kind === "nws-alerts")
          .map((layer) => (
            <LayerCard
              key={layer.id}
              label="NWS Alerts"
              enabled={false}
              onToggle={() => {}}
              disabled
            />
          ))}
      </Section>

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
  font-size: 16px;
  cursor: pointer;
  padding: 2px 4px;
  line-height: 1;
  &:hover { color: ${theme.textPrimary}; }
`;

const IconStub = styled.button`
  background: none;
  border: none;
  font-size: 14px;
  cursor: pointer;
  opacity: 0.5;
  padding: 2px;
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

const LayerDivider = styled.div`
  height: 1px;
  background: ${theme.border};
  margin: 2px 0;
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
