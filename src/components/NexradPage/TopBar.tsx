import styled from "@emotion/styled";
import { useWasm } from "../../ctx/WasmContext";
import { theme } from "./theme";

interface TopBarProps {
  onSiteClick: () => void;
}

export function TopBar({ onSiteClick }: TopBarProps) {
  const { uiState } = useWasm();
  const { radar_loaded, iso_loaded, active_site } = uiState;

  const loadingText = !radar_loaded
    ? "Loading..."
    : !iso_loaded
    ? "Building iso..."
    : "Ready";

  const loadingColor = !radar_loaded
    ? theme.textDim
    : !iso_loaded
    ? theme.accent
    : "#4caf7d";

  return (
    <Bar>
      <Left>
        <SiteButton onClick={onSiteClick} title="Select radar site">
          {active_site ?? "Select Site"}
        </SiteButton>
      </Left>

      {/* Animation controls — stubbed */}
      <Center>
        <AnimBtn title="First frame" disabled>{"⏮"}</AnimBtn>
        <AnimBtn title="Previous frame" disabled>{"⏪"}</AnimBtn>
        <AnimBtn title="Play / Pause" disabled>{"▶"}</AnimBtn>
        <AnimBtn title="Next frame" disabled>{"⏩"}</AnimBtn>
        <AnimBtn title="Last frame" disabled>{"⏭"}</AnimBtn>
        <SpeedLabel>1×</SpeedLabel>
        <FrameLabel>—</FrameLabel>
      </Center>

      <Right>
        <StatusDot style={{ color: loadingColor }}>●</StatusDot>
        <StatusText>{loadingText}</StatusText>
      </Right>
    </Bar>
  );
}

const Bar = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 36px;
  background: ${theme.bg};
  backdrop-filter: ${theme.blur};
  border-bottom: 1px solid ${theme.border};
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  pointer-events: all;
  z-index: 2;
`;

const Left = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 120px;
`;

const Center = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
`;

const Right = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 120px;
  justify-content: flex-end;
`;

const SiteButton = styled.button`
  background: none;
  border: 1px solid ${theme.border};
  border-radius: ${theme.radius};
  color: ${theme.textPrimary};
  font-family: ${theme.fontMono};
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.05em;
  padding: 2px 8px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;

  &:hover {
    border-color: ${theme.accent};
    background: ${theme.bgActive};
  }
`;

const AnimBtn = styled.button`
  background: none;
  border: none;
  color: ${theme.textDim};
  font-size: 11px;
  padding: 4px 5px;
  cursor: default;
  opacity: 0.5;
`;

const SpeedLabel = styled.span`
  font-family: ${theme.fontMono};
  font-size: 11px;
  color: ${theme.textDim};
  padding: 0 6px;
`;

const FrameLabel = styled.span`
  font-family: ${theme.fontMono};
  font-size: 11px;
  color: ${theme.textDim};
`;

const StatusDot = styled.span`
  font-size: 8px;
`;

const StatusText = styled.span`
  font-family: ${theme.fontMono};
  font-size: 11px;
  color: ${theme.textSecondary};
`;
