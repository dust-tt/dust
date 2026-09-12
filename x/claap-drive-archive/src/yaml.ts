function needsQuotes(value: string): boolean {
  return (
    value === "" ||
    value === "true" ||
    value === "false" ||
    value === "null" ||
    /[:#\n\r"'{}[\]&*?|<>=!%`,]/.test(value) ||
    /\s/.test(value) ||
    /^-/.test(value)
  );
}

export function yamlScalar(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  if (needsQuotes(value)) {
    return JSON.stringify(value);
  }
  return value;
}

export function yamlBlock(lines: string[]): string {
  return `${lines.join("\n")}\n`;
}
