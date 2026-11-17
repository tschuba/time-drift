// Tabler Icons via @iconify/tailwind4: pass complete literal classes like `icon-[tabler--trash]` (no interpolation), so Tailwind can see them.
export const Ico = (p: { c: string }) => <span class={`${p.c} size-4`} aria-hidden="true" />;
