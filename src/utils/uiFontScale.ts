export const UI_FONT_SCALE_KEY = 'shfs-ui-font-scale';

export type UiFontScale = 'sm' | 'md' | 'lg' | 'xl';

export const UI_FONT_SCALE_OPTIONS: { id: UiFontScale; label: string; sizePx: number }[] = [
  { id: 'sm', label: '小', sizePx: 14 },
  { id: 'md', label: '標準', sizePx: 16 },
  { id: 'lg', label: '大', sizePx: 18 },
  { id: 'xl', label: '特大', sizePx: 20 },
];

export function readUiFontScale(): UiFontScale {
  try {
    const raw = localStorage.getItem(UI_FONT_SCALE_KEY);
    if (raw === 'sm' || raw === 'md' || raw === 'lg' || raw === 'xl') return raw;
  } catch {
    /* ignore */
  }
  return 'md';
}

export function applyUiFontScale(scale: UiFontScale) {
  const opt = UI_FONT_SCALE_OPTIONS.find((o) => o.id === scale) || UI_FONT_SCALE_OPTIONS[1];
  document.documentElement.style.setProperty('--ui-font-size', `${opt.sizePx}px`);
  document.documentElement.dataset.uiFontScale = scale;
}

export function persistUiFontScale(scale: UiFontScale) {
  try {
    localStorage.setItem(UI_FONT_SCALE_KEY, scale);
  } catch {
    /* ignore */
  }
  applyUiFontScale(scale);
}
