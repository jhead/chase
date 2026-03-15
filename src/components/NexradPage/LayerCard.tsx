import { useState } from "react";
import styled from "@emotion/styled";
import { theme } from "./theme";

interface LayerCardProps {
  label: string;
  enabled: boolean;
  onToggle: () => void;
  /** Config controls rendered inside the collapsible body. */
  children?: React.ReactNode;
  defaultExpanded?: boolean;
  /** When true the toggle is inert and the whole card is dimmed. */
  disabled?: boolean;
  /** If provided, shows a × button that calls this when clicked. */
  onRemove?: () => void;
}

export function LayerCard({
  label,
  enabled,
  onToggle,
  children,
  defaultExpanded = true,
  disabled = false,
  onRemove,
}: LayerCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasConfig = !!children;

  return (
    <Card disabled={disabled}>
      <Header>
        <ToggleBtn
          active={enabled && !disabled}
          onClick={disabled ? undefined : onToggle}
          title={
            disabled
              ? `${label} — coming soon`
              : enabled
              ? "Disable layer"
              : "Enable layer"
          }
          style={{ cursor: disabled ? "default" : "pointer" }}
        />
        <Label active={enabled && !disabled}>{label}</Label>
        {hasConfig && !disabled && (
          <ChevronBtn
            expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Collapse" : "Expand"}
          >
            ›
          </ChevronBtn>
        )}
        {onRemove && !disabled && (
          <RemoveBtn onClick={onRemove} title="Remove layer">
            ×
          </RemoveBtn>
        )}
      </Header>
      {hasConfig && enabled && !disabled && expanded && <Body>{children}</Body>}
    </Card>
  );
}

const Card = styled.div<{ disabled?: boolean }>`
  display: flex;
  flex-direction: column;
  opacity: ${({ disabled }) => (disabled ? 0.4 : 1)};
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
`;

const ToggleBtn = styled.button<{ active?: boolean }>`
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  font-size: 8px;
  color: ${({ active }) => (active ? theme.accent : theme.textDim)};
  flex-shrink: 0;
  &::before {
    content: "${({ active }) => (active ? "●" : "○")}";
  }
  &:hover {
    color: ${({ active }) => (active ? theme.accentHover : theme.textSecondary)};
  }
`;

const Label = styled.span<{ active?: boolean }>`
  font-family: ${theme.fontSans};
  font-size: 12px;
  color: ${({ active }) => (active ? theme.textPrimary : theme.textDim)};
  flex: 1;
`;

const ChevronBtn = styled.button<{ expanded?: boolean }>`
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
  font-size: 12px;
  color: ${theme.textDim};
  transform: rotate(${({ expanded }) => (expanded ? "90deg" : "0deg")});
  transition: transform 0.15s ease;
  flex-shrink: 0;
  &:hover {
    color: ${theme.textSecondary};
  }
`;

const RemoveBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
  font-size: 14px;
  color: ${theme.textDim};
  flex-shrink: 0;
  &:hover {
    color: #e05555;
  }
`;

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 0 4px 14px;
  border-left: 1px solid ${theme.border};
  margin-left: 3px;
`;
