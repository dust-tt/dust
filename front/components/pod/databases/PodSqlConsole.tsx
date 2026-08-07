import { PodDatabaseRowsTable } from "@app/components/pod/databases/PodDatabaseRowsTable";
import type { PodDatabaseQueryOutcome } from "@app/lib/swr/pod_databases";
import { useRunPodDatabaseQuery } from "@app/lib/swr/pod_databases";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, ContentMessage, Play, TextArea } from "@dust-tt/sparkle";
import type { KeyboardEvent } from "react";
import { useState } from "react";

interface PodSqlConsoleProps {
  owner: LightWorkspaceType;
  podId: string;
  database: string;
  /** Called after a statement that reported affected rows, so browsed data can be refreshed. */
  onDataChanged: () => void;
}

/**
 * One statement at a time, which is all the runner accepts: SELECT and DML run, DDL is refused
 * (the schema only ever moves through `dsbx db reconcile`).
 */
export function PodSqlConsole({
  owner,
  podId,
  database,
  onDataChanged,
}: PodSqlConsoleProps) {
  const [sql, setSql] = useState("");
  const [outcome, setOutcome] = useState<PodDatabaseQueryOutcome | null>(null);
  const { runQuery, isRunningQuery } = useRunPodDatabaseQuery({ owner, podId });

  const onRun = async () => {
    if (sql.trim().length === 0 || isRunningQuery) {
      return;
    }
    const result = await runQuery(database, sql);
    setOutcome(result);
    if (result.status === "success" && result.result.changes !== null) {
      onDataChanged();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void onRun();
    }
  };

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-separator pt-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">SQL console — {database}</span>
        <Button
          size="xs"
          variant="primary"
          icon={Play}
          label="Run"
          tooltip="Run the statement (⌘↵)"
          isLoading={isRunningQuery}
          disabled={sql.trim().length === 0}
          onClick={() => void onRun()}
        />
      </div>

      <TextArea
        placeholder="select * from messages limit 10"
        value={sql}
        minRows={3}
        onChange={(event) => setSql(event.target.value)}
        onKeyDown={onKeyDown}
      />

      {outcome?.status === "error" && (
        <ContentMessage variant="warning" title="Query failed" size="sm">
          {outcome.message}
        </ContentMessage>
      )}

      {outcome?.status === "success" && (
        <PodQueryResult result={outcome.result} />
      )}
    </div>
  );
}

function PodQueryResult({
  result,
}: {
  result: Extract<PodDatabaseQueryOutcome, { status: "success" }>["result"];
}) {
  if (result.changes !== null) {
    return (
      <ContentMessage variant="success" title="Statement applied" size="sm">
        {`${result.changes.toLocaleString()} row(s) affected.`}
      </ContentMessage>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted-foreground">
        {`${result.rowCount.toLocaleString()} row(s)`}
      </span>
      {result.note && (
        <ContentMessage variant="info" size="sm">
          {result.note}
        </ContentMessage>
      )}
      <div className="max-h-80 overflow-auto">
        <PodDatabaseRowsTable columns={result.columns} rows={result.rows} />
      </div>
    </div>
  );
}
