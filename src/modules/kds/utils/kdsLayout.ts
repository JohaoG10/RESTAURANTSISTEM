export type KdsDensity = "xl" | "lg" | "md" | "sm" | "xs" | "xxs";

export type KdsLayoutConfig = {
  density: KdsDensity;
  columns: number;
  gap: number;
  fontSize: number;
  itemPaddingY: number;
  bodyPadding: number;
  headPadding: number;
  mesaFontSize: number;
  timerFontSize: number;
};

const GAP = 16;

const DENSITY: Record<
  KdsDensity,
  {
    fontSize: number;
    itemPaddingY: number;
    bodyPadding: number;
    headPadding: number;
    mesaFontSize: number;
    timerFontSize: number;
  }
> = {
  xl: {
    fontSize: 20,
    itemPaddingY: 14,
    bodyPadding: 24,
    headPadding: 16,
    mesaFontSize: 22,
    timerFontSize: 20,
  },
  lg: {
    fontSize: 18,
    itemPaddingY: 12,
    bodyPadding: 20,
    headPadding: 14,
    mesaFontSize: 20,
    timerFontSize: 18,
  },
  md: {
    fontSize: 16,
    itemPaddingY: 10,
    bodyPadding: 18,
    headPadding: 12,
    mesaFontSize: 18,
    timerFontSize: 16,
  },
  sm: {
    fontSize: 14,
    itemPaddingY: 8,
    bodyPadding: 16,
    headPadding: 10,
    mesaFontSize: 16,
    timerFontSize: 15,
  },
  xs: {
    fontSize: 13,
    itemPaddingY: 6,
    bodyPadding: 8,
    headPadding: 8,
    mesaFontSize: 14,
    timerFontSize: 14,
  },
  xxs: {
    fontSize: 12,
    itemPaddingY: 4,
    bodyPadding: 6,
    headPadding: 6,
    mesaFontSize: 13,
    timerFontSize: 12,
  },
};

function densityForCount(count: number): KdsDensity {
  if (count <= 2) return "xl";
  if (count <= 4) return "lg";
  if (count <= 6) return "md";
  if (count <= 9) return "sm";
  if (count <= 12) return "xs";
  return "xxs";
}

function columnsForCount(count: number, viewportWidth: number): number {
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  if (count <= 12) return 4;
  return viewportWidth >= 1280 ? 5 : 4;
}

export function computeKdsLayout(
  orderCount: number,
  viewportWidth: number
): KdsLayoutConfig {
  const count = Math.max(1, orderCount || 1);
  const columns = columnsForCount(count, viewportWidth);
  const density = densityForCount(count);
  const tokens = DENSITY[density];

  return {
    density,
    columns,
    gap: count > 12 ? 12 : GAP,
    fontSize: tokens.fontSize,
    itemPaddingY: tokens.itemPaddingY,
    bodyPadding: tokens.bodyPadding,
    headPadding: tokens.headPadding,
    mesaFontSize: tokens.mesaFontSize,
    timerFontSize: tokens.timerFontSize,
  };
}

export function layoutToCssVars(layout: KdsLayoutConfig): Record<string, string> {
  return {
    "--kds-cols": String(layout.columns),
    "--kds-gap": `${layout.gap}px`,
    "--kds-font-size": `${layout.fontSize}px`,
    "--kds-item-padding-y": `${layout.itemPaddingY}px`,
    "--kds-body-padding": `${layout.bodyPadding}px`,
    "--kds-head-padding": `${layout.headPadding}px`,
    "--kds-mesa-font-size": `${layout.mesaFontSize}px`,
    "--kds-timer-font-size": `${layout.timerFontSize}px`,
  };
}
