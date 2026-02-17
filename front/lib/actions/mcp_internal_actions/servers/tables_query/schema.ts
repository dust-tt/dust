import type {
  DatabaseSchemaResourceType,
  ExampleRowsResourceType,
  QueryWritingInstructionsResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  DUST_SQLITE_INSTRUCTIONS,
  getGenericDialectInstructions,
  SALESFORCE_INSTRUCTIONS,
} from "@app/lib/actions/mcp_internal_actions/servers/tables_query/dialect_instructions";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

export function getSchemaContent(schemas: { dbml: string }[]): {
  type: "resource";
  resource: DatabaseSchemaResourceType;
}[] {
  return [
    {
      type: "resource",
      resource: {
        text: schemas.map((s) => s.dbml).join("\n\n"),
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATABASE_SCHEMA,
        uri: "",
      },
    },
  ];
}

export function getQueryWritingInstructionsContent(
  dialect: string
): { type: "resource"; resource: QueryWritingInstructionsResourceType }[] {
  const instructions = (() => {
    if (dialect === "dust_sqlite") {
      return DUST_SQLITE_INSTRUCTIONS;
    } else if (dialect === "salesforce_soql") {
      return SALESFORCE_INSTRUCTIONS;
    } else {
      return getGenericDialectInstructions(dialect);
    }
  })();

  return [
    {
      type: "resource",
      resource: {
        text: instructions,
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.QUERY_WRITING_INSTRUCTIONS,
        uri: "",
      },
    },
  ];
}

export function getDatabaseExampleRowsContent(
  schemas: {
    dbml: string;
    head?: Array<Record<string, any>>;
  }[]
): {
  type: "resource";
  resource: ExampleRowsResourceType;
}[] {
  const heads = schemas
    .map((item) => {
      const h = item.head;

      if (!h || !h.length) {
        return "";
      }

      const jsonArray = h.map((r) => r.value);
      if (jsonArray.length === 0) {
        return "";
      }

      const tableName = item.dbml.match(/Table\s+([\w-]+)/)?.[1];
      if (!tableName) {
        return "";
      }

      // Extract headers
      const headers = Object.keys(jsonArray[0]);
      const csvRows = jsonArray.map((row) =>
        headers
          .map((fieldName) => {
            let field = row[fieldName];
            if (field === undefined || field === null) {
              return "";
            }

            // Escape double quotes with another double quote.
            if (typeof field === "string") {
              field = field.replace(/"/g, '""');
              field = field.substring(0, 128);
            }

            // Escape fields that contain commas, double quotes, or linebreaks.
            if (field.toString().match(/(,|"|\n)/)) {
              field = `"${field}"`;
            }

            return field;
          })
          .join(",")
      );

      const csv = [headers.join(","), ...csvRows].join("\n");
      const rendered = `TABLE NAME:\n${tableName}\n\nEXAMPLE ROWS:\n${csv}`;
      return rendered;
    })
    .filter((x) => !!x.length);

  if (!heads.length) {
    return [];
  }

  const text = heads.join("\n----------\n");
  return [
    {
      type: "resource",
      resource: {
        text,
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.EXAMPLE_ROWS,
        uri: "",
      },
    },
  ];
}
