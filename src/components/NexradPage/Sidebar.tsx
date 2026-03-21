import { useState } from "react";
import styled from "@emotion/styled";
import { ChevronRight, ChevronLeft, Layers } from "lucide-react";
import { theme } from "./theme";
import type { AnimationState } from "../../hooks/useMultiLayerAnimation";
import type { LayerBase } from "../../plugins/registry";
import { getPlugin, getPlugins } from "../../plugins/registry";

interface SidebarProps {
  animationState: AnimationState;
  onSetSpeed: (speed: number) => void;
  onToggleLoop: () => void;
  layers: LayerBase[];
  addLayer: (kind: string) => string;
  removeLayer: (id: string) => void;
  updateLayer: (id: string, updates: Partial<LayerBase>) => void;
}

export function Sidebar({
  animationState,
  onSetSpeed,
  onToggleLoop,
  layers,
  addLayer,
  removeLayer,
  updateLayer,
}: SidebarProps) {
  const [expanded, setExpanded] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

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

  // Plugins available to add (non-singleton, or singleton not yet added)
  const addablePlugins = getPlugins().filter((p) => {
    if (p.singleton && layers.some((l) => l.kind === p.kind)) return false;
    return true;
  });

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

        {layers.map((layer) => {
          const plugin = getPlugin(layer.kind);
          if (!plugin) return null;

          const samekindCount = layers.filter((l) => l.kind === layer.kind).length;
          const Card = plugin.SidebarCard;

          return (
            <Card
              key={layer.id}
              layer={layer}
              canRemove={!plugin.singleton && samekindCount > 1}
              onToggle={() => updateLayer(layer.id, { enabled: !layer.enabled })}
              onRemove={() => removeLayer(layer.id)}
              onUpdateLayer={(updates) => updateLayer(layer.id, updates)}
            />
          );
        })}

        {/* Add layer menu */}
        <AddLayerWrap>
          <AddLayerBtn onClick={() => setMenuOpen((o) => !o)}>+ Add Layer</AddLayerBtn>
          {menuOpen && addablePlugins.length > 0 && (
            <AddLayerMenu>
              {addablePlugins.map((p) => (
                <AddLayerMenuItem
                  key={p.kind}
                  onClick={() => {
                    addLayer(p.kind);
                    setMenuOpen(false);
                  }}
                >
                  {p.displayName}
                </AddLayerMenuItem>
              ))}
            </AddLayerMenu>
          )}
        </AddLayerWrap>
      </Section>

      {/* Detail panels from plugins */}
      {getPlugins()
        .filter((p) => p.DetailPanel)
        .map((p) => {
          const Panel = p.DetailPanel!;
          return <Panel key={p.kind} onDismiss={() => {}} />;
        })}

      {/* Animation */}
      {animationState.ready && (
        <Section>
          <SectionLabel>Animation</SectionLabel>
          <SliderHeader>
            <SubLabel>Speed</SubLabel>
            <SliderValue>{animationState.speed}&times;</SliderValue>
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
            {animationState.loadedTimestampsMs.size} / {animationState.allTimestampsMs.length} frames loaded
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

const AddLayerWrap = styled.div`
  position: relative;
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
  width: 100%;
  &:hover {
    border-color: ${theme.accent};
    color: ${theme.accent};
  }
`;

const AddLayerMenu = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 2px;
  padding: 4px 0;
  background: ${theme.bgSolid};
  border: 1px solid ${theme.border};
  border-radius: ${theme.radius};
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 10;
`;

const AddLayerMenuItem = styled.button`
  display: block;
  width: 100%;
  background: none;
  border: none;
  padding: 6px 10px;
  text-align: left;
  font-family: ${theme.fontSans};
  font-size: 11px;
  color: ${theme.textPrimary};
  cursor: pointer;
  &:hover {
    background: ${theme.bgHover};
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
