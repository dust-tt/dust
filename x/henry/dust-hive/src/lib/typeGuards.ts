// Shared type guard utilities for JSON parsing

type PropertyChecker = {
  hasString: (key: string) => boolean;
  hasNumber: (key: string) => boolean;
};

// Creates property checkers for validating object shapes from unknown JSON
export function createPropertyChecker(data: unknown): PropertyChecker | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }

  const obj = data as Record<string, unknown>;

  return {
    hasString: (key: string) => key in obj && typeof obj[key] === "string",
    hasNumber: (key: string) => key in obj && typeof obj[key] === "number",
  };
}
