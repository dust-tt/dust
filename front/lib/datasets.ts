function areSetsEqual(a: Set<any>, b: Set<any>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const item of Array.from(a.values())) {
    if (!b.has(item)) {
      return false;
    }
  }
  return true;
}

export function checkDatasetData(data: Array<object>): string[] {
  if (!Array.isArray(data)) {
    throw new Error("data must be an array");
  }
  if (data.length === 0) {
    throw new Error("Data must be a non-empty array");
  }
  const schemaKeys: Set<string> = new Set(Object.keys(data[0]));
  for (const row of data.slice(1)) {
    const rowKeys = Object.keys(row);
    if (!areSetsEqual(schemaKeys, new Set(rowKeys))) {
      throw new Error(
        "Keys mismatch between data entries: " +
          `${Object.keys(data[0])} != ${Object.keys(row)}`
      );
    }
  }

  return Object.keys(data[0]);
}
