import { useState } from "react";
import styled from "@emotion/styled";
import { RADAR_SITES } from "../../../src/data/radarSites";
import { useWasm } from "../../../src/ctx/WasmContext";
import type { UiRadarLayerState } from "../../../src/ctx/WasmContext";
import { theme } from "../../../src/components/NexradPage/theme";
import type { SidebarCardProps } from "../../../src/plugins/registry";
import type { RadarLayer, Product } from "./types";
import { PRODUCT_MOMENT } from "./types";

const PRODUCTS: { id: Product; label: string }[] = [
  { id: "REF",   label: "Reflectivity" },
  { id: "VEL",   label: "Velocity"     },
  { id: "SW",    label: "Spec. Width"  },
  { id: "ZDR",   label: "Diff. Refl."  },
  { id: "CC",    label: "Corr. Coeff." },
  { id: "PHIDP", label: "Diff. Phase"  },
];

export function RadarLayerCard({
  layer,
  canRemove,
  onToggle,
  onRemove,
  onUpdateLayer,
}: SidebarCardProps<RadarLayer>) {
  const [search, setSearch] = useState("");
  const { uiState, sendCommand } = useWasm();

  const layerUiState: UiRadarLayerState | null =
    uiState.radar_layers.find((s) => s.layer_id === layer.id) ?? null;

  const filtered = search.length >= 1
    ? RADAR_SITES.filter(
        (s) =>
          s.id.toLowerCase().includes(search.toLowerCase()) ||
          s.name.toLowerCase().includes(search.toLowerCase())
      ).slice(0, 12)
    : [];

  function handleSiteSelect(siteId: string) {
    setSearch("");
    onUpdateLayer({ siteId } as Partial<RadarLayer>);
  }

  function handleToggle() {
    const visible = !layer.enabled;
    sendCommand({ type: "SetLayerVisible", layer_id: layer.id, visible });
    onToggle();
  }

  const siteName = layer.siteId
    ? RADAR_SITES.find((s) => s.id === layer.siteId)?.name?.toUpperCase() ?? null
    : null;

  const headingLeft = layer.siteId ?? "RADAR";
  const headingRight = siteName ?? "SELECT SITE";

  return (
    <Card active={layer.enabled}>
      {/* Header row */}
      <CardHeader>
        <HeaderLeft>
          <MSIcon style={{ color: theme.accent }}>radar</MSIcon>
          <SiteHeading>
            <SiteId>{headingLeft}</SiteId>
            {siteName && <SiteSep>:</SiteSep>}
            <SiteCity>{headingRight}</SiteCity>
          </SiteHeading>
        </HeaderLeft>
        <HeaderRight>
          <IconBtn title={layer.enabled ? "Disable layer" : "Enable layer"} onClick={handleToggle}>
            <MSIcon active={layer.enabled}>
              {layer.enabled ? "visibility" : "visibility_off"}
            </MSIcon>
          </IconBtn>
          {canRemove && onRemove && (
            <IconBtn title="Remove layer" remove onClick={onRemove}>
              <MSIcon>close</MSIcon>
            </IconBtn>
          )}
        </HeaderRight>
      </CardHeader>

      {/* Metadata grid */}
      {layerUiState && layer.siteId && (
        <MetaGrid>
          <MetaCell>
            <MetaLabel>PRODUCT</MetaLabel>
            <MetaValue>{layer.product ?? "REF"}</MetaValue>
          </MetaCell>
          <MetaCell>
            <MetaLabel>RANGE</MetaLabel>
            <MetaValue>{layerUiState.range_km} KM</MetaValue>
          </MetaCell>
        </MetaGrid>
      )}

      {/* Product buttons */}
      <ProductRow>
        {PRODUCTS.map(({ id, label: plabel }) => {
          const momentName = PRODUCT_MOMENT[id];
          const available = !layerUiState || layerUiState.available_moments.includes(momentName);
          return (
            <ProductBtn
              key={id}
              active={layer.product === id}
              disabled={!available}
              title={available ? plabel : `${plabel} — not in this scan`}
              onClick={() => {
                if (!available) return;
                onUpdateLayer({ product: id } as Partial<RadarLayer>);
                sendCommand({ type: "SetActiveMoment", layer_id: layer.id, moment: momentName });
              }}
            >
              {id}
            </ProductBtn>
          );
        })}
      </ProductRow>

      {/* Site search */}
      <SearchInput
        placeholder="Search site ID or name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {filtered.length > 0 && (
        <SiteList>
          {filtered.map((site) => (
            <SiteItem key={site.id} onClick={() => handleSiteSelect(site.id)}>
              <SiteItemId>{site.id}</SiteItemId>
              <SiteItemName>{site.name}</SiteItemName>
            </SiteItem>
          ))}
        </SiteList>
      )}

      {/* Collapsible controls when site active */}
      {layer.siteId && layerUiState && layer.product === "REF" && layerUiState.elevation_total > 0 && (
        <>
          <SliderHeader>
            <SubLabel>TILTS</SubLabel>
            <SliderValue>
              {layerUiState.elevation_count} / {layerUiState.elevation_total}
            </SliderValue>
          </SliderHeader>
          <Slider
            type="range"
            min={1}
            max={layerUiState.elevation_total}
            value={layerUiState.elevation_count}
            onChange={(e) =>
              sendCommand({ type: "SetElevationCount", layer_id: layer.id, count: Number(e.target.value) })
            }
          />
        </>
      )}

      {layer.siteId && layer.product === "REF" && (
        <>
          <SliderHeader>
            <SubLabel>MIN dBZ</SubLabel>
            <SliderValue>{Math.round(layerUiState?.threshold_dbz ?? 10)} dBZ</SliderValue>
          </SliderHeader>
          <Slider
            type="range"
            min={-10}
            max={75}
            step={1}
            value={layerUiState?.threshold_dbz ?? 10}
            onChange={(e) =>
              sendCommand({ type: "SetThreshold", layer_id: layer.id, dbz: Number(e.target.value) })
            }
          />
          <SliderHeader>
            <SubLabel>RANGE CAP</SubLabel>
            <SliderValue>{Math.round(layerUiState?.range_km ?? 460)} km</SliderValue>
          </SliderHeader>
          <Slider
            type="range"
            min={50}
            max={460}
            step={10}
            value={layerUiState?.range_km ?? 460}
            onChange={(e) =>
              sendCommand({ type: "SetRangeKm", layer_id: layer.id, range_km: Number(e.target.value) })
            }
          />
        </>
      )}
    </Card>
  );
}

