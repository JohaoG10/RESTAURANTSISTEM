import { useEffect, useRef } from "react";
import gsap from "gsap";

const DEFAULT_EASE = "power3.out";
const DEFAULT_DURATION = 0.35;

/** Contador numérico GSAP con snap entero */
export function useGsapCounter(
  target: number,
  enabled: boolean,
  options?: { duration?: number; decimals?: number; resetKey?: string | number }
) {
  const ref = useRef<HTMLSpanElement>(null);
  const { duration = DEFAULT_DURATION, decimals = 0, resetKey } = options ?? {};

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const obj = { val: 0 };
    const tween = gsap.to(obj, {
      val: target,
      duration,
      ease: DEFAULT_EASE,
      snap: decimals === 0 ? { val: 1 } : undefined,
      onUpdate: () => {
        el.textContent =
          decimals > 0 ? obj.val.toFixed(decimals) : String(Math.round(obj.val));
      },
    });

    return () => {
      tween.kill();
    };
  }, [target, enabled, duration, decimals, resetKey]);

  return ref;
}

/** Llena una barra de progreso con timeline GSAP */
export function useGsapProgressBar(
  pct: number,
  enabled: boolean,
  resetKey?: string | number
) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    gsap.fromTo(
      el,
      { width: "0%" },
      { width: `${Math.min(pct, 100)}%`, duration: DEFAULT_DURATION, ease: DEFAULT_EASE }
    );
  }, [pct, enabled, resetKey]);

  return ref;
}

/** Pulse yoyo para timers urgentes */
export function useGsapPulse(active: boolean, urgent = false) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !active || !urgent) return;

    const tween = gsap.to(el, {
      scale: 1.06,
      opacity: 0.85,
      duration: 0.35,
      ease: "power1.inOut",
      yoyo: true,
      repeat: -1,
    });

    return () => {
      tween.kill();
      gsap.set(el, { clearProps: "scale,opacity" });
    };
  }, [active, urgent]);

  return ref;
}

/** Timeline de entrada para elemento (from arriba con spring-like) */
export function useGsapEnterFromTop(enabled: boolean, key?: string) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    gsap.from(el, {
      y: -24,
      opacity: 0,
      duration: 0.38,
      ease: "back.out(1.4)",
    });
  }, [enabled, key]);

  return ref;
}

/** Timeline de salida: fade + scale down */
export function useGsapExitTimeline(exiting: boolean, onComplete?: () => void) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !exiting) return;

    const tl = gsap.timeline({ onComplete });
    tl.to(el, { opacity: 0, scale: 0.92, duration: 0.28, ease: "power2.in" });

    return () => {
      tl.kill();
    };
  }, [exiting, onComplete]);

  return ref;
}
