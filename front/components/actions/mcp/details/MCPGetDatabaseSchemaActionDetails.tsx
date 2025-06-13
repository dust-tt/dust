import { CodeBlock, CollapsibleComponent, TableIcon } from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import type { MCPActionType } from "@app/lib/actions/mcp";
import type {
  DatabaseSchemaResourceType,
  ExampleRowsResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  isDatabaseSchemaResourceType,
  isExampleRowsResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";

export function MCPGetDatabaseSchemaActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<MCPActionType>) {
  const { output } = action;

  // Extract different types of outputs
  const schemaBlocks =
    output?.filter(isDatabaseSchemaResourceType).map((o) => o.resource) ?? [];
  const exampleRowsBlocks =
    output?.filter(isExampleRowsResourceType).map((o) => o.resource) ?? [];

  return (
    <ActionDetailsWrapper
      actionName="Get database schema"
      defaultOpen={defaultOpen}
      visual={TableIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <>
          <DatabaseSchemaSection schemas={schemaBlocks} />
          {exampleRowsBlocks.length > 0 && (
            <ExampleRowsSection examples={exampleRowsBlocks} />
          )}
        </>
      </div>
    </ActionDetailsWrapper>
  );
}

function DatabaseSchemaSection({
  schemas,
}: {
  schemas: DatabaseSchemaResourceType[];
}) {
  return (
    <CollapsibleComponent
      rootProps={{ defaultOpen: true }}
      triggerChildren={
        <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
          Database Schema
        </span>
      }
      contentChildren={
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
      }
    />
  );
}

function ExampleRowsSection({
  examples,
}: {
  examples: ExampleRowsResourceType[];
}) {
  return (
    <CollapsibleComponent
      rootProps={{ defaultOpen: false }}
      triggerChildren={
        <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
          Sample Data
        </span>
      }
      contentChildren={
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
      }
    />
  );
}
