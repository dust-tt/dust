export function buildQuery(
  params: Record<string, unknown>
): Record<string, string> | undefined {
  const query: Record<string, string> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return;
      }
      query[key] = value.join(",");
      return;
    }
    if (typeof value === "boolean") {
      query[key] = value ? "true" : "false";
      return;
    }
    query[key] = typeof value === "string" ? value : String(value);
  });

  return Object.keys(query).length ? query : undefined;
}
