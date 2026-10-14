const START = "// <zbc:blocks>";
const END = "// </zbc:blocks>";

export function ensureBlocksRegion(text) {
  if (text.includes(START) && text.includes(END)) return text;
  const trimmed = (text || "").trimEnd();
  const spacer = trimmed.length ? "\n\n" : "";
  return `${trimmed}${spacer}${START}\n// (generated from blocks)\n${END}\n`;
}

export function replaceBlocksRegion(text, generatedCode) {
  const src = ensureBlocksRegion(text || "");
  const startIdx = src.indexOf(START);
  const endIdx = src.indexOf(END);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return src;

  const before = src.slice(0, startIdx + START.length);
  const after = src.slice(endIdx);

  const gen = (generatedCode || "").trimEnd();
  const middle = `\n${gen ? gen + "\n" : ""}`;
  return `${before}${middle}${after}`;
}

export const REGION_MARKERS = { START, END };

export function stripZbcMarkers(text) {
  const src = String(text || "");
  // Remove region markers and any per-block markers we generate inside regions.
  return src
    .replaceAll(START + "\n", "")
    .replaceAll(START, "")
    .replaceAll(END + "\n", "")
    .replaceAll(END, "")
    .replaceAll(/\s*\/\/ <zbc:block id="[^"]+">\s*\r?\n/g, "")
    .replaceAll(/\s*\/\/ <\/zbc:block>\s*\r?\n?/g, "");
}
