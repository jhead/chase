import colormap from "../../../nexrad-3d/nws_colormap.json";

export const theme = {
  bg: "rgba(10, 12, 18, 0.90)",
  bgSolid: "#0a0c12",
  bgHover: "rgba(255, 255, 255, 0.06)",
  bgActive: "rgba(26, 127, 232, 0.20)",
  border: "rgba(255, 255, 255, 0.08)",
  accent: "#1a7fe8",
  accentHover: "#2490f5",
  textPrimary: "#e8ecf0",
  textSecondary: "#8a9ab0",
  textDim: "#4a5568",
  blur: "blur(8px)",
  radius: "3px",
  fontMono: "'JetBrains Mono', 'SF Mono', 'Fira Mono', monospace",
  fontSans: "Inter, system-ui, sans-serif",
} as const;

type RawColorPoint = { dbz: number; r: number; g: number; b: number; a: number };

/** NWS reflectivity colormap breakpoints, loaded from the shared JSON LUT. */
export const NWS_COLORS = (colormap as RawColorPoint[]).map(
  (entry) => {
    const { dbz, r, g, b, a } = entry;
    const color =
      a < 1
        ? `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`
        : `#${r.toString(16).padStart(2, "0")}${g
            .toString(16)
            .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    return { dbz, color };
  }
);
