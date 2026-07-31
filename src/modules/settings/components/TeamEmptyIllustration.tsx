/** Ilustración SVG simple para estado vacío de Equipo */
export function TeamEmptyIllustration() {
  return (
    <svg
      className="us-empty__illus"
      viewBox="0 0 160 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="80" cy="42" r="22" fill="currentColor" opacity="0.25" />
      <path
        d="M48 88c0-14 14-26 32-26s32 12 32 26"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.35"
      />
      <circle cx="38" cy="52" r="14" fill="currentColor" opacity="0.18" />
      <path
        d="M22 92c0-9 9-17 16-17s16 8 16 17"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.28"
      />
      <circle cx="122" cy="52" r="14" fill="currentColor" opacity="0.18" />
      <path
        d="M106 92c0-9 9-17 16-17s16 8 16 17"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.28"
      />
      <circle cx="80" cy="38" r="6" fill="#94a3b8" opacity="0.5" />
    </svg>
  );
}
