import type {
  SearchFilter,
  SearchFilterField,
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

export function createJQLFromSearchFilters(filters: SearchFilter[]): string {
  const jqlConditions = filters.map((filter) => {
    const fieldMapping = FIELD_MAPPINGS[filter.field as SearchFilterField];
    const jqlField = fieldMapping.jqlField;
    // Use fuzzy search if requested and supported for the field
    const useFuzzy = filter.fuzzy && "supportsFuzzy" in fieldMapping;
    const operator = useFuzzy ? "~" : "=";
    return `${jqlField} ${operator} ${escapeJQLValue(filter.value)}`;
  });

  const jql = jqlConditions.length > 0 ? jqlConditions.join(" AND ") : "*";
  return jql;
}
