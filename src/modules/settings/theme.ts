export type ThemePaletteId =
  | "fire-orange"
  | "deep-ocean"
  | "dark-forest"
  | "passion-red"
  | "galaxy-purple"
  | "royal-gold"
  | "neon-pink"
  | "electric-cyan"
  | "toxic-lime"
  | "coral-sunset"
  | "night-indigo"
  | "emerald"
  | "ruby"
  | "warm-amber"
  | "electric-violet"
  | "fresh-mint"
  | "neon-orange"
  | "royal-blue"
  | "bold-fuchsia"
  | "lunar-white"
  | "classic-orange";

export type ThemeConfig = {
  paletteId: ThemePaletteId;
  accent: string;
  primary: string;
};

export type ThemePalette = {
  id: ThemePaletteId;
  label: string;
  accent: string;
  primary: string;
  /** Superficie oscura para cards/métricas sobre fondos claros */
  dark: string;
  textOnPrimary: string;
  textOnDark: string;
  swatches: [string, string, string, string, string];
};

export const DARK_SURFACE = "#0F1117";
export const DARK_TEXT = "#1A1A2E";
export const LIGHT_TEXT = "#FFFFFF";
/** Texto secundario sobre superficies claras (página, cards blancas) */
export const MUTED_ON_LIGHT = "rgba(26, 26, 46, 0.55)";

