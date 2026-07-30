import { ANALYTICS_ALIAS_NAME, withEs } from "@app/lib/api/elasticsearch";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";

// Pass 2 of the `cost.billable_awu` backfill (pass 1 is the ES-internal
// `20260729_backfill_billable_awu_...http`, which sets billable_awu = full_awu
// for tracked statuses and 0 for `failed`). This pass recovers the billable
// portion of `failed` messages: a message that ended `failed` but did real work
// in a non-error execution (interrupt/resume) has a DB `costCredits` that already
// excludes the errored terminal execution and is ceiled per execution — the exact
// billable amount. We copy that into `cost.billable_awu` for the failed ES docs.
// Docs whose message has no DB `costCredits` (never populated / message purged)
// keep the 0 that pass 1 wrote, which matches the pre-existing reconciliation
// (failed messages were excluded), so there is no regression.
//
// New writes already set billable_awu from costCredits, so this only touches
// historical `failed` docs. ES `_id` comes straight from the search hits, so we
// don't recompute the hashed document id.

interface FailedDocHit {
  _id: string;
  message_id: string;
  version: number;
}

makeScript(
  {
    workspaceId: {
      type: "string",
      demandOption: false,
      description: "Restrict to a single workspace sId (defaults to all).",
    },
    batchSize: { type: "number", default: 1000 },
  },
  async ({ workspaceId, batchSize, execute }, logger) => {
    let workspaceModelId: number | null = null;
    let workspaceSId: string | null = null;
    if (workspaceId) {
      const workspace = await WorkspaceResource.fetchById(workspaceId);
      if (!workspace) {
        logger.error({ workspaceId }, "Workspace not found.");
        return;
      }
      workspaceModelId = workspace.id;
      workspaceSId = workspace.sId;
    }

    let searchAfter: (string | number)[] | undefined = undefined;
    let scanned = 0;
    let updated = 0;

    for (;;) {
      // Read a page of `failed` docs (tie-break on message_id for a stable
      // search_after cursor). Scoped to the workspace when provided.
      const filter: Record<string, unknown>[] = [
        { term: { status: "failed" } },
      ];
      if (workspaceSId) {
        filter.push({ term: { workspace_id: workspaceSId } });
      }

      const pageRes = await withEs(async (client) =>
        client.search<{
          message_id: string;
          version: string;
          cost?: { billable_awu?: number };
        }>({
          index: ANALYTICS_ALIAS_NAME,
          size: batchSize,
          sort: [{ timestamp: "asc" }, { message_id: "asc" }],
          ...(searchAfter ? { search_after: searchAfter } : {}),
          query: { bool: { filter } },
          _source: ["message_id", "version"],
        })
      );
      if (pageRes.isErr()) {
        logger.error({ err: pageRes.error }, "ES search failed.");
        return;
      }

      const hits = pageRes.value.hits.hits;
      if (hits.length === 0) {
        break;
      }
      searchAfter = hits[hits.length - 1].sort as (string | number)[];
      scanned += hits.length;

      const docs: FailedDocHit[] = hits
        .filter((h) => h._id && h._source?.message_id != null)
        .map((h) => ({
          _id: h._id as string,
          message_id: h._source!.message_id,
          version: Number(h._source!.version ?? 0),
        }));

      // Look up DB costCredits for this page's messages in one query, keyed by
      // `${sId}:${version}` since a message sId can have multiple versions.
      const messageRows = await MessageModel.findAll({
        where: {
          sId: docs.map((d) => d.message_id),
          ...(workspaceModelId ? { workspaceId: workspaceModelId } : {}),
        },
        include: [
          { model: AgentMessageModel, as: "agentMessage", required: true },
        ],
      });
      const costBySIdVersion = new Map<string, number>();
      for (const row of messageRows) {
        const costCredits = row.agentMessage?.costCredits;
        if (costCredits != null && costCredits > 0) {
          costBySIdVersion.set(`${row.sId}:${row.version}`, costCredits);
        }
      }

      const bulkOps: object[] = [];
      for (const doc of docs) {
        const costCredits = costBySIdVersion.get(
          `${doc.message_id}:${doc.version}`
        );
        if (costCredits === undefined) {
          continue;
        }
        bulkOps.push(
          { update: { _id: doc._id, _index: ANALYTICS_ALIAS_NAME } },
          { doc: { cost: { billable_awu: costCredits } } }
        );
      }

      if (bulkOps.length > 0) {
        if (execute) {
          const bulkRes = await withEs(async (client) =>
            client.bulk({ operations: bulkOps, refresh: false })
          );
          if (bulkRes.isErr()) {
            logger.error({ err: bulkRes.error }, "ES bulk update failed.");
            return;
          }
          if (bulkRes.value.errors) {
            logger.error(
              { firstItem: bulkRes.value.items?.[0] },
              "ES bulk update reported item errors."
            );
            return;
          }
        }
        updated += bulkOps.length / 2;
      }

      logger.info({ scanned, updated, execute }, "Progress");
    }

    logger.info(
      { scanned, updated, execute },
      execute
        ? "Backfill complete."
        : "Dry run complete (use --execute to apply)."
    );
  }
);
