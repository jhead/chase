import styled from "@emotion/styled";
import { useWasm } from "../../ctx/WasmContext";
import { theme } from "./theme";

type RenderMode = "sweeps" | "isosurface" | "combined";
type PaneLayout = "single" | "split-h" | "split-v" | "quad";

const RENDER_MODES: { mode: RenderMode; label: string; title: string }[] = [
  { mode: "sweeps",     label: "S", title: "Sweeps" },
  { mode: "isosurface", label: "I", title: "IsoSurface" },
  { mode: "combined",   label: "C", title: "Combined" },
];

const PANE_LAYOUTS: { layout: PaneLayout; label: string; title: string; stub: boolean }[] = [
  { layout: "single",  label: "□", title: "Single pane",     stub: false },
  { layout: "split-h", label: "▣", title: "Split horizontal", stub: true },
  { layout: "quad",    label: "⊞", title: "4-pane quad",     stub: true },
];

export function CanvasButtons() {
  const { sendCommand, uiState } = useWasm();
  const currentMode = uiState.render_mode;

  function setMode(mode: RenderMode) {
    sendCommand({ type: "SetRenderMode", mode });
  }

  return (
    <Group>
      <ButtonGroup>
        {RENDER_MODES.map(({ mode, label, title }) => (
          <IconButton
            key={mode}
            title={title}
            active={currentMode === mode}
            onClick={() => setMode(mode)}
          >
            {label}
          </IconButton>
        ))}
      </ButtonGroup>
      <ButtonGroup>
        {PANE_LAYOUTS.map(({ layout, label, title, stub }) => (
          <IconButton
            key={layout}
            title={stub ? `${title} (coming soon)` : title}
            active={layout === "single"}
            disabled={stub}
            onClick={stub ? undefined : undefined}
            style={{ opacity: stub ? 0.35 : 1 }}
          >
            {label}
          </IconButton>
        ))}
      </ButtonGroup>
    </Group>
  );
}

const Group = styled.div`
  position: absolute;
  top: 8px;
  left: 8px;
  display: flex;
  gap: 4px;
  pointer-events: all;
`;

const ButtonGroup = styled.div`
  display: flex;
  background: ${theme.bg};
  backdrop-filter: ${theme.blur};
  border: 1px solid ${theme.border};
  border-radius: ${theme.radius};
  overflow: hidden;
`;

const IconButton = styled.button<{ active?: boolean; disabled?: boolean }>`
  width: 28px;
  height: 28px;
  border: none;
  background: ${({ active }) => active ? theme.bgActive : "transparent"};
  color: ${({ active }) => active ? theme.accent : theme.textSecondary};
  font-family: ${theme.fontSans};
  font-size: 13px;
  cursor: ${({ disabled }) => disabled ? "default" : "pointer"};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background 0.1s, color 0.1s;

  &:hover {
    background: ${({ active, disabled }) =>
      disabled ? "transparent" : active ? theme.bgActive : theme.bgHover};
    color: ${({ disabled }) => disabled ? theme.textDim : theme.textPrimary};
  }

  & + & {
    border-left: 1px solid ${theme.border};
  }
`;
