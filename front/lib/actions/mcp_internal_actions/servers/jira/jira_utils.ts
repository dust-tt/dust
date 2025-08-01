import type {
  SearchFilter,
  SearchFilterField,
  SortDirection,
} from "@app/lib/actions/mcp_internal_actions/servers/jira/types";
import { FIELD_MAPPINGS } from "@app/lib/actions/mcp_internal_actions/servers/jira/types";

// Helper function to escape JQL values that contain spaces or special characters
export const escapeJQLValue = (value: string): string => {
  // If the value contains spaces, special characters, or reserved words, wrap it in quotes
  if (
    /[\s"'\\]/.test(value) ||
    /^(and|or|not|in|is|was|from|to|on|by|during|before|after|empty|null|order|asc|desc|changed|was|in|not|to|from|by|before|after|on|during)$/i.test(
      value
    )
  ) {
    // Escape any existing quotes in the value
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
