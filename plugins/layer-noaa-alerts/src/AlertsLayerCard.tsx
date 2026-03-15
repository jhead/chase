import { useState, useRef, useEffect } from "react";
import styled from "@emotion/styled";
import { theme } from "../../../src/components/NexradPage/theme";
import { LayerCard } from "../../../src/components/NexradPage/LayerCard";
import { useAlertsMeta } from "./alertsStore";
import type { SidebarCardProps } from "../../../src/plugins/registry";
import type { AlertsLayer } from "./types";

const PHENOMENA: { code: string; label: string }[] = [
  { code: "AF", label: "Airborne Fire" },
  { code: "AS", label: "Ash" },
  { code: "BW", label: "Breeze" },
  { code: "BZ", label: "Blizzard" },
  { code: "CF", label: "Coastal Flood" },
  { code: "DS", label: "Dust Storm" },
  { code: "EC", label: "Extreme Cold" },
  { code: "EH", label: "Excessive Heat" },
  { code: "EW", label: "Extreme Wind" },
  { code: "FA", label: "Flood" },
  { code: "FF", label: "Flash Flood" },
  { code: "FL", label: "Flood" },
  { code: "FR", label: "Frost" },
  { code: "FW", label: "Fire Weather" },
  { code: "FZ", label: "Freeze" },
  { code: "GL", label: "Gale" },
  { code: "HF", label: "Hurricane Force Wind" },
  { code: "HU", label: "Hurricane" },
  { code: "HW", label: "High Wind" },
  { code: "HZ", label: "Heat" },
  { code: "IS", label: "Ice Storm" },
  { code: "LE", label: "Lake Effect" },
  { code: "LO", label: "Low Water" },
  { code: "LW", label: "Lake Wind" },
  { code: "MA", label: "Marine" },
  { code: "MF", label: "Marine Dense Fog" },
  { code: "MS", label: "Dense Fog" },
  { code: "RB", label: "Small Craft" },
  { code: "RP", label: "Rip Current" },
  { code: "SC", label: "Small Craft" },
  { code: "SE", label: "Hazardous Seas" },
  { code: "SM", label: "Dense Fog" },
  { code: "SQ", label: "Snow Squall" },
  { code: "SS", label: "Storm Surge" },
  { code: "SV", label: "Severe Tstorm" },
  { code: "TO", label: "Tornado" },
  { code: "TR", label: "Tropical Storm" },
  { code: "TS", label: "Thunderstorm" },
  { code: "TY", label: "Typhoon" },
  { code: "VO", label: "Volcanic" },
  { code: "WA", label: "Air Quality" },
  { code: "WC", label: "Wind Chill" },
  { code: "WF", label: "Wildfire" },
  { code: "WI", label: "Wind" },
  { code: "WS", label: "Winter Storm" },
  { code: "WW", label: "Winter Weather" },
];

const SIGNIFICANCE: { code: string; label: string }[] = [
  { code: "W", label: "Warning" },
  { code: "A", label: "Watch" },
  { code: "Y", label: "Advisory" },
  { code: "S", label: "Statement" },
];

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void) {
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [ref, onOutside]);
}

