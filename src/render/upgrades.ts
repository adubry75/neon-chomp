import { RARITY_COLOR, UPGRADE_BY_ID } from '../data/upgrades';
import { FONT, text, type Ctx } from './draw';

/**
 * Owned upgrades as rows of glyph, name, stack count and description.
 * Fits into the box (x, y, w, h), switching to two columns when rows run out.
 */
export function drawUpgradeList(c: Ctx, owned: Record<string, number>, x: number, y: number, w: number, h: number) {
  const ups = Object.entries(owned).filter(([id]) => UPGRADE_BY_ID[id]);
  if (!ups.length) { text(c, 'NO UPGRADES YET', x + w / 2, y + 12, 8, '#5a5290', 'center', 0); return; }
  const rowH = 32;
  const perCol = Math.max(1, Math.floor(h / rowH));
  const cols = ups.length > perCol ? 2 : 1;
  const colW = w / cols;
  const rh = Math.min(rowH, h / Math.ceil(ups.length / cols));
  ups.forEach(([id, n], i) => {
    const u = UPGRADE_BY_ID[id];
    const col = RARITY_COLOR[u.rarity];
    const cx = x + Math.floor(i / Math.ceil(ups.length / cols)) * colW;
    const cy = y + (i % Math.ceil(ups.length / cols)) * rh;
    text(c, u.glyph, cx + 14, cy + 10, 12, col, 'center', 6);
    text(c, `${u.name.toUpperCase()}${n > 1 ? ' x' + n : ''}`, cx + 32, cy + 5, 7, '#fff', 'left', 0);
    text(c, fit(c, u.desc, colW - 40, 6), cx + 32, cy + 18, 6, col, 'left', 0);
  });
}

/** One glowing glyph per owned upgrade, centered on (x, y). */
export function drawUpgradeChips(c: Ctx, owned: Record<string, number>, x: number, y: number) {
  const ups = Object.entries(owned).filter(([id]) => UPGRADE_BY_ID[id]);
  const step = 26;
  let cx = x - ((ups.length - 1) * step) / 2;
  for (const [id, n] of ups) {
    const u = UPGRADE_BY_ID[id];
    text(c, u.glyph, cx, y, 12, RARITY_COLOR[u.rarity], 'center', 6);
    if (n > 1) text(c, String(n), cx + 9, y + 9, 5, '#fff', 'center', 0);
    cx += step;
  }
}

/** Trim `s` with an ellipsis so it fits in `maxW` pixels at `size`. */
function fit(c: Ctx, s: string, maxW: number, size: number): string {
  c.save(); c.font = `${size}px ${FONT}`;
  let out = s;
  while (out.length > 4 && c.measureText(out).width > maxW) out = out.slice(0, -2);
  c.restore();
  return out === s ? s : out.trimEnd() + '…';
}
