import Ajv from "ajv";
import addFormats from "ajv-formats";
import type {
  JSONSchema7 as JSONSchema,
  JSONSchema7Definition as JSONSchemaDefinition,
} from "json-schema";
import isEqual from "lodash/isEqual";

import type { ConfigurableToolInputType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import logger from "@app/logger/logger";

/**
 * Type guard to check if a value is a JSONSchema object
 */
export function isJSONSchemaObject(
  value:
    | JSONSchema
    | JSONSchemaDefinition
    | JSONSchemaDefinition[]
    | boolean
    | undefined
): value is JSONSchema {
  return !!value && typeof value === "object";
}

/**
 * Compares two JSON schemas for equality, only checking the properties, items and required fields.
 * In particular, it ignores the $schema field.
 */
export function areSchemasEqual(
  schemaA: JSONSchema,
  schemaB: JSONSchema
): boolean {
  if (schemaA.type !== schemaB.type) {
    return false;
  }

  if (!isEqual(schemaA.required, schemaB.required)) {
    return false;
  }

  // Checking for arrays with a single schema for all items.
  if (
    schemaA.type === "array" &&
    // If one is an object and not the other, then they are not equal.
    (isJSONSchemaObject(schemaA.items) !== isJSONSchemaObject(schemaB.items) ||
      // If both are objects, we compare the schemas recursively.
      (isJSONSchemaObject(schemaA.items) &&
        isJSONSchemaObject(schemaB.items) &&
        !areSchemasEqual(schemaA.items, schemaB.items)))
  ) {
    return false;
  }

  if (!isEqual(schemaA.anyOf, schemaB.anyOf)) {
    return false;
  }

  return isEqual(schemaA.properties, schemaB.properties);
}

/**
 * Finds the schema for a property given a $ref to it.
 */
export function followInternalRef(
  schema: JSONSchema,
  ref: string
): JSONSchema | null {
  return findSchemaAtPath(
    schema,
    ref
      .replace("#/", "")
      .split("/")
      .filter((key) => key !== "properties")
  );
}

/**
 * Finds the schema for a property at a specific path in a JSON schema.
 * Handles both object properties and array items.
 */
export function findSchemaAtPath(
  schema: JSONSchema,
  path: string[]
): JSONSchema | null {
  if (path.length === 0) {
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
      if (isJSONSchemaObject(propSchema)) {
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
export function setValueAtPath(
  obj: Record<string, unknown>,
  path: (string | number)[],
  value: ConfigurableToolInputType | string | number | boolean
): void {
  if (path.length === 0) {
    return;
  }

  let current: Record<string, unknown> = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    current = current[key] as Record<string, unknown>;
    if (!current) {
      logger.error(
        {
          path,
          obj,
        },
        "Invalid path in setValueAtPath."
      );
      throw new Error("Invalid path in setValueAtPath.");
    }
  }

  current[path[path.length - 1]] = value;
}

/**
 * Gets a value at a specific path in a nested object structure.
 * Returns undefined if the path doesn't exist or any intermediate object is missing.
 */
export function getValueAtPath(
  obj: Record<string, unknown>,
  path: (string | number)[]
): unknown {
  if (path.length === 0) {
    return obj;
  }

  let current: unknown = obj;
  for (const key of path) {
    if (current && typeof current === "object") {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Validates a generic JSON schema as per the JSON schema specification.
 * Less strict than the JsonSchemaSchema zod schema.
 */
export function validateJsonSchema(value: object | string | null | undefined): {
  isValid: boolean;
  error?: string;
} {
  if (!value) {
    return { isValid: true };
  }

  try {
    const parsed = typeof value !== "object" ? JSON.parse(value) : value;
    const ajv = new Ajv();
    addFormats(ajv); // Adds "date", "date-time", "time", "email" and many other common formats.
    ajv.compile(parsed); // Throws an error if the schema is invalid
    return { isValid: true };
  } catch (e) {
    return {
      isValid: false,
      error: e instanceof Error ? e.message : "Invalid JSON schema",
    };
  }
}

export function iterateOverSchemaPropertiesRecursive(
  inputSchema: JSONSchema,
  callback: (fullPath: (string | number)[], propSchema: JSONSchema) => boolean,
  path: (string | number)[] = []
): void {
  if (!isJSONSchemaObject(inputSchema)) {
    return;
  }

  // Check properties in object schemas
  if (inputSchema.properties) {
    for (const [key, propSchema] of Object.entries(inputSchema.properties)) {
      const currentPath = [...path, key];

      if (isJSONSchemaObject(propSchema)) {
        // Call the callback with the full path and property schema
        const shouldContinue = callback(currentPath, propSchema);
        if (shouldContinue) {
          // Recursively check this property's schema
          iterateOverSchemaPropertiesRecursive(
            propSchema,
            callback,
            currentPath
          );
        }
      }
    }
  }

  // Check items in array schemas
  if (inputSchema.type === "array" && inputSchema.items) {
    if (isJSONSchemaObject(inputSchema.items)) {
      // Single schema for all items
      iterateOverSchemaPropertiesRecursive(inputSchema.items, callback, [
        ...path,
        "items",
      ]);
    } else if (Array.isArray(inputSchema.items)) {
      // Array of schemas for tuple validation
      for (let i = 0; i < inputSchema.items.length; i++) {
        const item = inputSchema.items[i];
        if (isJSONSchemaObject(item)) {
          iterateOverSchemaPropertiesRecursive(item, callback, [
            ...path,
            "items",
            i,
          ]);
        }
      }
    }
  }
}
