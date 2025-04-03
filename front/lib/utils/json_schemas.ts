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
 * Recursively checks if a schema contains a specific sub-schema anywhere in its structure.
 * This function handles nested objects and arrays.
 */
export function containsSubSchema(
  inputSchema: JSONSchema,
  targetSubSchema: JSONSchema
): boolean {
  if (inputSchema === targetSubSchema) {
    return true;
  }

  if (!isJSONSchema(inputSchema)) {
    return false;
  }

  // Check all properties and values in the schema
  for (const value of Object.values(inputSchema)) {
    if (
      value === targetSubSchema ||
      (isJSONSchema(value) && containsSubSchema(value, targetSubSchema))
    ) {
      return true;
    }
  }

  // Check properties in object schemas
  if (inputSchema.properties) {
    for (const propSchema of Object.values(inputSchema.properties)) {
      if (
        isJSONSchema(propSchema) &&
        containsSubSchema(propSchema, targetSubSchema)
      ) {
        return true;
      }
    }
  }

  // Check items in array schemas
  if (inputSchema.type === "array" && inputSchema.items) {
    if (isJSONSchema(inputSchema.items)) {
      // Single schema for all items
      if (containsSubSchema(inputSchema.items, targetSubSchema)) {
        return true;
      }
    } else if (Array.isArray(inputSchema.items)) {
      // Array of schemas for tuple validation
      for (const item of inputSchema.items) {
        if (isJSONSchema(item) && containsSubSchema(item, targetSubSchema)) {
          return true;
        }
      }
    }
  }

  // Note: we don't handle anyOf, allOf, oneOf yet as we cannot disambiguate whether to inject the configuration
  // since we entirely hide the configuration from the agent.

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
