import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import gsap from "gsap";
import { fetchRestaurantSettings, type RestaurantSettings } from "../restaurant-api";
import { SettingsAppearanceTab } from "../components/SettingsAppearanceTab";
import { SettingsCertificateTab } from "../components/SettingsCertificateTab";
import { SettingsRestaurantTab } from "../components/SettingsRestaurantTab";
import { SettingsSriTab } from "../components/SettingsSriTab";
import { useAuth } from "../../auth/context/AuthProvider";

type SettingsTab = "restaurant" | "certificate" | "sri" | "appearance";

type NavItem = {
  id: SettingsTab;
  label: string;
  description: string;
  icon: ReactNode;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Negocio",
    items: [
      {
        id: "restaurant",
        label: "Restaurante",
        description: "Logo, datos y contacto",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
        ),
      },
    ],
  },
  {
    title: "Facturación",
    items: [
      {
        id: "certificate",
        label: "Certificado SRI",
        description: "Firma electrónica .p12",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        ),
      },
      {
        id: "sri",
        label: "Facturación SRI",
        description: "Ambiente y secuenciales",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <path d="M14 2v6h6" />
          </svg>
        ),
      },
    ],
  },
  {
    title: "Sistema",
    items: [
      {
        id: "appearance",
        label: "Apariencia",
        description: "Colores y marca visual",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42" />
          </svg>
        ),
      },
    ],
  },
];

export function SettingsPage() {
  const { reload } = useAuth();
  const [tab, setTab] = useState<SettingsTab>("restaurant");
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tabContentRef = useRef<HTMLDivElement>(null);
  const prevTabRef = useRef<SettingsTab>(tab);

  useEffect(() => {
    const el = tabContentRef.current;
    if (!el || prevTabRef.current === tab) return;

    const direction = getTabIndex(tab) > getTabIndex(prevTabRef.current) ? 1 : -1;
    prevTabRef.current = tab;

    gsap.fromTo(
      el,
      { x: 24 * direction, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.32, ease: "power3.out" }
    );
  }, [tab]);

  function getTabIndex(id: SettingsTab) {
    const all = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id));
    return all.indexOf(id);
  }

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRestaurantSettings();
      setSettings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la configuración");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleSaved = useCallback(async () => {
    await loadSettings();
    await reload();
  }, [loadSettings, reload]);

  return (
    <main className="stg-page">
      <header className="stg-page__hero">
        <div>
          <h1 className="stg-page__title">Configuración</h1>
          <p className="stg-page__subtitle">Centro de control del restaurante</p>
        </div>
      </header>

      <div className="stg-layout">
        <nav className="stg-sidebar" aria-label="Secciones de configuración">
          {NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.title} className="stg-sidebar__group">
              {groupIndex > 0 ? <hr className="stg-sidebar__divider" /> : null}
              <span className="stg-sidebar__group-title">{group.title}</span>
              <ul className="stg-sidebar__list">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`stg-sidebar__btn${tab === item.id ? " stg-sidebar__btn--active" : ""}`}
                      onClick={() => setTab(item.id)}
                      aria-current={tab === item.id ? "page" : undefined}
                    >
                      <span className="stg-sidebar__btn-icon" aria-hidden>
                        {item.icon}
                      </span>
                      <span className="stg-sidebar__btn-text">
                        <strong>{item.label}</strong>
                        <small>{item.description}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div ref={tabContentRef} className="stg-main" aria-live="polite">
          {loading ? (
            <div className="stg-card stg-card--loading">
              <div className="stg-spinner" />
              <p>Cargando configuración…</p>
            </div>
          ) : null}
          {error ? <p className="stg-alert stg-alert--error">{error}</p> : null}

          {!loading && settings ? (
            <>
              {tab === "restaurant" ? (
                <SettingsRestaurantTab settings={settings} onSaved={handleSaved} />
              ) : null}
              {tab === "certificate" ? (
                <SettingsCertificateTab settings={settings} onSaved={handleSaved} />
              ) : null}
              {tab === "sri" ? (
                <SettingsSriTab settings={settings} onSaved={handleSaved} />
              ) : null}
              {tab === "appearance" ? (
                <SettingsAppearanceTab
                  restaurantId={settings.id}
                  themeConfig={settings.theme_config}
                  onSaved={handleSaved}
                />
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
