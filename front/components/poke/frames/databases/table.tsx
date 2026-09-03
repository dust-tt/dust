import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import type { PokeFrameDatabase } from "@app/lib/api/poke/frames";
import { formatFileSize } from "@app/lib/utils";
import {
  usePokeFrameDatabaseSchema,
  usePokeFrameDatabases,
} from "@app/poke/swr/frames";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { LightWorkspaceType } from "@app/types/user";
import {
  CodeBlock,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ContentMessageInline,
  Separator,
  Spinner,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface FrameDatabaseDataTableProps {
  frameId: string;
  owner: LightWorkspaceType;
}

export function FrameDatabaseDataTable({
  frameId,
  owner,
}: FrameDatabaseDataTableProps) {
  const useDatabasesForFrame = (props: PokeConditionalFetchProps) =>
    usePokeFrameDatabases({ ...props, frameId });

  return (
    <PokeDataTableConditionalFetch
      buttonText="List live databases (wakes the sandbox)"
      header="Databases"
      owner={owner}
      useSWRHook={useDatabasesForFrame}
    >
      {(items) =>
        items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This Frame has no live databases.
          </p>
        ) : (
          <div className="flex flex-col">
            {items.map((database, idx) => (
              <div key={database.name}>
                <DatabaseRow
                  database={database}
                  frameId={frameId}
                  owner={owner}
                />
                {idx < items.length - 1 && <Separator />}
              </div>
            ))}
          </div>
        )
      }
    </PokeDataTableConditionalFetch>
  );
}

interface DatabaseRowProps {
  database: PokeFrameDatabase;
  frameId: string;
  owner: LightWorkspaceType;
}

function DatabaseRow({ database, frameId, owner }: DatabaseRowProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Regenerating the schema runs a command in the sandbox, so it waits for the row to be opened
  // rather than firing for every database in the list.
  const { schema, isLoading, isError } = usePokeFrameDatabaseSchema({
    owner,
    frameId,
    database: database.name,
    disabled: !isOpen,
  });

  return (
    <Collapsible defaultOpen={false} onOpenChange={setIsOpen}>
      <CollapsibleTrigger>
        <div className="my-2 flex w-full items-center justify-between gap-4">
          <span className="font-mono text-sm">{database.name}</span>
          <span className="text-xs text-muted-foreground">
            {formatFileSize(database.sizeBytes)}
          </span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-2 pb-2 pl-4">
          {isError ? (
            <ContentMessageInline variant="warning">
              Unable to read this database's schema.
            </ContentMessageInline>
          ) : isLoading ? (
            <div className="flex items-center gap-2 py-1">
              <Spinner size="sm" />
              <span className="text-sm text-muted-foreground">
                Regenerating schema...
              </span>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Regenerated from the live database. SQLite does not store column
                modes, so this carries storage types only — the authored{" "}
                <code>databases/{database.name}.db.ts</code> stays the source of
                truth.
              </p>
              <div className="max-h-64 overflow-auto">
                <CodeBlock wrapLongLines className="language-ts">
                  {schema ?? ""}
                </CodeBlock>
              </div>
            </>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
