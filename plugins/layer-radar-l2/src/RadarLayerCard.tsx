import { useState } from "react";
import styled from "@emotion/styled";
import { RADAR_SITES } from "../../../src/data/radarSites";
import { useWasm } from "../../../src/ctx/WasmContext";
import type { UiRadarLayerState } from "../../../src/ctx/WasmContext";
import { theme } from "../../../src/components/NexradPage/theme";
import { LayerCard } from "../../../src/components/NexradPage/LayerCard";
import type { SidebarCardProps } from "../../../src/plugins/registry";
import type { RadarLayer, Product } from "./types";

const PRODUCTS: { id: Product; label: string; available: boolean }[] = [
  { id: "REF", label: "Reflectivity", available: true },
  { id: "VEL", label: "Velocity",     available: false },
  { id: "CC",  label: "Corr. Coeff.", available: false },
  { id: "ZDR", label: "Diff. Refl.",  available: false },
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

  const label = layer.siteId
    ? `Radar — ${layer.siteId}`
    : "Radar";

  return (
    <LayerCard
      label={label}
      enabled={layer.enabled}
      onToggle={handleToggle}
      onRemove={canRemove ? onRemove : undefined}
    >
      {/* Site */}
      <Row>
        <SubLabel>Site</SubLabel>
        {layer.siteId && <SiteTag>{layer.siteId}</SiteTag>}
      </Row>
      <SearchInput
        placeholder="Search ID or name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {filtered.length > 0 && (
        <SiteList>
          {filtered.map((site) => (
            <SiteItem key={site.id} onClick={() => handleSiteSelect(site.id)}>
              <SiteId>{site.id}</SiteId>
              <SiteName>{site.name}</SiteName>
            </SiteItem>
          ))}
        </SiteList>
      )}

      {/* Product */}
      <SubLabel>Product</SubLabel>
      <ProductGrid>
        {PRODUCTS.map(({ id, label: plabel, available }) => (
          <ProductBtn
            key={id}
            active={layer.product === id}
            disabled={!available}
            title={available ? plabel : `${plabel} — coming soon`}
            onClick={() => available && onUpdateLayer({ product: id } as Partial<RadarLayer>)}
          >
            {id}
          </ProductBtn>
        ))}
      </ProductGrid>

      {/* Product-specific controls */}
      {layer.product === "REF" && layerUiState && layerUiState.elevation_total > 0 && (
        <>
          <SliderHeader>
            <SubLabel>Tilts</SubLabel>
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

      {layer.product === "REF" && (
        <>
          <SliderHeader>
            <SubLabel>Min dBZ</SubLabel>
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
        </>
      )}
    </LayerCard>
  );
}

// ── Styled components ─────────────────────────────────────────────────────────

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const SubLabel = styled.span`
  font-family: ${theme.fontSans};
  font-size: 10px;
  color: ${theme.textSecondary};
`;

const SiteTag = styled.span`
  font-family: ${theme.fontMono};
  font-size: 11px;
  font-weight: 600;
  color: ${theme.accent};
`;

const SearchInput = styled.input`
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid ${theme.border};
  border-radius: ${theme.radius};
  color: ${theme.textPrimary};
  font-family: ${theme.fontSans};
  font-size: 12px;
  padding: 4px 8px;
  outline: none;
  &::placeholder { color: ${theme.textDim}; }
  &:focus { border-color: ${theme.accent}; }
`;

const SiteList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 160px;
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
  &:hover { background: ${theme.bgHover}; }
`;

const SiteId = styled.span`
  font-family: ${theme.fontMono};
  font-size: 12px;
  font-weight: 600;
  color: ${theme.accent};
  flex-shrink: 0;
`;

const SiteName = styled.span`
  font-family: ${theme.fontSans};
  font-size: 11px;
  color: ${theme.textSecondary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ProductGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
`;

const ProductBtn = styled.button<{ active?: boolean; disabled?: boolean }>`
  background: ${({ active }) => active ? theme.bgActive : "rgba(255,255,255,0.04)"};
  border: 1px solid ${({ active }) => active ? theme.accent : theme.border};
  border-radius: ${theme.radius};
  color: ${({ active, disabled }) =>
    disabled ? theme.textDim : active ? theme.accent : theme.textSecondary};
  font-family: ${theme.fontMono};
  font-size: 12px;
  font-weight: 600;
  padding: 5px;
  cursor: ${({ disabled }) => disabled ? "default" : "pointer"};
  opacity: ${({ disabled }) => disabled ? 0.4 : 1};
  &:hover:not(:disabled) { border-color: ${theme.accentHover}; }
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
