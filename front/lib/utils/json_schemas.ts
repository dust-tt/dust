import type {
  JSONSchema7 as JSONSchema,
  JSONSchema7Definition as JSONSchemaDefinition,
} from "json-schema";

/**
 * Type guard to check if a value is a JSONSchema object
 */
export function isJSONSchema(
  value: JSONSchema | JSONSchemaDefinition | JSONSchemaDefinition[] | boolean
): value is JSONSchema {
  return value !== null && typeof value === "object";
}

/**
 * Recursively checks if any property or nested property of an object has a mimeType matching the target value.
 */
export function containsSubSchema(
  obj: Record<string, any>,
  targetSubSchema: JSONSchema
): boolean {
  for (const value of Object.values(obj)) {
    // Check whether the current value matches the input subSchema
    if (isJSONSchema(value) && value === targetSubSchema) {
      return true;
    }

    // TODO(2025-04-03): check nested objects and arrays.
  }

  return false;
}

/**
 * Finds the schema for a property at a specific path in a JSON schema.
 * Handles both object properties and array items.
 */
export function findSchemaAtPath(
  schema: JSONSchema,
  path: string[]
): JSONSchema | null {
  if (!path.length) {
    return schema;
  }

  let currentSchema: JSONSchema | null = schema;

  for (const segment of path) {
    if (!currentSchema) {
      return null;
    }

    // Navigate through object properties
    if (currentSchema.properties && segment in currentSchema.properties) {
      const propSchema: JSONSchemaDefinition =
        currentSchema.properties[segment];
      if (isJSONSchema(propSchema)) {
        currentSchema = propSchema;
      } else {
        return null; // Not a valid schema
      }
    } else {
      return null; // Path doesn't exist in the schema
    }
  }

  return currentSchema;
}

/**
 * Sets a value at a specific path in a nested object structure.
 * Assumes that intermediate objects already exist.
 */
export function setValueAtPath<T>(
  obj: Record<string, unknown>,
  path: string[],
  value: T
): void {
  if (path.length === 0) {
    return;
  }

  let current: Record<string, unknown> = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    current = current[key] as Record<string, unknown>;
  }

  current[path[path.length - 1]] = value;
}
