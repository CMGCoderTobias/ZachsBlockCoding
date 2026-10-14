export function getOrCreateZbcId(block) {
  const existing = readZbcId(block);
  if (existing) return existing;

  const zbcId = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `zbc_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  writeZbcId(block, zbcId);
  return zbcId;
}

export function readZbcId(block) {
  const raw = block?.data;
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    return obj?.zbcId || null;
  } catch {
    return null;
  }
}

export function writeZbcId(block, zbcId) {
  const raw = block?.data;
  let obj = {};
  if (raw) {
    try {
      obj = JSON.parse(raw) || {};
    } catch {
      obj = {};
    }
  }
  obj.zbcId = zbcId;
  block.data = JSON.stringify(obj);
}

