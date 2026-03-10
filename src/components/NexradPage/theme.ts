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

/** NWS reflectivity colormap breakpoints matching the WGSL shader. */
export const NWS_COLORS = [
  { dbz: 0,    color: "rgba(93, 133, 155, 0.00)" },
  { dbz: 5,    color: "rgba(48, 52, 58, 0.33)" },
  { dbz: 10,   color: "rgba(48, 60, 86, 0.66)" },
  { dbz: 15,   color: "#4d6c84" },
  { dbz: 20,   color: "#5eab73" },
  { dbz: 25,   color: "#3a7b2e" },
  { dbz: 30,   color: "#a2be3b" },
  { dbz: 35,   color: "#e5df49" },
  { dbz: 39.9, color: "#c2b43a" }, // End of yellow ramp
  { dbz: 40,   color: "#ec9937" }, // Hard step to orange
  { dbz: 45,   color: "#c7792c" },
  { dbz: 49.9, color: "#a75e25" }, // End of orange ramp
  { dbz: 50,   color: "#e53e27" }, // Hard step to red (from find_jumps)
  { dbz: 55,   color: "#b03523" },
  { dbz: 60,   color: "#782f25" },
  { dbz: 64.9, color: "#782f25" },
  { dbz: 65,   color: "#b96392" }, // Hard step to pink
  { dbz: 70,   color: "#b23070" },
  { dbz: 74.9, color: "#b23070" },
  { dbz: 75,   color: "#6521b1" }, // Hard step to purple
  { dbz: 80,   color: "#391286" },
  { dbz: 84.9, color: "#391286" },
  { dbz: 85,   color: "#7bbbc7" }, // Hard step to cyan
  { dbz: 90,   color: "#50758c" },
  { dbz: 94.9, color: "#50758c" },
  { dbz: 95,   color: "#69170b" }, // Hard step to brown
] as const;
