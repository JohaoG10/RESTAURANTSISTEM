export type OrdersMobileTab = "tables" | "order" | "menu";

type Props = {
  activeTab: OrdersMobileTab;
  onChange: (tab: OrdersMobileTab) => void;
};

export function OrdersMobileTabs({ activeTab, onChange }: Props) {
  return (
    <nav className="orders-mobile-tabs" aria-label="Navegación comandas">
      <button
        type="button"
        className={`orders-mobile-tabs__btn${activeTab === "tables" ? " orders-mobile-tabs__btn--active" : ""}`}
        onClick={() => onChange("tables")}
      >
        <span aria-hidden>▦</span>
        Mesas
      </button>
      <button
        type="button"
        className={`orders-mobile-tabs__btn${activeTab === "order" ? " orders-mobile-tabs__btn--active" : ""}`}
        onClick={() => onChange("order")}
      >
        <span aria-hidden>☰</span>
        Comanda
      </button>
      <button
        type="button"
        className={`orders-mobile-tabs__btn${activeTab === "menu" ? " orders-mobile-tabs__btn--active" : ""}`}
        onClick={() => onChange("menu")}
      >
        <span aria-hidden>＋</span>
        Menú
      </button>
    </nav>
  );
}
