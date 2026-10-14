import { REGION_MARKERS } from "./markers.js";
import { getOrCreateZbcId } from "./zbcIds.js";
import { splitJsToTopLevelStatements } from "./codeToBlocks.js";

const BLOCK_START_RE = /\/\/ <zbc:block id="([^"]+)">[ \t]*\r?\n/g;
const BLOCK_END_RE = /\/\/ <\/zbc:block>[ \t]*\r?\n?/g;

export function generateBlocksRegionFromWorkspace({ workspace, generator }) {
  const parts = [];
  const top = workspace.getTopBlocks(true);

  for (const topBlock of top) {
    let block = topBlock;
    while (block) {
      const zbcId = getOrCreateZbcId(block);
      const code = generator.blockToCode(block);
      const text = Array.isArray(code) ? code[0] : code;
      const body = (text || "").trimEnd();
      parts.push(`// <zbc:block id="${zbcId}">\n${body ? body + "\n" : ""}// </zbc:block>\n`);
      block = block.getNextBlock ? block.getNextBlock() : null;
    }
  }

  if (parts.length === 0) return `// (no blocks)\n`;
  return parts.join("\n");
}

export function extractBlocksRegion(text) {
  const src = String(text || "");
  const startIdx = src.indexOf(REGION_MARKERS.START);
  const endIdx = src.indexOf(REGION_MARKERS.END);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return null;
  const regionStart = startIdx + REGION_MARKERS.START.length;
  return src.slice(regionStart, endIdx);
}

export async function applyBlocksRegionToWorkspace({ Blockly, workspace, regionText }) {
  const region = String(regionText || "");

  // Prefer explicit per-block markers; fall back to top-level statement splitting.
  const marked = parseMarkedBlocks(region);
  if (marked.length > 0) {
    return applyMarkedBlocks({ Blockly, workspace, blocks: marked });
  }

  const statements = await splitJsToTopLevelStatements(stripGeneratedComments(region));
  return applyStatementsAsRaw({ Blockly, workspace, statements });
}

function parseMarkedBlocks(region) {
  const res = [];
  let idx = 0;
  while (idx < region.length) {
    BLOCK_START_RE.lastIndex = idx;
    const m = BLOCK_START_RE.exec(region);
    if (!m) break;
    const id = m[1];
    const bodyStart = BLOCK_START_RE.lastIndex;

    BLOCK_END_RE.lastIndex = bodyStart;
    const endM = BLOCK_END_RE.exec(region);
    if (!endM) break;
    const bodyEnd = endM.index;
    const body = region.slice(bodyStart, bodyEnd);
    res.push({ zbcId: id, code: body.trimEnd() });
    idx = BLOCK_END_RE.lastIndex;
  }
  return res;
}

function applyMarkedBlocks({ Blockly, workspace, blocks }) {
  const existing = workspace.getAllBlocks(false);
  const byId = new Map();
  for (const b of existing) {
    const raw = b?.data;
    if (!raw) continue;
    try {
      const obj = JSON.parse(raw);
      if (obj?.zbcId) byId.set(obj.zbcId, b);
    } catch {
      // ignore
    }
  }

  const used = new Set();
  let created = 0;
  let updated = 0;

  let y = 40;
  for (const item of blocks) {
    used.add(item.zbcId);
    const b = byId.get(item.zbcId);
    if (b && b.type === "zbc_raw_js") {
      const prev = b.getFieldValue("CODE") || "";
      if (prev !== item.code) {
        b.setFieldValue(item.code, "CODE");
        updated++;
      }
      // keep layout mostly stable; do not move existing blocks automatically
      continue;
    }

    const raw = workspace.newBlock("zbc_raw_js");
    raw.data = JSON.stringify({ zbcId: item.zbcId });
    raw.setFieldValue(item.code, "CODE");
    raw.initSvg();
    raw.render();
    raw.moveBy(40, y);
    y += 80;
    created++;
  }

  // If blocks were deleted from the region, do NOT auto-delete workspace blocks.
  // This prevents "fighting" and accidental data loss. Deletion can be a later explicit action.
  return { created, updated, mode: "marked" };
}

function applyStatementsAsRaw({ Blockly, workspace, statements }) {
  if (!statements || statements.length === 0) return { created: 0, updated: 0, mode: "statements" };

  let created = 0;
  let y = 40;
  for (const stmt of statements) {
    const raw = workspace.newBlock("zbc_raw_js");
    getOrCreateZbcId(raw);
    raw.setFieldValue(stmt.trimEnd(), "CODE");
    raw.initSvg();
    raw.render();
    raw.moveBy(40, y);
    y += 80;
    created++;
  }
  return { created, updated: 0, mode: "statements" };
}

function stripGeneratedComments(region) {
  // Keep it simple; we don't try to strip too much yet.
  return String(region || "");
}
