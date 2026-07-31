# Sistema de diseño — POS Restaurante

Inspirado en **Toast POS** y **TouchBistro**: interfaz profesional, funcional y legible bajo presión operativa. Optimizado para **tablets 10" en landscape** y uso intensivo en sala.

---

## 1. Principios UX

| Principio | Aplicación |
|-----------|------------|
| Acción principal visible | CTA principal siempre en viewport superior; sin scroll para cobrar/confirmar |
| Información crítica grande | Totales, estados de mesa y comanda en **≥ 24px**, peso **700** |
| Confirmar destructivas | Eliminar, anular, cerrar turno → `window.confirm` o modal de confirmación |
| Feedback inmediato | Loading en botones, mensajes de error (`billing-error`), badges de estado |
| Touch-first | Targets mínimos **44×44px**; padding generoso en botones y filas táctiles |
| Bajo estrés | Alto contraste, pocos colores semánticos, jerarquía clara |

---

## 2. Paleta de colores

### Marca y superficies

| Token | Hex | Uso |
|-------|-----|-----|
| `--color-primary` | `#1A1A2E` | Sidebar, headers, texto principal |
| `--color-accent` | `#E8622A` | Botones primarios, CTAs, ítem activo en nav |
| `--color-accent-hover` | `#D15524` | Hover primario (−10% luminosidad) |
| `--color-surface` | `#F1F5F9` | Fondo de página (gris azulado) |
| `--color-card` | `#FFFFFF` | Cards y paneles |
| `--color-border` | `#E5E7EB` | Bordes de cards y paneles |
| `--color-input-bg` | `#F1F5F9` | Fondo de inputs, textareas, selects |
| `--color-input-border` | `#CBD5E1` | Borde de controles de formulario |
| `--color-label` | `#374151` | Labels en formularios |
| `--color-placeholder` | `#9CA3AF` | Placeholder de inputs |

### Texto

| Token | Hex | Uso |
|-------|-----|-----|
| `--color-text-primary` | `#1A1A2E` | Títulos, cuerpo principal |
| `--color-text-secondary` | `#6B7280` | Labels, hints, metadata |
| `--color-text-inverse` | `#FFFFFF` | Texto sobre primary/accent |

### Mesas (`table_status`)

| Estado | Hex | Token |
|--------|-----|-------|
| Disponible | `#2D9B6F` | `--color-table-available` |
| Ocupada | `#DC3545` | `--color-table-occupied` |
| Reservada | `#F59E0B` | `--color-table-reserved` |

### Ítems de comanda (`order_item_status`)

| Estado | Hex | Token |
|--------|-----|-------|
| Pendiente cocina | `#2D9B6F` | `--color-item-pending` |
| En preparación | `#E8622A` | `--color-item-preparing` |
| Entregado | `#9CA3AF` | `--color-item-served` |

### Semánticos

| Uso | Hex |
|-----|-----|
| Éxito | `#2D9B6F` |
| Error | `#DC3545` |
| Advertencia | `#F59E0B` |
| Info | `#2563EB` |

---

## 3. Tipografía

