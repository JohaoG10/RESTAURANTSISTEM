import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { updateRestaurantTheme } from "../restaurant-api";
import {
  applyThemeToDocument,
  DEFAULT_THEME,
  getContrastText,
  getPaletteResolvedColors,
  paletteToConfig,
  parseThemeConfig,
  THEME_PALETTES,
  type ThemeConfig,
  type ThemePaletteId,
} from "../theme";
import { ThemeMockup } from "./ThemeMockup";
import { staggerContainer, staggerItem } from "../../../lib/animations/motion";

type Props = {
  restaurantId: string;
  themeConfig: ThemeConfig | null;
  onSaved: () => Promise<void>;
};

const paletteStagger = {
  ...staggerContainer,
  animate: { transition: { staggerChildren: 0.05, delayChildren: 0.02 } },
};

export function SettingsAppearanceTab({ restaurantId, themeConfig, onSaved }: Props) {
  const savedTheme = parseThemeConfig(themeConfig) ?? DEFAULT_THEME;
  const [selectedId, setSelectedId] = useState<ThemePaletteId>(savedTheme.paletteId);
  const [previewTheme, setPreviewTheme] = useState(savedTheme);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setSelectedId(savedTheme.paletteId);
    setPreviewTheme(savedTheme);
  }, [savedTheme.paletteId, savedTheme.accent, savedTheme.primary]);

  function selectPalette(paletteId: ThemePaletteId) {
    const palette = THEME_PALETTES.find((p) => p.id === paletteId);
    if (!palette) return;
    const config = paletteToConfig(palette);
    setSelectedId(paletteId);
    setPreviewTheme(config);
    applyThemeToDocument(config);
  }

  function hoverPalette(paletteId: ThemePaletteId) {
    const palette = THEME_PALETTES.find((p) => p.id === paletteId);
    if (!palette) return;
    const config = paletteToConfig(palette);
    setPreviewTheme(config);
    applyThemeToDocument(config);
  }

  function resetPreview() {
    const palette = THEME_PALETTES.find((p) => p.id === selectedId);
    if (!palette) return;
    const config = paletteToConfig(palette);
    setPreviewTheme(config);
    applyThemeToDocument(config);
  }

  async function handleSave() {
    const palette = THEME_PALETTES.find((p) => p.id === selectedId);
    if (!palette) return;
    setBusy(true);
    setError(null);
    setSuccess(false);
    try {
      const config = paletteToConfig(palette);
      await updateRestaurantTheme(restaurantId, config);
      applyThemeToDocument(config);
      setSuccess(true);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el tema");
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    setSelectedId(DEFAULT_THEME.paletteId);
    setBusy(true);
    setError(null);
    setSuccess(false);
    try {
      await updateRestaurantTheme(restaurantId, DEFAULT_THEME);
      setPreviewTheme(DEFAULT_THEME);
      applyThemeToDocument(DEFAULT_THEME);
      setSuccess(true);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo restaurar el tema");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stg-card stg-card--appearance">
      <header className="stg-appearance-header">
        <h2 className="stg-appearance-header__title">Personaliza tu marca</h2>
        <p>20 paletas premium · Vista previa en tiempo real</p>
      </header>

      <div className="stg-card__body">
        <ThemeMockup accent={previewTheme.accent} primary={previewTheme.primary} />

        <motion.div
          className="stg-palette-grid stg-palette-grid--premium"
          variants={paletteStagger}
          initial="initial"
          animate="animate"
        >
          {THEME_PALETTES.map((palette) => {
            const selected = selectedId === palette.id;
            const cardBg = palette.primary;
            const labelColor = palette.textOnPrimary;
            const resolved = getPaletteResolvedColors(palette);

            return (
              <motion.button
                key={palette.id}
                type="button"
                variants={staggerItem}
                whileHover={{ scale: 1.05 }}
                transition={{ duration: 0.2 }}
                className={`stg-palette-card${selected ? " stg-palette-card--selected" : ""}`}
                style={{
                  background: cardBg,
                  color: labelColor,
                  ["--palette-accent" as string]: palette.accent,
                  ["--palette-check-bg" as string]: resolved.accentText === "#FFFFFF" ? palette.accent : "#1A1A2E",
                  ["--palette-check-fg" as string]: getContrastText(
                    resolved.accentText === "#FFFFFF" ? palette.accent : "#1A1A2E"
                  ),
                }}
                onClick={() => selectPalette(palette.id)}
                onMouseEnter={() => hoverPalette(palette.id)}
                onMouseLeave={resetPreview}
                disabled={busy}
                aria-pressed={selected}
              >
                <div className="stg-palette-card__swatches">
                  {palette.swatches.map((color) => (
                    <span
                      key={color}
                      className="stg-palette-card__swatch"
                      style={{ backgroundColor: color }}
                      aria-hidden
                    />
                  ))}
                </div>
                <span className="stg-palette-card__label">{palette.label}</span>
                {selected ? (
                  <span className="stg-palette-card__check" aria-hidden>
                    ✓
                  </span>
                ) : null}
              </motion.button>
            );
          })}
        </motion.div>

        <p className="stg-note">Los cambios de color se aplican para todos los usuarios del sistema.</p>

        {error ? <p className="stg-alert stg-alert--error">{error}</p> : null}
        {success ? <p className="stg-alert stg-alert--success">Tema guardado correctamente.</p> : null}

        <div className="stg-form__actions stg-form__actions--split">
          <button type="button" className="stg-btn-ghost" onClick={handleReset} disabled={busy}>
            Restaurar naranja clásico
          </button>
          <button
            type="button"
            className="stg-restaurant-save stg-restaurant-save--inline"
            disabled={busy}
            onClick={() => void handleSave()}
          >
            {busy ? (
              <>
                <span className="stg-restaurant-save__spinner" aria-hidden />
                Guardando…
              </>
            ) : (
              "Guardar paleta"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
