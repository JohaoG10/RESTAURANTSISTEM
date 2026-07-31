import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AppToast } from "../../../app/components/AppToast";
import { PageHeader } from "../../../app/components/PageHeader";
import {
  createCategory,
  createMenuItem,
  fetchCategories,
  fetchMenuItems,
  softDeleteMenuItem,
  updateCategory,
  updateMenuItem,
  uploadMenuItemImage,
} from "../api";
import { CategoryModal } from "../components/CategoryModal";
import { CategorySidebar } from "../components/CategorySidebar";
import { MenuItemCard } from "../components/MenuItemCard";
import { MenuItemModal, type MenuItemFormValues } from "../components/MenuItemModal";
import type { Category, MenuItem } from "../types";
import type { MenuItemStatus } from "../utils";
import { staggerContainer, staggerItem } from "../../../lib/animations/motion";

export function MenuPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [openMenuItemId, setOpenMenuItemId] = useState<string | null>(null);

  const activeItems = useMemo(
    () => items.filter((item) => item.deleted_at === null),
    [items]
  );

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId]
  );

  const categoryItems = useMemo(() => {
    if (!selectedCategoryId) return [];
    return activeItems.filter((item) => item.category_id === selectedCategoryId);
  }, [activeItems, selectedCategoryId]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [categoryRows, itemRows] = await Promise.all([fetchCategories(), fetchMenuItems()]);
      setCategories(categoryRows);
      setItems(itemRows);
      setSelectedCategoryId((prev) => {
        if (prev && categoryRows.some((c) => c.id === prev)) return prev;
        return categoryRows[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el menú");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (!successToast) return;
    const timer = window.setTimeout(() => setSuccessToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [successToast]);

  async function resolveImageUrl(values: MenuItemFormValues, currentUrl: string | null) {
    if (values.removeImage) return null;
    if (values.imageFile) return uploadMenuItemImage(values.imageFile);
    return currentUrl;
  }

  async function handleCreateCategory(name: string) {
    setBusy(true);
    try {
      const created = await createCategory({
        name,
        active: true,
        sort_order: categories.length + 1,
      });
      setCategories((prev) => [...prev, created]);
      setSelectedCategoryId(created.id);
      setSuccessToast("Categoría creada correctamente");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveItem(values: MenuItemFormValues) {
    setBusy(true);
    try {
      const image_url = await resolveImageUrl(values, editingItem?.image_url ?? null);
      const price = Number(values.price);

      if (editingItem) {
        const updated = await updateMenuItem(editingItem.id, {
          name: values.name.trim(),
          description: values.description.trim() || null,
          price,
          category_id: values.category_id,
          status: values.status,
          image_url,
        });
        setItems((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
        if (selectedCategoryId !== updated.category_id) {
          setSelectedCategoryId(updated.category_id);
        }
        setSuccessToast("Plato actualizado correctamente");
        setItemModalOpen(false);
        setEditingItem(null);
      } else {
        const created = await createMenuItem({
          name: values.name.trim(),
          description: values.description.trim() || null,
          price,
          category_id: values.category_id,
          status: values.status,
          image_url,
          sort_order: categoryItems.length,
        });
        setItems((prev) =>
          [...prev, created].sort((a, b) => a.name.localeCompare(b.name, "es"))
        );
        setSelectedCategoryId(created.category_id);
        setSuccessToast("Plato creado correctamente");
        setItemModalOpen(false);
        setEditingItem(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo guardar el plato";
      setError(message);
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleCategory(category: Category) {
    const next = !category.active;
    setBusy(true);
    try {
      await updateCategory(category.id, { active: next });
      setCategories((prev) =>
        prev.map((row) => (row.id === category.id ? { ...row, active: next } : row))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar la categoría");
    } finally {
      setBusy(false);
    }
  }

  async function handleChangeStatus(item: MenuItem, status: MenuItemStatus) {
    setOpenMenuItemId(null);
    if (item.status === status) return;
    setBusy(true);
    try {
      const updated = await updateMenuItem(item.id, { status });
      setItems((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el estado");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteItem(item: MenuItem) {
    setOpenMenuItemId(null);
    if (!window.confirm(`¿Eliminar «${item.name}»? Esta acción no se puede deshacer.`)) {
      return;
    }
    setBusy(true);
    try {
      await softDeleteMenuItem(item.id, "Eliminado desde módulo menú");
      setItems((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? { ...row, deleted_at: new Date().toISOString() }
            : row
        )
      );
      setSuccessToast("Plato eliminado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el plato");
    } finally {
      setBusy(false);
    }
  }

  function openCreateItem() {
    setEditingItem(null);
    setItemModalOpen(true);
  }

  function openEditItem(item: MenuItem) {
    setOpenMenuItemId(null);
    setEditingItem(item);
    setItemModalOpen(true);
  }

  return (
    <main className="app-page menu-page">
      <PageHeader title="Menú" subtitle="Administra categorías y platos del restaurante." />

      <div className="app-page__body menu-page__body">
        {error ? <p className="billing-error menu-page__error">{error}</p> : null}

        {loading ? (
          <p className="menu-page__loading">Cargando menú…</p>
        ) : (
          <div className="menu-layout">
            <CategorySidebar
              categories={categories}
              items={activeItems}
              selectedId={selectedCategoryId}
              onSelect={setSelectedCategoryId}
              onToggleActive={(cat) => void handleToggleCategory(cat)}
              onNewCategory={() => setCategoryModalOpen(true)}
            />

            <section className="menu-panel" aria-label="Platos de la categoría">
              <header className="menu-panel__header">
                <h2 className="menu-panel__title">
                  {selectedCategory?.name ?? "Selecciona una categoría"}
                </h2>
                <button
                  type="button"
                  className="table-modal__btn-primary menu-panel__new-btn"
                  disabled={!selectedCategoryId || busy}
                  onClick={openCreateItem}
                >
                  + Nuevo plato
                </button>
              </header>

              {!selectedCategoryId ? (
                <p className="menu-panel__empty">
                  Crea una categoría para comenzar a agregar platos.
                </p>
              ) : categoryItems.length === 0 ? (
                <p className="menu-panel__empty">
                  No hay platos en esta categoría. Usa «+ Nuevo plato» para agregar uno.
                </p>
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={selectedCategoryId}
                    className="menu-items-grid"
                    variants={staggerContainer}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={{ duration: 0.25 }}
                  >
                    {categoryItems.map((item) => (
                      <motion.div key={item.id} variants={staggerItem} layout>
                        <MenuItemCard
                          item={item}
                          menuOpen={openMenuItemId === item.id}
                          onMenuToggle={() =>
                            setOpenMenuItemId((prev) => (prev === item.id ? null : item.id))
                          }
                          onMenuClose={() => setOpenMenuItemId(null)}
                          onEdit={() => openEditItem(item)}
                          onChangeStatus={(status) => void handleChangeStatus(item, status)}
                          onDelete={() => void handleDeleteItem(item)}
                        />
                      </motion.div>
                    ))}
                  </motion.div>
                </AnimatePresence>
              )}
            </section>
          </div>
        )}
      </div>

      {successToast ? <AppToast message={successToast} variant="success" /> : null}

      <CategoryModal
        open={categoryModalOpen}
        busy={busy}
        onClose={() => setCategoryModalOpen(false)}
        onSubmit={handleCreateCategory}
      />

      <MenuItemModal
        open={itemModalOpen}
        mode={editingItem ? "edit" : "create"}
        item={editingItem}
        categories={categories}
        defaultCategoryId={selectedCategoryId ?? undefined}
        busy={busy}
        onClose={() => {
          setItemModalOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleSaveItem}
      />
    </main>
  );
}
