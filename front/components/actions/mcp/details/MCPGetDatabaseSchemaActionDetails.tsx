import {
  CodeBlock,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  TableIcon,
} from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import type {
  DatabaseSchemaResourceType,
  ExampleRowsResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  isDatabaseSchemaResourceType,
  isExampleRowsResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";

export function MCPGetDatabaseSchemaActionDetails({
  toolOutput,
  viewType,
}: ToolExecutionDetailsProps) {
  // Extract different types of outputs
  const schemaBlocks =
    toolOutput?.filter(isDatabaseSchemaResourceType).map((o) => o.resource) ??
    [];
  const exampleRowsBlocks =
    toolOutput?.filter(isExampleRowsResourceType).map((o) => o.resource) ?? [];

  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={
        viewType === "conversation"
          ? "Getting database schema"
          : "Get database schema"
      }
      visual={TableIcon}
    >
      {viewType === "sidebar" && (
        <div className="flex flex-col gap-4 pl-6 pt-4">
          <>
            <DatabaseSchemaSection schemas={schemaBlocks} />
            {exampleRowsBlocks.length > 0 && (
              <ExampleRowsSection examples={exampleRowsBlocks} />
            )}
          </>
        </div>
      )}
    </ActionDetailsWrapper>
  );
}

function DatabaseSchemaSection({
  schemas,
}: {
  schemas: DatabaseSchemaResourceType[];
}) {
  return (
    <Collapsible defaultOpen={false}>
      <CollapsibleTrigger>
        <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
          Database Schema
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="py-2">
          {schemas.map((schema, idx) => (
            <CodeBlock
              key={idx}
              className="language-sql max-h-96 overflow-y-auto"
              wrapLongLines={true}
            >
              {schema.text}
            </CodeBlock>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ExampleRowsSection({
  examples,
}: {
  examples: ExampleRowsResourceType[];
}) {
  return (
    <Collapsible defaultOpen={false}>
      <CollapsibleTrigger>
        <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
          Sample Data
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="py-2">
          {examples.map((example, idx) => (
            <CodeBlock
              key={idx}
              className="language-csv max-h-60 overflow-y-auto"
              wrapLongLines={true}
            >
              {example.text}
            </CodeBlock>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
