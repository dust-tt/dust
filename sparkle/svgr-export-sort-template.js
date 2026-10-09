// Orders the export lines of a generated index by module path, comparing letter by letter
// with `A < a < B < b`, the order the indexes were committed with. oxfmt does not sort
// exports, so without this every regenerate would reorder them.
function rank(char) {
  const lower = char.toLowerCase();
  if (lower === char.toUpperCase()) {
    return char.charCodeAt(0);
  }
  return lower.charCodeAt(0) * 2 + (char === lower ? 1 : 0);
}

function compareModulePaths(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const difference = rank(a[i]) - rank(b[i]);
    if (difference !== 0) {
      return difference;
    }
  }
  return a.length - b.length;
}

function sortExports(exports) {
  return [...exports]
    .sort((a, b) => compareModulePaths(a.from, b.from))
    .map(({ statement }) => statement);
}

module.exports = { sortExports };
