import styled from "@emotion/styled";
import { useState } from "react";
import { useWasm } from "../../ctx/WasmContext";
import { theme } from "./theme";

type PaneLayout = "single" | "split-h" | "split-v" | "quad";
type CameraMode = "2d" | "3d";

const PANE_LAYOUTS: { layout: PaneLayout; label: string; title: string; stub: boolean }[] = [
  { layout: "single",  label: "□", title: "Single pane",     stub: false },
  { layout: "split-h", label: "▣", title: "Split horizontal", stub: true },
  { layout: "quad",    label: "⊞", title: "4-pane quad",     stub: true },
];

const CAMERA_MODES: { mode: CameraMode; label: string; title: string }[] = [
  { mode: "2d", label: "2D", title: "2D mode — left drag: pan, right drag: tilt" },
  { mode: "3d", label: "3D", title: "3D mode — left drag: tilt, right drag: pan" },
];

export function CanvasButtons() {
  const { sendCommand } = useWasm();
  const [cameraMode, setCameraMode] = useState<CameraMode>("2d");

  function setCamMode(mode: CameraMode) {
    setCameraMode(mode);
    sendCommand({ type: "SetCameraMode", mode });
  }

  return (
    <Group>
      <ButtonGroup>
        {CAMERA_MODES.map(({ mode, label, title }) => (
          <IconButton
            key={mode}
            title={title}
            active={cameraMode === mode}
            onClick={() => setCamMode(mode)}
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