export function getLuminance(hex: string): number {
  const normalized = hex.replace("#", "").trim();
  if (normalized.length !== 6) return 0;
  const r = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const g = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const b = Number.parseInt(normalized.slice(4, 6), 16) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** Texto legible sobre cualquier fondo según luminancia WCAG. */
export function getContrastText(bgHex: string): "#FFFFFF" | "#1A1A2E" {
  return getLuminance(bgHex) > 0.35 ? DARK_TEXT : LIGHT_TEXT;
}

/** @deprecated Usar getContrastText */
export function getContrastColor(bgColor: string): "#FFFFFF" | "#1A1A2E" {
  return getContrastText(bgColor);
}

function buildPalette(
  id: ThemePaletteId,
  label: string,
  accent: string,
  primary: string,
  swatches: [string, string, string, string, string],
  dark = DARK_SURFACE
): ThemePalette {
  return {
    id,
    label,
    accent,
    primary,
    dark,
    swatches,
    textOnPrimary: getContrastText(primary),
    textOnDark: getContrastText(dark),
  };
}

export const DEFAULT_THEME: ThemeConfig = {
  paletteId: "fire-orange",
  accent: "#E8622A",
  primary: "#1A1A2E",
};

export const THEME_PALETTES: ThemePalette[] = [
  buildPalette("fire-orange", "Naranja fuego", "#E8622A", "#1A1A2E", ["#E8622A", "#D15524", "#1A1A2E", "#2D2D4A", "#0F1117"]),
  buildPalette("deep-ocean", "Océano profundo", "#0EA5E9", "#0C1929", ["#0EA5E9", "#0284C7", "#0C1929", "#1E3A5F", "#0F1117"]),
  buildPalette("dark-forest", "Bosque oscuro", "#16A34A", "#0A1F0A", ["#16A34A", "#15803D", "#0A1F0A", "#14532D", "#0F1117"]),
  buildPalette("passion-red", "Rojo pasión", "#DC2626", "#1A0A0A", ["#DC2626", "#B91C1C", "#1A0A0A", "#3F1515", "#0F1117"]),
  buildPalette("galaxy-purple", "Púrpura galaxia", "#7C3AED", "#0F0A1F", ["#7C3AED", "#6D28D9", "#0F0A1F", "#2E1065", "#0F1117"]),
  buildPalette("royal-gold", "Dorado real", "#D97706", "#1A1200", ["#D97706", "#B45309", "#1A1200", "#422006", "#0F1117"]),
  buildPalette("neon-pink", "Rosa neón", "#EC4899", "#1F0A15", ["#EC4899", "#DB2777", "#1F0A15", "#500724", "#0F1117"]),
  buildPalette("electric-cyan", "Cian eléctrico", "#06B6D4", "#001A1F", ["#06B6D4", "#0891B2", "#001A1F", "#164E63", "#0F1117"]),
  buildPalette("toxic-lime", "Lima tóxico", "#84CC16", "#0F1A00", ["#84CC16", "#65A30D", "#0F1A00", "#365314", "#0F1117"]),
  buildPalette("coral-sunset", "Coral sunset", "#F97316", "#1F0F00", ["#F97316", "#EA580C", "#1F0F00", "#431407", "#0F1117"]),
  buildPalette("night-indigo", "Índigo noche", "#4F46E5", "#0A0A1F", ["#4F46E5", "#4338CA", "#0A0A1F", "#1E1B4B", "#0F1117"]),
  buildPalette("emerald", "Esmeralda", "#10B981", "#001A12", ["#10B981", "#059669", "#001A12", "#064E3B", "#0F1117"]),
  buildPalette("ruby", "Rubí", "#E11D48", "#1A0010", ["#E11D48", "#BE123C", "#1A0010", "#4C0519", "#0F1117"]),
  buildPalette("warm-amber", "Ámbar cálido", "#F59E0B", "#1A1000", ["#F59E0B", "#D97706", "#1A1000", "#451A03", "#0F1117"]),
  buildPalette("electric-violet", "Violeta eléctrico", "#A855F7", "#100A1A", ["#A855F7", "#9333EA", "#100A1A", "#3B0764", "#0F1117"]),
  buildPalette("fresh-mint", "Menta fresca", "#34D399", "#001A10", ["#34D399", "#10B981", "#001A10", "#064E3B", "#0F1117"]),
  buildPalette("neon-orange", "Naranja neón", "#FB923C", "#1A0D00", ["#FB923C", "#F97316", "#1A0D00", "#431407", "#0F1117"]),
  buildPalette("royal-blue", "Azul royal", "#3B82F6", "#00061A", ["#3B82F6", "#2563EB", "#00061A", "#1E3A8A", "#0F1117"]),
  buildPalette("bold-fuchsia", "Fucsia bold", "#D946EF", "#1A0018", ["#D946EF", "#C026D3", "#1A0018", "#4A044E", "#0F1117"]),
  buildPalette("lunar-white", "Blanco lunar", "#E8622A", "#F1F5F9", ["#E8622A", "#F1F5F9", "#E2E8F0", "#64748B", "#1A1A2E"], DARK_SURFACE),
];

const LEGACY_PALETTE_MAP: Record<string, ThemePaletteId> = {
  "classic-orange": "fire-orange",
  "professional-blue": "royal-blue",
  "restaurant-green": "dark-forest",
  "bold-red": "passion-red",
  "elegant-purple": "galaxy-purple",
  "premium-gold": "royal-gold",
};

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.replace("#", "").trim();
  if (normalized.length !== 6) return null;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b };
}

function darkenHex(hex: string, amount = 0.08): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const factor = 1 - amount;
  return `#${[rgb.r, rgb.g, rgb.b]
    .map((n) => Math.round(n * factor))
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("")}`;
}

function mutedOn(baseText: string, opacity = 0.65): string {
  return baseText === LIGHT_TEXT
    ? `rgba(248, 250, 252, ${opacity})`
    : `rgba(26, 26, 46, ${opacity})`;
}

export function paletteToConfig(palette: ThemePalette): ThemeConfig {
  return { paletteId: palette.id, accent: palette.accent, primary: palette.primary };
}

export function getPaletteResolvedColors(palette: ThemePalette) {
  const accentText = getContrastText(palette.accent);
  return {
    sidebarText: palette.textOnPrimary,
    accentText,
    isLightSidebar: palette.textOnPrimary === DARK_TEXT,
    cardLabel: getContrastText("#FFFFFF"),
    sidebarMuted: mutedOn(palette.textOnPrimary),
    sidebarIcon: palette.textOnPrimary,
  };
}

