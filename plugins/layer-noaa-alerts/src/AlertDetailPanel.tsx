import styled from "@emotion/styled";
import { theme } from "../../../src/components/NexradPage/theme";
import { useActiveAlert, setActiveAlertId } from "./alertsStore";
import type { DetailPanelProps } from "../../../src/plugins/registry";

function formatAlertTime(iso: string): string {
  if (!iso) return "\u2014";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function AlertDetailPanel({ onDismiss }: DetailPanelProps) {
  const activeAlert = useActiveAlert();

  if (!activeAlert) return null;

  function handleDismiss() {
    setActiveAlertId(null);
    onDismiss();
  }

  return (
    <AlertDetailSection>
      <AlertDetailHeader>
        <AlertDetailTitle>{activeAlert.ps}</AlertDetailTitle>
        <DismissBtn onClick={handleDismiss} title="Dismiss">&times;</DismissBtn>
      </AlertDetailHeader>
      <AlertDetailMeta>
        {activeAlert.wfo} &middot; Expires {formatAlertTime(activeAlert.expires)}
      </AlertDetailMeta>
      <AlertDetailScroll>
        {activeAlert.raw ?? `${activeAlert.ps} \u2014 ${activeAlert.id}. Issued ${activeAlert.issued}.`}
      </AlertDetailScroll>
    </AlertDetailSection>
  );
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
