import { getContrastText } from "../theme";

type Props = {
  accent: string;
  primary: string;
};

export function ThemeMockup({ accent, primary }: Props) {
  const sidebarText = getContrastText(primary);
  const accentText = getContrastText(accent);
  const navMuted = sidebarText === "#FFFFFF" ? "rgba(255,255,255,0.35)" : "rgba(26,26,46,0.25)";

  return (
    <div className="stg-mockup" aria-hidden>
      <div className="stg-mockup__window">
        <div className="stg-mockup__sidebar" style={{ background: primary, color: sidebarText }}>
          <div className="stg-mockup__logo" style={{ background: accent, color: accentText }} />
          <div
            className="stg-mockup__nav-item stg-mockup__nav-item--active"
            style={{ background: accent, color: accentText }}
          />
          <div className="stg-mockup__nav-item" style={{ background: navMuted }} />
          <div className="stg-mockup__nav-item" style={{ background: navMuted }} />
          <div className="stg-mockup__nav-item" style={{ background: navMuted }} />
        </div>
        <div className="stg-mockup__main">
          <div className="stg-mockup__header">
            <div className="stg-mockup__title" />
            <div className="stg-mockup__btn" style={{ background: accent, color: accentText }} />
          </div>
          <div className="stg-mockup__cards">
            <div className="stg-mockup__card">
              <div className="stg-mockup__card-bar" style={{ background: accent }} />
            </div>
            <div className="stg-mockup__card">
              <div className="stg-mockup__card-bar" style={{ background: primary }} />
            </div>
            <div className="stg-mockup__card">
              <div className="stg-mockup__card-bar" style={{ background: accent, opacity: 0.85 }} />
            </div>
          </div>
        </div>
      </div>
      <p className="stg-mockup__caption">Vista previa en vivo</p>
    </div>
  );
}
