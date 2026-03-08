import { useState } from "react";
import styled from "@emotion/styled";
import { RADAR_SITES } from "../../data/radarSites";
import { useWasm } from "../../ctx/WasmContext";
import { theme } from "./theme";

const PRODUCTS = [
  { id: "REF", label: "Reflectivity", available: true },
  { id: "VEL", label: "Velocity",     available: false },
  { id: "CC",  label: "Corr. Coeff.", available: false },
  { id: "ZDR", label: "Diff. Refl.",  available: false },
];

export function Sidebar() {
  const [expanded, setExpanded] = useState(true);
  const [search, setSearch] = useState("");
  const [activeProduct, setActiveProduct] = useState("REF");
  const { loadVolume, uiState } = useWasm();

  const filtered = search.length >= 1
    ? RADAR_SITES.filter(
        (s) =>
          s.id.toLowerCase().includes(search.toLowerCase()) ||
          s.name.toLowerCase().includes(search.toLowerCase())
      ).slice(0, 12)
    : [];

  function selectSite(siteId: string) {
    setSearch("");
    loadVolume(siteId);
  }

  if (!expanded) {
    return (
      <Collapsed>
        <CollapseBtn title="Expand sidebar" onClick={() => setExpanded(true)}>
          ›
        </CollapseBtn>
        <IconStub title="Site">📡</IconStub>
        <IconStub title="Product">🌀</IconStub>
        <IconStub title="Layers">🗂</IconStub>
      </Collapsed>
    );
  }

  return (
    <Panel>
      <CollapseRow>
        <SectionLabel>Controls</SectionLabel>
        <CollapseBtn title="Collapse sidebar" onClick={() => setExpanded(false)}>
          ‹
        </CollapseBtn>
      </CollapseRow>

      {/* Site */}
      <Section>
        <SectionLabel>Site</SectionLabel>
        <ActiveSite>{uiState.active_site ?? "None selected"}</ActiveSite>
        <SearchInput
          placeholder="Search ID or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {filtered.length > 0 && (
          <SiteList>
            {filtered.map((site) => (
              <SiteItem key={site.id} onClick={() => selectSite(site.id)}>
                <SiteId>{site.id}</SiteId>
                <SiteName>{site.name}</SiteName>
              </SiteItem>
            ))}
          </SiteList>
        )}
      </Section>

      {/* Product */}
      <Section>
        <SectionLabel>Product</SectionLabel>
        <ProductGrid>
          {PRODUCTS.map(({ id, label, available }) => (
            <ProductBtn
              key={id}
              active={activeProduct === id}
              disabled={!available}
              title={available ? label : `${label} — coming soon`}
              onClick={() => available && setActiveProduct(id)}
            >
              {id}
            </ProductBtn>
          ))}
        </ProductGrid>
      </Section>

      {/* Layers — mirrors CanvasButtons for users who prefer sidebar */}
      <Section>
        <SectionLabel>Layers</SectionLabel>
        <LayerRow
          active={uiState.render_mode === "sweeps" || uiState.render_mode === "combined"}
        >
          Elevation Sweeps
        </LayerRow>
        <LayerRow
          active={uiState.render_mode === "isosurface" || uiState.render_mode === "combined"}
        >
          IsoSurface
        </LayerRow>
      </Section>
    </Panel>
  );
}

const PANEL_W = "220px";
const COLLAPSED_W = "36px";

const Panel = styled.div`
  width: ${PANEL_W};
  height: 100%;
  background: ${theme.bg};
  backdrop-filter: ${theme.blur};
  border-right: 1px solid ${theme.border};
  display: flex;
  flex-direction: column;
  overflow-y: auto;
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
  padding-top: 4px;
  gap: 8px;
  pointer-events: all;
  flex-shrink: 0;
`;

const CollapseRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px 0;
`;

const CollapseBtn = styled.button`
  background: none;
  border: none;
  color: ${theme.textSecondary};
  font-size: 16px;
  cursor: pointer;
  padding: 2px 4px;
  line-height: 1;
  &:hover { color: ${theme.textPrimary}; }
`;

const IconStub = styled.button`
  background: none;
  border: none;
  font-size: 14px;
  cursor: pointer;
  opacity: 0.5;
  padding: 2px;
  &:hover { opacity: 0.9; }
`;

const Section = styled.div`
  padding: 10px;
  border-bottom: 1px solid ${theme.border};
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const SectionLabel = styled.span`
  font-family: ${theme.fontSans};
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${theme.textDim};
`;

const ActiveSite = styled.div`
  font-family: ${theme.fontMono};
  font-size: 13px;
  font-weight: 600;
  color: ${theme.textPrimary};
  letter-spacing: 0.05em;
`;

const SearchInput = styled.input`
  background: rgba(255,255,255,0.05);
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
  max-height: 180px;
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

const LayerRow = styled.div<{ active?: boolean }>`
  font-family: ${theme.fontSans};
  font-size: 12px;
  color: ${({ active }) => active ? theme.textPrimary : theme.textDim};
  padding: 2px 0;
  &::before {
    content: "${({ active }) => active ? "●" : "○"}";
    margin-right: 6px;
    color: ${({ active }) => active ? theme.accent : theme.textDim};
    font-size: 8px;
  }
`;