export function AlertsLayerCard({
  layer,
  canRemove,
  onToggle,
  onRemove,
  onUpdateLayer,
}: SidebarCardProps<AlertsLayer>) {
  const { alertCount, lastUpdated } = useAlertsMeta(layer.id);
  const [phenomOpen, setPhenomOpen] = useState(false);
  const [sigOpen, setSigOpen] = useState(false);
  const phenomRef = useRef<HTMLDivElement>(null);
  const sigRef = useRef<HTMLDivElement>(null);

  useClickOutside(phenomRef, () => setPhenomOpen(false));
  useClickOutside(sigRef, () => setSigOpen(false));

  const showAllPhenomena = layer.phenomena.length === 0;
  const showAllSignificance = layer.significance.length === 0;

  function setPhenomena(next: string[]) {
    onUpdateLayer({ phenomena: next } as Partial<AlertsLayer>);
  }

  function setSignificance(next: string[]) {
    onUpdateLayer({ significance: next } as Partial<AlertsLayer>);
  }

  function togglePhenomenon(code: string) {
    if (showAllPhenomena) {
      setPhenomena([code]);
      return;
    }
    const next = layer.phenomena.includes(code)
      ? layer.phenomena.filter((p) => p !== code)
      : [...layer.phenomena, code];
    setPhenomena(next);
  }

  function toggleSignificance(code: string) {
    if (showAllSignificance) {
      setSignificance([code]);
      return;
    }
    const next = layer.significance.includes(code)
      ? layer.significance.filter((s) => s !== code)
      : [...layer.significance, code];
    setSignificance(next);
  }

  function setPhenomenaAll(all: boolean) {
    setPhenomena(all ? [] : layer.phenomena.length ? layer.phenomena : [PHENOMENA[0].code]);
  }

  function setSignificanceAll(all: boolean) {
    setSignificance(all ? [] : layer.significance.length ? layer.significance : [SIGNIFICANCE[0].code]);
  }

  const lastUpdatedStr = lastUpdated
    ? lastUpdated.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "\u2014";

  return (
    <LayerCard
      label="NWS Alerts"
      enabled={layer.enabled}
      onToggle={onToggle}
      onRemove={canRemove ? onRemove : undefined}
    >
      <FilterRow>
        <SubLabel>Phenomena</SubLabel>
        <CountBadge>{alertCount} active</CountBadge>
      </FilterRow>
      <DropdownWrap ref={phenomRef}>
        <DropdownTrigger
          type="button"
          onClick={() => setPhenomOpen((o) => !o)}
          title={showAllPhenomena ? "All" : `${layer.phenomena.length} selected`}
        >
          {showAllPhenomena ? "All" : `${layer.phenomena.length} selected`}
          <span aria-hidden>&#9660;</span>
        </DropdownTrigger>
        {phenomOpen && (
          <DropdownPanel>
            <OptionLabel>
              <input
                type="checkbox"
                checked={showAllPhenomena}
                onChange={(e) => setPhenomenaAll(e.target.checked)}
              />
              <span>All</span>
            </OptionLabel>
            <DropdownDivider />
            <DropdownScroll>
              {PHENOMENA.map(({ code, label: l }) => (
                <OptionLabel key={code}>
                  <input
                    type="checkbox"
                    checked={!showAllPhenomena && layer.phenomena.includes(code)}
                    onChange={() => togglePhenomenon(code)}
                  />
                  <span title={l}>{l}</span>
                </OptionLabel>
              ))}
            </DropdownScroll>
          </DropdownPanel>
        )}
      </DropdownWrap>

      <SubLabel>Significance</SubLabel>
      <DropdownWrap ref={sigRef}>
        <DropdownTrigger
          type="button"
          onClick={() => setSigOpen((o) => !o)}
          title={showAllSignificance ? "All" : `${layer.significance.length} selected`}
        >
          {showAllSignificance ? "All" : `${layer.significance.length} selected`}
          <span aria-hidden>&#9660;</span>
        </DropdownTrigger>
        {sigOpen && (
          <DropdownPanel>
            <OptionLabel>
              <input
                type="checkbox"
                checked={showAllSignificance}
                onChange={(e) => setSignificanceAll(e.target.checked)}
              />
              <span>All</span>
            </OptionLabel>
            <DropdownDivider />
            {SIGNIFICANCE.map(({ code, label: l }) => (
              <OptionLabel key={code}>
                <input
                  type="checkbox"
                  checked={!showAllSignificance && layer.significance.includes(code)}
                  onChange={() => toggleSignificance(code)}
                />
                <span>{l}</span>
              </OptionLabel>
            ))}
          </DropdownPanel>
        )}
      </DropdownWrap>

      <MetaRow>
        <SubLabel>Updated</SubLabel>
        <MetaValue>{lastUpdatedStr}</MetaValue>
      </MetaRow>
    </LayerCard>
  );
}

// ── Styled ───────────────────────────────────────────────────────────────────

const SubLabel = styled.span`
  font-family: ${theme.fontSans};
  font-size: 10px;
  color: ${theme.textSecondary};
`;

const FilterRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const CountBadge = styled.span`
  font-family: ${theme.fontMono};
  font-size: 10px;
  color: ${theme.accent};
`;

const DropdownWrap = styled.div`
  position: relative;
  margin-bottom: 6px;
`;

const DropdownTrigger = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 4px 8px;
  font-family: ${theme.fontSans};
  font-size: 11px;
  color: ${theme.textPrimary};
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid ${theme.border};
  border-radius: ${theme.radius};
  cursor: pointer;
  &:hover {
    border-color: ${theme.accent};
    color: ${theme.accent};
  }
  span:last-of-type {
    font-size: 8px;
    opacity: 0.8;
    margin-left: 4px;
  }
`;

const DropdownPanel = styled.div`
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

const DropdownScroll = styled.div`
  max-height: 180px;
  overflow-y: auto;
`;

const DropdownDivider = styled.div`
  height: 1px;
  background: ${theme.border};
  margin: 4px 0;
`;

const OptionLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  font-family: ${theme.fontSans};
  font-size: 11px;
  color: ${theme.textPrimary};
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  &:hover {
    background: ${theme.bgHover};
  }
  input {
    flex-shrink: 0;
  }
  span {
    flex: 1;
    min-width: 0;
  }
`;

const MetaRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const MetaValue = styled.span`
  font-family: ${theme.fontMono};
  font-size: 10px;
  color: ${theme.textDim};
`;
