export function clampRegion(text, region) {
  const len = String(text || "").length;
  if (!region) return null;
  const start = Math.max(0, Math.min(len, region.start | 0));
  const end = Math.max(start, Math.min(len, region.end | 0));
  return { start, end };
}

export function replaceRegionText(text, region, replacement) {
  const src = String(text || "");
  const r = clampRegion(src, region);
  if (!r) return src;
  return src.slice(0, r.start) + String(replacement || "") + src.slice(r.end);
}