**Familia:** [Inter](https://fonts.google.com/specimen/Inter) (Google Fonts).

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

| Rol | Peso | Tamaño | Line-height |
|-----|------|--------|-------------|
| H1 | 600 | 24px | 1.25 |
| H2 | 600 | 20px | 1.3 |
| H3 | 600 | 18px | 1.35 |
| Body | 400 | 16px | 1.5 |
| Body small | 400 | 14px | 1.45 |
| Label / caption | 500 | 14px | 1.4 |
| **Total / monto** | **700** | **24px+** | 1.2 |

```css
font-family: 'Inter', system-ui, sans-serif;
```

---

## 4. Espaciado

| Token | Valor | Uso |
|-------|-------|-----|
| `--space-page` | 24px | Padding de `.content` |
| `--space-card-gap` | 16px | Entre cards en grid |
| `--space-card-padding` | 20px | Interior de `.panel` / card |
| `--space-btn-y` | 12px | Padding vertical botón |
| `--space-btn-x` | 24px | Padding horizontal botón |
| `--touch-min` | 44px | Altura mínima táctil |

---

## 5. Radios y sombras

| Token | Valor |
|-------|-------|
| `--radius-xl` | 12px (`rounded-xl`) — inputs, botones |
| `--radius-2xl` | 16px (`rounded-2xl`) — cards, modales |
| `--radius-full` | 9999px — badges |
| `--shadow-sm` | `0 1px 3px rgba(26, 26, 46, 0.08)` |
| `--shadow-md` | `0 4px 12px rgba(26, 26, 46, 0.12)` |
| `--shadow-modal` | `0 20px 50px rgba(26, 26, 46, 0.2)` |

---

## 6. Componentes base

Implementación actual: **CSS + variables** en `src/app/styles.css`.  
Referencia futura: **Tailwind + shadcn/ui** (mapeo abajo).

### Botón primario

- Fondo `#E8622A`, texto blanco
- `border-radius: 12px`, padding `12px 24px`, min-height `44px`
- Hover: `#D15524`
- Clase: `.btn--primary` o `button.primary`

### Botón secundario

- Borde `#1A1A2E`, texto `#1A1A2E`, fondo transparente
- Hover: fondo `rgba(26, 26, 46, 0.06)`
- Clase: `.btn--secondary`

### Botón destructivo

- Fondo/borde `#DC3545`, texto blanco
- Solo con confirmación previa
- Clase: `.btn--destructive`

### Card / Panel

- Fondo blanco, `border-radius: 16px`, `box-shadow: var(--shadow-sm)`, borde `#F3F4F6`
- Clase: `.panel`

### Input

- `border-radius: 12px`, borde `#E5E7EB`, padding `10px 12px`
- Focus: borde `#E8622A`, outline `2px rgba(232, 98, 42, 0.25)`
- min-height `44px` en formularios táctiles

### Badge de estado

- `border-radius: 9999px`, `font-size: 12px`, `font-weight: 700`, padding `4px 10px`
- Colores según semántica (mesa, ítem, pago)

### Modal

- Overlay: `rgba(26, 26, 46, 0.5)`
- Card centrada, `max-width` adaptable, `border-radius: 16px`, `shadow-modal`
- Clases: `.billing-modal-backdrop`, `.staff-modal`, etc.

---

## 7. Sidebar

| Propiedad | Valor |
|-----------|-------|
| Ancho desktop | 240px |
| Ancho colapsado (tablet) | 72px (solo íconos) |
| Fondo | `#1A1A2E` |
| Item activo | fondo `#E8622A`, texto blanco |
| Item inactivo | texto `#E5E7EB`, hover `rgba(255,255,255,0.08)` |

Estructura:

1. Logo / nombre restaurante (blanco, truncado)
2. Navegación: ícono + etiqueta
3. Footer: avatar inicial, nombre, rol, cerrar sesión

Breakpoint colapsable: `max-width: 1024px`.

---

## 8. Layout de aplicación

```
.app-shell
├── .sidebar (240px | 72px colapsado)
└── .content (fondo #F8F7F4, padding 24px)
```

---

## 9. Mapeo Tailwind + shadcn (adopción futura)

Cuando se integre Tailwind, usar esta configuración en `tailwind.config`:

```js
theme: {
  extend: {
    colors: {
      primary: { DEFAULT: '#1A1A2E', foreground: '#FFFFFF' },
      accent: { DEFAULT: '#E8622A', foreground: '#FFFFFF' },
      surface: '#F8F7F4',
      border: '#E5E7EB',
      muted: { foreground: '#6B7280' },
      success: '#2D9B6F',
      destructive: '#DC3545',
      warning: '#F59E0B',
    },
    borderRadius: { xl: '12px', '2xl': '16px' },
    fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
  },
},
```

| Componente shadcn | Variante / clase |
|-------------------|------------------|
| Button | `default` → accent, `outline` → secondary, `destructive` → destructive |
| Card | `rounded-2xl shadow-sm border-gray-100` |
| Input | `rounded-xl focus-visible:ring-accent` |
| Badge | `rounded-full font-bold text-xs` |
| Dialog | overlay oscuro + `rounded-2xl` |

---

## 10. Checklist por módulo

Al tocar un módulo, verificar:

- [ ] Fondo de página `--color-surface`
- [ ] Cards con `.panel` y padding 20px
- [ ] Botón principal naranja, no gris/negro legacy
- [ ] Totales con `.text-total` o `font-weight: 700; font-size: 24px`
- [ ] Estados con badges de color correcto
- [ ] Touch targets ≥ 44px en acciones frecuentes
- [ ] Errores con `.billing-error` o equivalente

---

## 11. Archivos de referencia

| Archivo | Contenido |
|---------|-----------|
| `src/app/styles.css` | Tokens `:root` y clases globales |
| `src/app/layout/AppLayout.tsx` | Shell + sidebar |
| `index.html` | Carga de Inter |

---

*Versión 1.0 — POS Restaurante*
