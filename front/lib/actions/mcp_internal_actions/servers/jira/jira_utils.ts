import { markdownToAdf } from "marklassian";

import type {
  SearchFilter,
  SearchFilterField,
  SortDirection,
} from "@app/lib/actions/mcp_internal_actions/servers/jira/types";
import { FIELD_MAPPINGS } from "@app/lib/actions/mcp_internal_actions/servers/jira/types";

// Helper function to escape JQL values that contain spaces or special characters
export const escapeJQLValue = (value: string): string => {
  // JQL reserved characters per official Atlassian docs: space, +, ., ,, ;, ?, |, *, /, %, ^, $, #, @, [, ]
  const hasSpecialChars = /[\s"'\\/@+.,;?|*%^$#[\]]/.test(value);

  // JQL reserved words that need quoting
  const isReservedWord =
    /^(and|or|not|in|is|was|from|to|on|by|during|before|after|empty|null|order|asc|desc|changed|was|in|not|to|from|by|before|after|on|during)$/i.test(
      value
    );

  if (hasSpecialChars || isReservedWord) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }

  return value;
};

export function createJQLFromSearchFilters(
  filters: SearchFilter[],
  sortBy?: { field: SearchFilterField; direction: SortDirection }
): string {
  const jqlConditions = filters.map((filter) => {
    const fieldMapping = FIELD_MAPPINGS[filter.field as SearchFilterField];

    let jqlField: string;

    if (
      fieldMapping &&
      "isCustomField" in fieldMapping &&
      fieldMapping.isCustomField
    ) {
      // For custom fields, use the customFieldName parameter
      // Zod validation ensures customFieldName is present when field is 'customField'
      jqlField = `"${filter.customFieldName}"`;
    } else {
      jqlField = fieldMapping.jqlField;
    }

    // Determine the operator to use
    let operator: string;
    if (
      filter.operator &&
      fieldMapping &&
      "supportsOperators" in fieldMapping &&
      fieldMapping.supportsOperators
    ) {
      // Use the provided operator for fields that support it (like dueDate)
      operator = filter.operator;
    } else if (filter.fuzzy && "supportsFuzzy" in fieldMapping) {
      // Use fuzzy search if requested and supported for the field
      operator = "~";
    } else {
      // Default to exact match
      operator = "=";
    }

    return `${jqlField} ${operator} ${escapeJQLValue(filter.value)}`;
  });

  let jql = jqlConditions.length > 0 ? jqlConditions.join(" AND ") : "*";

  // Add ORDER BY clause if sorting is specified
  if (sortBy) {
    const fieldMapping = FIELD_MAPPINGS[sortBy.field as SearchFilterField];
    let sortField: string;

    if (
      fieldMapping &&
      "isCustomField" in fieldMapping &&
      fieldMapping.isCustomField
    ) {
      // For custom fields, we'd need the custom field name, but for now just use the field name
      sortField = sortBy.field;
    } else {
      sortField = fieldMapping.jqlField;
    }

    jql += ` ORDER BY ${sortField} ${sortBy.direction}`;
  }

  return jql;
}

/**
 * Determines if a field should be converted to ADF format.
 *
 * Based on Atlassian documentation: "The Atlassian Document Format (ADF) represents
 * rich text stored in Atlassian products. For example, in Jira Cloud platform,
 * the text in issue comments and in textarea custom fields is stored as ADF."
 *
 * @param fieldKey - The field key (e.g., "customfield_10033")
 * @param fieldValue - The field value to be processed
 * @param fieldMetadata - Optional field metadata from Jira API containing schema information
 * @returns true if the field should be converted to ADF, false otherwise
 */
export function shouldConvertToADF(
  fieldKey: string,
  fieldValue: unknown,
  fieldMetadata?: {
    schema?: {
      type?: string;
      custom?: string;
    };
  }
): boolean {
  // Only process string values - if it's already an object (like ADF), leave it alone
  if (typeof fieldValue !== "string") {
    return false;
  }

  // Description field should always be converted to ADF (it's a rich text field)
  if (fieldKey === "description") {
    return true;
  }

  // Only custom fields can be converted to ADF (specifically textarea custom fields)
  if (!fieldKey.startsWith("customfield_")) {
    return false;
  }

  if (fieldMetadata?.schema?.custom) {
    const customFieldType = fieldMetadata.schema.custom;

    // Only textarea custom fields require ADF according to Atlassian docs
    return customFieldType.includes("textarea");
  }

  return false;
}

export function processFieldsForJira(
  fields: Record<string, unknown>,
  fieldsMetadata?: Record<
    string,
    {
      schema?: { type?: string; custom?: string };
    }
  >
): Record<string, unknown> {
  const processedFields = { ...fields };

  for (const [fieldKey, fieldValue] of Object.entries(processedFields)) {
    const fieldMetadata = fieldsMetadata?.[fieldKey];

    if (shouldConvertToADF(fieldKey, fieldValue, fieldMetadata)) {
      processedFields[fieldKey] = markdownToAdf(fieldValue as string);
    }
  }

  return processedFields;
}
