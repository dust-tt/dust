import { usePodDatabaseSchema } from "@app/lib/swr/pod_databases";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ContentMessage,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Spinner,
} from "@dust-tt/sparkle";

interface PodDatabaseSchemaSheetProps {
  owner: LightWorkspaceType;
  podId: string;
  database: string | null;
  onClose: () => void;
}

/**
 * The drizzle schema regenerated from the live database. SQLite does not store column modes, so
 * this carries storage types only — the authored `databases/{db}.db.ts` stays the source of truth.
 */
export function PodDatabaseSchemaSheet({
  owner,
  podId,
  database,
  onClose,
}: PodDatabaseSchemaSheetProps) {
  const { schema, isPodDatabaseSchemaLoading, podDatabaseSchemaError } =
    usePodDatabaseSchema({
      owner,
      podId,
      database,
      disabled: database === null,
    });

  return (
    <Sheet open={database !== null} onOpenChange={onClose}>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>{`Schema — ${database ?? ""}`}</SheetTitle>
          <SheetDescription>
            Regenerated from the live database. Storage types only; the pod's
            schema file remains the source of truth.
          </SheetDescription>
        </SheetHeader>
        <SheetContainer>
          {isPodDatabaseSchemaLoading && <Spinner />}
          {podDatabaseSchemaError && (
            <ContentMessage variant="warning" title="Could not read the schema">
              {podDatabaseSchemaError}
            </ContentMessage>
          )}
          {schema && (
            <pre className="overflow-auto rounded-xl bg-muted-background p-4 font-mono text-xs">
              {schema}
            </pre>
          )}
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}
