import type {
  ConfigurableToolInputType,
  InternalToolInputMimeType,
} from "@dust-tt/client";
import { ConfigurableToolInputJSONSchemas } from "@dust-tt/client";
import Ajv from "ajv";
import type {
  JSONSchema7 as JSONSchema,
  JSONSchema7Definition as JSONSchemaDefinition,
} from "json-schema";
import { isEqual } from "lodash";

/**
 * Type guard to check if a value is a JSONSchema object
 */
export function isJSONSchemaObject(
  value: JSONSchema | JSONSchemaDefinition | JSONSchemaDefinition[] | boolean
): value is JSONSchema {
  return value !== null && typeof value === "object";
}

export function schemaMatchesMimeType(
  schema: JSONSchema,
  mimeType: InternalToolInputMimeType
): boolean {
  if (ConfigurableToolInputJSONSchemas[mimeType]) {
    return schemasAreEqual(schema, ConfigurableToolInputJSONSchemas[mimeType]);
  }
  // If the mime type is not in the ConfigurableToolInputJSONSchemas, it is a flexible mime type.
  // We only check that the schema has a mimeType property with the correct value.
  const mimeTypeProperty = schema.properties?.mimeType;
  if (mimeTypeProperty && isJSONSchemaObject(mimeTypeProperty)) {
    return (
      mimeTypeProperty.type === "string" && mimeTypeProperty.const === mimeType
    );
  }
  return false;
}

/**
 * Compares two JSON schemas for equality, only checking the properties, items and required fields.
 * In particular, it ignores the $schema field.
 */
function schemasAreEqual(schemaA: JSONSchema, schemaB: JSONSchema): boolean {
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
  mimeType: InternalToolInputMimeType
): string[] {
  const matchingKeys: string[] = [];

  if (!isJSONSchemaObject(inputSchema)) {
    return matchingKeys;
  }

  // Check properties in object schemas
  if (inputSchema.properties) {
    for (const [key, propSchema] of Object.entries(inputSchema.properties)) {
      if (isJSONSchemaObject(propSchema)) {
        // Check if this property's schema matches the target
        if (schemaMatchesMimeType(propSchema, mimeType)) {
          matchingKeys.push(key);
        }

        // Following references within the main schema.
        // zodToJsonSchema generates references if the same subSchema is repeated.
        if (propSchema.$ref) {
          const refSchema = followInternalRef(inputSchema, propSchema.$ref);
          if (refSchema && schemaMatchesMimeType(refSchema, mimeType)) {
            matchingKeys.push(key);
          }
        }

        // Recursively check this property's schema
        const nestedMatches = findMatchingSchemaKeys(propSchema, mimeType);
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
      const itemMatches = findMatchingSchemaKeys(inputSchema.items, mimeType);
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
          const itemMatches = findMatchingSchemaKeys(item, mimeType);
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

    if (isJSONSchemaObject(value) && schemaMatchesMimeType(value, mimeType)) {
      matchingKeys.push(key);
    } else if (isJSONSchemaObject(value)) {
      const nestedMatches = findMatchingSchemaKeys(value, mimeType);
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

export function isValidJsonSchema(value: string | null | undefined): {
  isValid: boolean;
  error?: string;
} {
  if (!value) {
    return { isValid: true };
  }

  try {
    const parsed = JSON.parse(value);
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
