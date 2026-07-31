import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { MenuItem } from "../types";import {
  formatMenuPrice,
  menuItemCardStatusClass,
  menuItemStatusBadgeClass,
  menuItemStatusLabel,
  MENU_ITEM_STATUS_OPTIONS,
  type MenuItemStatus,
} from "../utils";

type Props = {
  item: MenuItem;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onMenuClose: () => void;
  onEdit: () => void;
  onChangeStatus: (status: MenuItemStatus) => void;
  onDelete: () => void;
};

function DishPlaceholderIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden>
      <ellipse cx="12" cy="14" rx="8" ry="3" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6 10c0-3 2.5-5 6-5s6 2 6 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MenuItemCard({
  item,
  menuOpen,
  onMenuToggle,
  onMenuClose,
  onEdit,
  onChangeStatus,
  onDelete,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onMenuClose();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [menuOpen, onMenuClose]);

  return (
    <motion.article
      className={`menu-dish-card panel ${menuItemCardStatusClass(item.status)}`}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.98 }}
    >      <div className="menu-dish-card__media">
        {item.image_url ? (
          <img src={item.image_url} alt="" className="menu-dish-card__img" loading="lazy" />
        ) : (
          <div className="menu-dish-card__placeholder" aria-hidden>
            <DishPlaceholderIcon />
          </div>
        )}
        <span
          className={`menu-dish-card__status ${menuItemStatusBadgeClass(item.status)}`}
        >
          {menuItemStatusLabel(item.status)}
        </span>
        <div className="menu-dish-card__menu-wrap" ref={menuRef}>
          <button
            type="button"
            className="menu-dish-card__menu-btn"
            aria-label="Opciones del plato"
            aria-expanded={menuOpen}
            aria-haspopup="true"
            onClick={(e) => {
              e.stopPropagation();
              onMenuToggle();
            }}
          >
            ⋮
          </button>
          {menuOpen ? (
            <div className="menu-dish-card__dropdown" role="menu">
              <button type="button" role="menuitem" onClick={onEdit}>
                Editar
              </button>
              <div className="menu-dish-card__dropdown-label">Cambiar estado</div>
              {MENU_ITEM_STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="menuitem"
                  className={item.status === option.value ? "is-active" : undefined}
                  onClick={() => onChangeStatus(option.value)}
                >
                  {option.label}
                </button>
              ))}
              <button
                type="button"
                role="menuitem"
                className="menu-dish-card__dropdown-danger"
                onClick={onDelete}
              >
                Eliminar
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="menu-dish-card__body">
        <h3 className="menu-dish-card__name">{item.name}</h3>
        <span className="menu-dish-card__price-badge">{formatMenuPrice(item.price)}</span>
        <p className="menu-dish-card__description">
          {item.description?.trim() || "Sin descripción"}
        </p>
      </div>
    </motion.article>
  );
}