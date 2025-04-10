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
  value: JSONSchema | JSONSchemaDefinition | JSONSchemaDefinition[] | boolean
): value is JSONSchema {
  return value !== null && typeof value === "object";
}

/**
 * Compares two JSON schemas for equality, only checking the properties, items and required fields.
 * In particular, it ignores the $schema field.
 */
export function schemasAreEqual(
  schemaA: JSONSchema,
  schemaB: JSONSchema
): boolean {
  if (schemaA.type !== schemaB.type) {
    return false;
  }
  if (!isEqual(schemaA.required, schemaB.required)) {
    return false;
  }
  if (!isEqual(schemaA.items, schemaB.items)) {
    return false;
  }
  return isEqual(schemaA.properties, schemaB.properties);
}

/**
 * Recursively finds all property keys in a schema that match a specific sub-schema.
 * This function handles nested objects and arrays.
 * @returns An array of property keys that match the schema comparison. Empty array if no matches found.
 */
export function findMatchingSchemaKeys(
  inputSchema: JSONSchema,
  targetSubSchema: JSONSchema
): string[] {
  const matchingKeys: string[] = [];

  if (!isJSONSchemaObject(inputSchema)) {
    return matchingKeys;
  }

  // Direct schema equality check
  if (schemasAreEqual(inputSchema, targetSubSchema)) {
    // For the root schema, we use an empty string as the key
    matchingKeys.push("");
    return matchingKeys;
  }

  // Check properties in object schemas
  if (inputSchema.properties) {
    for (const [key, propSchema] of Object.entries(inputSchema.properties)) {
      if (isJSONSchemaObject(propSchema)) {
        // Check if this property's schema matches the target
        if (schemasAreEqual(propSchema, targetSubSchema)) {
          matchingKeys.push(key);
        }

        // Recursively check this property's schema
        const nestedMatches = findMatchingSchemaKeys(
          propSchema,
          targetSubSchema
        );
        // For nested matches, prefix with the current property key
        for (const match of nestedMatches) {
          if (match !== "") {
            // Skip the empty string from direct matches
            matchingKeys.push(`${key}.${match}`);
          }
        }
      }
    }
  }

  // Check items in array schemas
  if (inputSchema.type === "array" && inputSchema.items) {
    if (isJSONSchemaObject(inputSchema.items)) {
      // Single schema for all items
      const itemMatches = findMatchingSchemaKeys(
        inputSchema.items,
        targetSubSchema
      );
      // For array items, we use the 'items' key as a prefix
      for (const match of itemMatches) {
        if (match !== "") {
          matchingKeys.push(`items.${match}`);
        } else {
          matchingKeys.push("items");
        }
      }
    } else if (Array.isArray(inputSchema.items)) {
      // Array of schemas for tuple validation
      for (let i = 0; i < inputSchema.items.length; i++) {
        const item = inputSchema.items[i];
        if (isJSONSchemaObject(item)) {
          const itemMatches = findMatchingSchemaKeys(item, targetSubSchema);
          // For tuple items, we use the index as part of the key
          for (const match of itemMatches) {
            if (match !== "") {
              matchingKeys.push(`items[${i}].${match}`);
            } else {
              matchingKeys.push(`items[${i}]`);
            }
          }
        }
      }
    }
  }

  // Check all other properties and values in the schema
  for (const [key, value] of Object.entries(inputSchema)) {
    // Skip properties and items as they are handled separately above
    if (
      key === "properties" ||
      (key === "items" && inputSchema.type === "array")
    ) {
      continue;
    }

    if (
      value === targetSubSchema ||
      (isJSONSchemaObject(value) && schemasAreEqual(value, targetSubSchema))
    ) {
      matchingKeys.push(key);
    } else if (isJSONSchemaObject(value)) {
      const nestedMatches = findMatchingSchemaKeys(value, targetSubSchema);
      for (const match of nestedMatches) {
        if (match !== "") {
          matchingKeys.push(`${key}.${match}`);
        } else {
          matchingKeys.push(key);
        }
      }
    }
  }

  // Note: we don't handle anyOf, allOf, oneOf yet as we cannot disambiguate whether to inject the configuration
  // since we entirely hide the configuration from the agent.

  return matchingKeys;
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
  value: ConfigurableToolInputType
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
