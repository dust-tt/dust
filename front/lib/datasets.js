const eqSet = (xs, ys) =>
  xs.size === ys.size && [...xs].every((x) => ys.has(x));

// Returns the dataset keys or throw an error if validation failed.
export function checkDatasetData(rawData) {
  let parsed = null;

  try {
    parsed = JSON.parse(rawData);
  } catch (e) {
    throw new Error("Invalid JSON");
  }

  if (!parsed) {
    throw new Error("Invalid or empty JSON");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Data does not parse as a JSON array");
  }
  if (parsed.length == 0) {
    throw new Error("Data must be a non-empty array");
  }
  let keys = new Set(Object.keys(parsed[0]));
  for (var i in parsed) {
    let k = new Set(Object.keys(parsed[i]));
    if (!eqSet(k, keys)) {
      throw new Error(
        "Keys mismatch between data entries: " +
          Object.keys(parsed[0]) +
          " != " +
          Object.keys(parsed[i])
      );
    }
  }

  return Object.keys(parsed[0]);
}
