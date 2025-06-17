import Ajv from "ajv";
import type {
  JSONSchema7 as JSONSchema,
  JSONSchema7Definition as JSONSchemaDefinition,
} from "json-schema";
import { isEqual } from "lodash";

import type { ConfigurableToolInputType } from "@app/lib/actions/mcp_internal_actions/input_schemas";

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
    isJSONSchemaObject(schemaA.items) &&
    isJSONSchemaObject(schemaB.items) &&
    !areSchemasEqual(schemaA.items, schemaB.items)
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
      .filter((key) => key != "properties")
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
  path: string[],
  value: ConfigurableToolInputType | string | number | boolean
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
    ajv.compile(parsed); // Throws an error if the schema is invalid
    return { isValid: true };
  } catch (e) {
    return {
      isValid: false,
      error: e instanceof Error ? e.message : "Invalid JSON schema",
    };
  }
}
