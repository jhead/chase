import { useState } from "react";
import styled from "@emotion/styled";
import { theme } from "./theme";
import type { AnimationState } from "../../hooks/useMultiLayerAnimation";
import type { LayerBase } from "../../plugins/registry";
import { getPlugin, getPlugins } from "../../plugins/registry";

interface SidebarProps {
  animationState: AnimationState;
  layers: LayerBase[];
  addLayer: (kind: string) => string;
  removeLayer: (id: string) => void;
  updateLayer: (id: string, updates: Partial<LayerBase>) => void;
}

export function Sidebar({
  animationState,
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
          <MSIcon>chevron_right</MSIcon>
        </CollapseBtn>
        <MSIcon style={{ color: theme.textDim, fontSize: 18 }}>layers</MSIcon>
      </Collapsed>
    );
  }

  const addablePlugins = getPlugins().filter((p) => {
    if (p.singleton && layers.some((l) => l.kind === p.kind)) return false;
    return true;
  });

  return (
    <Panel>
      {/* Header */}
      <Header>
        <HeaderLeft>
          <Branding>radish</Branding>
          <HeaderDivider />
          <HeaderLabel>LAYERS</HeaderLabel>
        </HeaderLeft>
        <CollapseBtn title="Collapse sidebar" onClick={() => setExpanded(false)}>
          <MSIcon>chevron_left</MSIcon>
        </CollapseBtn>
      </Header>

      {/* Layer list */}
      <LayerList>
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

        {/* Detail panels from plugins */}
        {getPlugins()
          .filter((p) => p.DetailPanel)
          .map((p) => {
            const DetailPanel = p.DetailPanel!;
            return <DetailPanel key={p.kind} onDismiss={() => {}} />;
          })}

        {/* Add layer button */}
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
      </LayerList>

      {/* Bottom: frame count */}
      {animationState.ready && (
        <BottomSection>
          <FrameCountLabel>
            {animationState.loadedTimestampsMs.size} / {animationState.allTimestampsMs.length} frames
          </FrameCountLabel>
        </BottomSection>
      )}
    </Panel>
  );
}

// ── Styled components ─────────────────────────────────────────────────────────

const PANEL_W = "256px";
const COLLAPSED_W = "36px";

const Panel = styled.div`
  width: ${PANEL_W};
  height: 100%;
  background: ${theme.bg};
  backdrop-filter: ${theme.blur};
  border-right: 1px solid ${theme.border};
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
  padding-top: 8px;
  gap: 8px;
  pointer-events: all;
  flex-shrink: 0;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid ${theme.border};
  flex-shrink: 0;
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Branding = styled.span`
  font-family: ${theme.fontHeadline};
  font-size: 14px;
  font-weight: 700;
  font-style: italic;
  color: ${theme.accent};
  letter-spacing: -0.01em;
`;

const HeaderDivider = styled.div`
  width: 1px;
  height: 12px;
  background: ${theme.border};
`;

const HeaderLabel = styled.span`
  font-family: ${theme.fontHeadline};
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: ${theme.textDim};
  text-transform: uppercase;
`;

const CollapseBtn = styled.button`
  background: none;
  border: none;
  color: ${theme.textDim};
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    color: ${theme.textSecondary};
  }
`;

function MSIcon({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span className="material-symbols-outlined" style={{ fontSize: 20, lineHeight: 1, ...style }}>
      {children}
    </span>
  );
}

const LayerList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const AddLayerWrap = styled.div`
  position: relative;
`;

const AddLayerBtn = styled.button`
  background: none;
  border: 1px dashed ${theme.border};
  border-radius: ${theme.radius};
  color: ${theme.textDim};
  font-family: ${theme.fontHeadline};
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.1em;
  padding: 6px 8px;
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
  background: ${theme.surfaceLow};
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

const BottomSection = styled.div`
  border-top: 1px solid ${theme.border};
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
`;

const FrameCountLabel = styled.span`
  font-family: ${theme.fontMono};
  font-size: 9px;
  color: ${theme.textDim};
`;
