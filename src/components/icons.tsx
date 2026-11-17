// Tabler Icons (outline, MIT)
const ICON = {
  trash: ["M4 7l16 0", "M10 11l0 6", "M14 11l0 6", "M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12", "M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"],
  x: ["M18 6l-12 12", "M6 6l12 12"],
  check: ["M5 12l5 5l10 -10"],
  save: ["M6 4h10l4 4v10a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2", "M10 14a2 2 0 1 0 4 0a2 2 0 1 0 -4 0", "M14 4l0 4l-6 0l0 -4"],
  clockPlus: ["M20.984 12.535a9 9 0 1 0 -8.468 8.45", "M16 19h6", "M19 16v6", "M12 7v5l3 3"],
  device: ["M3 5a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-10", "M7 20h10", "M9 16v4", "M15 16v4"],
  sun: ["M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0", "M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7"],
  moon: ["M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454l0 .008"],
  adjustments: ["M12 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0", "M4 6l8 0", "M16 6l4 0", "M6 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0", "M4 12l2 0", "M10 12l10 0", "M15 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0", "M4 18l11 0", "M19 18l1 0"],
  maximize: ["M16 4l4 0l0 4", "M14 10l6 -6", "M8 20l-4 0l0 -4", "M4 20l6 -6", "M16 20l4 0l0 -4", "M14 14l6 6", "M8 4l-4 0l0 4", "M4 4l6 6"],
};
export const Ico = ({ n, always, cls }: { n: keyof typeof ICON; always?: boolean; cls?: string }) => (
  <svg aria-hidden="true" class={cls ?? (always ? "w-5 h-5" : "w-5 h-5 sm:hidden")} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{ICON[n].map((d) => <path d={d} />)}</svg>
);