export function parseThemeConfig(raw: unknown): ThemeConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  let paletteId = (obj.paletteId as string) ?? "";
  paletteId = LEGACY_PALETTE_MAP[paletteId] ?? paletteId;
  const accent = typeof obj.accent === "string" ? obj.accent : null;
  const primary = typeof obj.primary === "string" ? obj.primary : null;
  if (!paletteId || !accent || !primary) return null;
  const known = THEME_PALETTES.find((p) => p.id === paletteId);
  if (!known) return null;
  return { paletteId: known.id, accent, primary };
}

export function applyThemeToDocument(config: ThemeConfig | null) {
  const theme = config ?? DEFAULT_THEME;
  const palette =
    THEME_PALETTES.find((p) => p.id === theme.paletteId) ??
    THEME_PALETTES.find((p) => p.id === DEFAULT_THEME.paletteId)!;

  const primary = palette.primary;
  const accent = palette.accent;
  const dark = palette.dark;
  const textOnPrimary = palette.textOnPrimary;
  const textOnDark = palette.textOnDark;
  const textOnAccent = getContrastText(accent);
  const textOnCard = getContrastText("#FFFFFF");

  const root = document.documentElement;
  root.style.setProperty("--color-primary", primary);
  root.style.setProperty("--color-dark", dark);
  root.style.setProperty("--color-accent", accent);
  root.style.setProperty("--color-accent-hover", darkenHex(accent));

  /* Contraste automático — sidebar y superficies oscuras */
  root.style.setProperty("--color-text-on-primary", textOnPrimary);
  root.style.setProperty("--color-text-on-dark", textOnDark);
  root.style.setProperty("--color-text-on-sidebar", textOnPrimary);
  root.style.setProperty("--color-text-on-card", textOnCard);
  root.style.setProperty("--color-text-on-accent", textOnAccent);
  root.style.setProperty("--color-muted-on-primary", mutedOn(textOnPrimary));
  root.style.setProperty("--color-muted-on-dark", mutedOn(textOnDark));
  root.style.setProperty("--color-muted-on-card", MUTED_ON_LIGHT);

  /* Contenido de página — SIEMPRE oscuro (fondo claro #F1F5F9 / cards blancas) */
  root.style.setProperty("--color-text-primary", DARK_TEXT);
  root.style.setProperty("--color-text-secondary", MUTED_ON_LIGHT);

  /* Compatibilidad sidebar */
  root.style.setProperty("--color-text", textOnPrimary);
  root.style.setProperty("--color-text-inverse", textOnPrimary === LIGHT_TEXT ? DARK_TEXT : LIGHT_TEXT);
  root.style.setProperty("--color-sidebar-icon", textOnPrimary);
  root.style.setProperty("--color-sidebar-muted", mutedOn(textOnPrimary));

  root.style.setProperty("--color-input-text", DARK_TEXT);
  root.style.setProperty("--color-label", DARK_TEXT);
  root.style.setProperty("--color-input-bg", "#F8FAFC");
  root.style.setProperty("--color-input-border", "#E2E8F0");
  root.style.setProperty("--color-surface", "#F1F5F9");
  root.style.setProperty("--color-card", "#FFFFFF");
  root.style.setProperty("--color-border", "#E2E8F0");
}

export function clearThemeFromDocument() {
  applyThemeToDocument(DEFAULT_THEME);
  const root = document.documentElement;
  [
    "--color-primary",
    "--color-dark",
    "--color-accent",
    "--color-accent-hover",
    "--color-text-on-primary",
    "--color-text-on-dark",
    "--color-text-on-sidebar",
    "--color-text-on-card",
    "--color-text-on-accent",
    "--color-text",
    "--color-text-primary",
    "--color-text-secondary",
    "--color-text-inverse",
    "--color-muted-on-primary",
    "--color-muted-on-dark",
    "--color-muted-on-card",
    "--color-input-text",
    "--color-label",
    "--color-input-bg",
    "--color-input-border",
    "--color-surface",
    "--color-card",
    "--color-border",
    "--color-sidebar-icon",
    "--color-sidebar-muted",
  ].forEach((prop) => root.style.removeProperty(prop));
}
