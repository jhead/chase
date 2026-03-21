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
    <Card disabled={disabled} active={enabled && !disabled}>
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
        >
          <MSIcon active={enabled && !disabled}>
            {enabled && !disabled ? "visibility" : "visibility_off"}
          </MSIcon>
        </ToggleBtn>
        <Label active={enabled && !disabled}>{label}</Label>
        {hasConfig && !disabled && (
          <ChevronBtn
            expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Collapse" : "Expand"}
          >
            <MSIcon>chevron_right</MSIcon>
          </ChevronBtn>
        )}
        {onRemove && !disabled && (
          <RemoveBtn onClick={onRemove} title="Remove layer">
            <MSIcon>close</MSIcon>
          </RemoveBtn>
        )}
      </Header>
      {hasConfig && enabled && !disabled && expanded && <Body>{children}</Body>}
    </Card>
  );
}

const Card = styled.div<{ disabled?: boolean; active?: boolean }>`
  display: flex;
  flex-direction: column;
  opacity: ${({ disabled }) => (disabled ? 0.4 : 1)};
  border: 1px solid ${({ active }) => (active ? `${theme.accent}20` : theme.border)};
  background: ${theme.surfaceLow};
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 6px;
`;

const ToggleBtn = styled.button<{ active?: boolean }>`
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ active }) => (active ? theme.accent : theme.textDim)};
  flex-shrink: 0;

  &:hover {
    color: ${({ active }) => (active ? theme.accentHover : theme.textSecondary)};
  }
`;

function MSIcon({ children, active, expanded }: { children: React.ReactNode; active?: boolean; expanded?: boolean }) {
  return (
    <MSIconSpan active={active} expanded={expanded} className="material-symbols-outlined">
      {children}
    </MSIconSpan>
  );
}

const MSIconSpan = styled.span<{ active?: boolean; expanded?: boolean }>`
  font-size: 16px;
  line-height: 1;
  ${({ expanded }) => expanded !== undefined && `
    transform: rotate(${expanded ? "90deg" : "0deg"});
    transition: transform 0.15s ease;
    display: inline-block;
  `}
`;

const Label = styled.span<{ active?: boolean }>`
  font-family: ${theme.fontHeadline};
  font-size: 11px;
  font-weight: 600;
  color: ${({ active }) => (active ? theme.textPrimary : theme.textDim)};
  flex: 1;
  letter-spacing: 0.02em;
`;

const ChevronBtn = styled.button<{ expanded?: boolean }>`
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${theme.textDim};
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
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${theme.textDim};
  flex-shrink: 0;

  &:hover {
    color: ${theme.error};
  }
`;

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 8px 6px 8px;
  border-top: 1px solid ${theme.border};
`;