// ── Styled components ─────────────────────────────────────────────────────────

const Card = styled.div<{ active?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid ${({ active }) => (active ? `${theme.accent}30` : theme.border)};
  background: ${theme.surfaceLow};
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
`;

const SiteHeading = styled.div`
  display: flex;
  align-items: baseline;
  gap: 3px;
  min-width: 0;
`;

const SiteId = styled.span`
  font-family: ${theme.fontHeadline};
  font-size: 12px;
  font-weight: 700;
  color: ${theme.accent};
  letter-spacing: 0.04em;
  flex-shrink: 0;
`;

const SiteSep = styled.span`
  color: ${theme.textDim};
  font-size: 11px;
`;

const SiteCity = styled.span`
  font-family: ${theme.fontHeadline};
  font-size: 10px;
  font-weight: 500;
  color: ${theme.textSecondary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
`;

const IconBtn = styled.button<{ remove?: boolean }>`
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${theme.textDim};

  &:hover {
    color: ${({ remove }) => (remove ? theme.error : theme.textSecondary)};
  }
`;

function MSIcon({ children, active, style }: { children: React.ReactNode; active?: boolean; style?: React.CSSProperties }) {
  const color = active === undefined ? "inherit" : active ? theme.accent : theme.textDim;
  return (
    <span className="material-symbols-outlined" style={{ fontSize: 16, lineHeight: 1, color, ...style }}>
      {children}
    </span>
  );
}

const MetaGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: ${theme.border};
  border: 1px solid ${theme.border};
`;

const MetaCell = styled.div`
  background: ${theme.surface};
  padding: 4px 6px;
  display: flex;
  flex-direction: column;
  gap: 1px;
`;

const MetaLabel = styled.span`
  font-family: ${theme.fontHeadline};
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: ${theme.textDim};
  text-transform: uppercase;
`;

const MetaValue = styled.span`
  font-family: ${theme.fontMono};
  font-size: 11px;
  color: ${theme.textPrimary};
  font-weight: 500;
`;

const ProductRow = styled.div`
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
`;

const ProductBtn = styled.button<{ active?: boolean; disabled?: boolean }>`
  background: ${({ active }) => (active ? theme.bgActive : "rgba(255,255,255,0.04)")};
  border: 1px solid ${({ active }) => (active ? theme.accent : theme.border)};
  border-radius: ${theme.radius};
  color: ${({ active, disabled }) =>
    disabled ? theme.textDim : active ? theme.accent : theme.textSecondary};
  font-family: ${theme.fontMono};
  font-size: 10px;
  font-weight: 600;
  padding: 3px 6px;
  cursor: ${({ disabled }) => (disabled ? "default" : "pointer")};
  opacity: ${({ disabled }) => (disabled ? 0.4 : 1)};
  letter-spacing: 0.04em;

  &:hover:not(:disabled) {
    border-color: ${theme.accentHover};
  }
`;

const SearchInput = styled.input`
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid ${theme.border};
  border-radius: ${theme.radius};
  color: ${theme.textPrimary};
  font-family: ${theme.fontSans};
  font-size: 11px;
  padding: 4px 8px;
  outline: none;

  &::placeholder {
    color: ${theme.textDim};
  }

  &:focus {
    border-color: ${theme.accent};
  }
`;

const SiteList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 140px;
  overflow-y: auto;
`;

const SiteItem = styled.button`
  background: none;
  border: none;
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 4px 6px;
  border-radius: ${theme.radius};
  cursor: pointer;
  text-align: left;

  &:hover {
    background: ${theme.bgHover};
  }
`;

const SiteItemId = styled.span`
  font-family: ${theme.fontMono};
  font-size: 11px;
  font-weight: 700;
  color: ${theme.accent};
  flex-shrink: 0;
`;

const SiteItemName = styled.span`
  font-family: ${theme.fontSans};
  font-size: 10px;
  color: ${theme.textSecondary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const SliderHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const SubLabel = styled.span`
  font-family: ${theme.fontHeadline};
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: ${theme.textDim};
  text-transform: uppercase;
`;

const SliderValue = styled.span`
  font-family: ${theme.fontMono};
  font-size: 10px;
  color: ${theme.accent};
`;

const Slider = styled.input`
  width: 100%;
  accent-color: ${theme.accent};
  cursor: pointer;
`;
