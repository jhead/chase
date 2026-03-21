import colormap from "../../../radish/nws_colormap.json";

export const theme = {
  bg: "rgba(17, 19, 24, 0.60)",
  bgSolid: "#0c0e12",
  bgHover: "rgba(255, 255, 255, 0.06)",
  bgActive: "rgba(63, 255, 139, 0.12)",
  border: "rgba(70, 72, 77, 0.2)",
  accent: "#3fff8b",
  accentHover: "#13ea79",
  textPrimary: "#f6f6fc",
  textSecondary: "#aaabb0",
  textDim: "#46484d",
  blur: "blur(8px)",
  radius: "0px",
  fontHeadline: "'Space Grotesk', system-ui, sans-serif",
  fontMono: "'JetBrains Mono', 'SF Mono', monospace",
  fontSans: "Inter, system-ui, sans-serif",
  surface: "#111318",
  surfaceLow: "#171a1f",
  error: "#ff716c",
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
