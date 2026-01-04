// Shared type guard utilities for JSON parsing

type PropertyChecker = {
  hasString: (key: string) => boolean;
  hasNumber: (key: string) => boolean;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Creates property checkers for validating object shapes from unknown JSON
export function createPropertyChecker(data: unknown): PropertyChecker | null {
  if (!isPlainObject(data)) {
    return null;
  }

  return {
    hasString: (key: string) => key in data && typeof data[key] === "string",
    hasNumber: (key: string) => key in data && typeof data[key] === "number",
  };
}
