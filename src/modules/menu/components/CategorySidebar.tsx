import type { Category, MenuItem } from "../types";

type Props = {
  categories: Category[];
  items: MenuItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleActive: (category: Category) => void;
  onNewCategory: () => void;
};

function activeItemCount(items: MenuItem[], categoryId: string) {
  return items.filter(
    (item) => item.category_id === categoryId && item.deleted_at === null && item.status === "active"
  ).length;
}

export function CategorySidebar({
  categories,
  items,
  selectedId,
  onSelect,
  onToggleActive,
  onNewCategory,
}: Props) {
  return (
    <aside className="menu-sidebar" aria-label="Categorías del menú">
      <h2 className="menu-sidebar__title">Categorías</h2>

      <ul className="menu-sidebar__list">
        {categories.map((category) => {
          const count = activeItemCount(items, category.id);
          const selected = category.id === selectedId;

          return (
            <li key={category.id}>
              <div className={`menu-category-row${selected ? " menu-category-row--selected" : ""}`}>
                <button
                  type="button"
                  className={`menu-category-pill${selected ? " menu-category-pill--selected" : ""}`}
                  onClick={() => onSelect(category.id)}
                >
                  <span className="menu-category-pill__name">{category.name}</span>
                  <span className="menu-category-pill__badge" aria-label={`${count} platos activos`}>
                    {count}
                  </span>
                </button>
                <label className="menu-switch" title={category.active ? "Categoría activa" : "Categoría inactiva"}>
                  <input
                    type="checkbox"
                    checked={category.active}
                    onChange={() => onToggleActive(category)}
                    aria-label={`${category.active ? "Desactivar" : "Activar"} categoría ${category.name}`}
                  />
                  <span className="menu-switch__slider" aria-hidden />
                </label>
              </div>
            </li>
          );
        })}
      </ul>

      {categories.length === 0 ? (
        <p className="menu-sidebar__empty">Sin categorías. Crea la primera abajo.</p>
      ) : null}

      <button type="button" className="menu-sidebar__new-btn" onClick={onNewCategory}>
        + Nueva categoría
      </button>
    </aside>
  );
}
