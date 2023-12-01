import { DatasetEntry, DatasetSchema } from "@dust-tt/types";

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

export function checkDatasetData({
  data,
  schema,
}: {
  data?: Array<object> | null;
  schema?: DatasetSchema;
}): string[] {
  if (!data) {
    throw new Error("data must be defined");
  }
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
  if (schema) {
    const schemaKeys = new Set(schema.map((s) => s.key));
    if (!areSetsEqual(schemaKeys, new Set(Object.keys(data[0])))) {
      throw new Error(
        "Keys mismatch between schema and data entries: " +
          `${schemaKeys} != ${Object.keys(data[0])}`
      );
    }
  }

  return Object.keys(data[0]);
}

export function getDatasetTypes(
  datasetKeys: string[],
  entry: DatasetEntry
): ("string" | "number" | "boolean" | "json")[] {
  return datasetKeys.map((key) => getValueType(entry[key]));
}

export function getValueType(
  value: any
): "string" | "number" | "boolean" | "json" {
  const type = typeof value;

  if (type === "object") {
    return "json";
  }

  let parsed = null;
  try {
    parsed = JSON.parse(value);
  } catch (e) {
    return "string";
  }

  const parsedType = typeof parsed;
  switch (parsedType) {
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "object":
      return "json";
  }

  return "string";
}
