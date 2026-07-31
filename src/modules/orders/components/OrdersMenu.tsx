import { useMemo, useState, type Ref } from "react";
import type { MenuItem } from "../api";

type Category = { id: string; name: string; active: boolean };

type Props = {
  menuItems: MenuItem[];
  categories: Category[];
  disabled?: boolean;
  searchInputRef?: Ref<HTMLInputElement>;
  onSelectItem: (item: MenuItem) => void;
};

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5" stroke="#E8622A" strokeWidth="1.6" />
      <path
        d="M12 12L16 16"
        stroke="#E8622A"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DishPlaceholderIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden>
      <ellipse cx="18" cy="24" rx="10" ry="4" stroke="#E8622A" strokeWidth="1.5" />
      <path
        d="M12 20C12 14.477 14.686 10 18 10C21.314 10 24 14.477 24 20"
        stroke="#E8622A"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M18 6V10" stroke="#E8622A" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function EmptyIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden>
      <circle cx="24" cy="24" r="20" stroke="#E5E7EB" strokeWidth="2" />
      <path
        d="M16 28C16 22.477 19.582 18 24 18C28.418 18 32 22.477 32 28"
        stroke="#CBD5E1"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <ellipse cx="24" cy="30" rx="8" ry="3" stroke="#CBD5E1" strokeWidth="1.5" />
    </svg>
  );
}

export function OrdersMenu({
  menuItems,
  categories,
  disabled,
  searchInputRef,
  onSelectItem,
}: Props) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const activeCategories = useMemo(
    () => categories.filter((c) => c.active),
    [categories]
  );

  const filteredItems = useMemo(() => {
    let list = menuItems;
    if (categoryId) {
      list = list.filter((item) => item.category_id === categoryId);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((item) => item.name.toLowerCase().includes(q));
    }
    return list;
  }, [menuItems, categoryId, search]);

  const emptyMessage = search.trim()
    ? "No hay platos con ese nombre"
    : categoryId
      ? "No hay platos en esta categoría"
      : "No hay platos disponibles";

  return (
    <aside className="orders-col orders-col--right">
      <div className="orders-menu__toolbar">
        <label className="orders-menu__search">
          <SearchIcon />
          <input
            ref={searchInputRef}
            type="search"
            className="orders-menu__search-input"
            placeholder="Buscar plato..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <div className="orders-menu__tabs">
          <button
            type="button"
            className={`orders-menu__pill${categoryId === null ? " orders-menu__pill--active" : ""}`}
            onClick={() => setCategoryId(null)}
          >
            Todos
          </button>
          {activeCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`orders-menu__pill${categoryId === cat.id ? " orders-menu__pill--active" : ""}`}
              onClick={() => setCategoryId(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      <div className="orders-menu__grid">
        {filteredItems.length === 0 ? (
          <div className="orders-menu__empty">
            <EmptyIcon />
            <p>{emptyMessage}</p>
          </div>
        ) : (
          filteredItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className="orders-dish-card"
              disabled={disabled}
              onClick={() => onSelectItem(item)}
            >
              <div className="orders-dish-card__media">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt=""
                    className="orders-dish-card__img"
                    loading="lazy"
                  />
                ) : (
                  <div className="orders-dish-card__placeholder">
                    <DishPlaceholderIcon />
                  </div>
                )}
                <span className="orders-dish-card__overlay" aria-hidden />
              </div>
              <div className="orders-dish-card__body">
                <span className="orders-dish-card__name">{item.name}</span>
                <span className="orders-dish-card__price">${item.price.toFixed(2)}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
