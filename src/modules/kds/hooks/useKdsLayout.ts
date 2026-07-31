import { useEffect, useRef, useState } from "react";
import {
  computeKdsLayout,
  type KdsLayoutConfig,
} from "../utils/kdsLayout";

export function useKdsLayout(orderCount: number) {
  const headerRef = useRef<HTMLElement>(null);
  const [layout, setLayout] = useState<KdsLayoutConfig>(() =>
    computeKdsLayout(orderCount, window.innerWidth)
  );

  useEffect(() => {
    function recalc() {
      setLayout(computeKdsLayout(orderCount, window.innerWidth));
    }

    recalc();
    window.addEventListener("resize", recalc);

    const headerEl = headerRef.current;
    const ro = headerEl ? new ResizeObserver(recalc) : null;
    if (headerEl && ro) ro.observe(headerEl);

    return () => {
      window.removeEventListener("resize", recalc);
      ro?.disconnect();
    };
  }, [orderCount]);

  return { layout, headerRef };
}
