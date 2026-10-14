export function editorText(text) {
  return text.replace(/\r\n?/g, "\n");
}

export function savedText(original, edited) {
  const before = editorText(original);
  if (before === edited) return original;
  let start = 0;
  while (start < before.length && start < edited.length && before[start] === edited[start]) start++;
  let end = before.length;
  let newEnd = edited.length;
  while (end > start && newEnd > start && before[end - 1] === edited[newEnd - 1]) { end--; newEnd--; }
  function originalOffset(offset) {
    let raw = 0;
    for (let index = 0; index < offset; index++) {
      if (original[raw] === "\r" && original[raw + 1] === "\n") raw++;
      raw++;
    }
    return raw;
  }
  const newline = original.match(/\r\n|\r|\n/)?.[0] || "\n";
  return original.slice(0, originalOffset(start)) + edited.slice(start, newEnd).replace(/\n/g, newline) + original.slice(originalOffset(end));
}
