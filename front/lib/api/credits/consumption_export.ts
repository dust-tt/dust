import {
  roundToTwoDecimals,
  rowsToCsv,
} from "@app/lib/api/analytics/csv_utils";
import { searchAnalytics } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { BillingCycle } from "@app/lib/client/subscription";
import { toFreeMetronomeUserId } from "@app/lib/metronome/constants";
import { getCachedMetronomeCurrentBillingPeriod } from "@app/lib/metronome/contracts";
import type { PerUserAwuUsageRow } from "@app/lib/metronome/per_user_usage";
import { fetchPerUserAwuUsageRows } from "@app/lib/metronome/per_user_usage";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import type { AgentMessageAnalyticsData } from "@app/types/assistant/analytics";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { estypes } from "@elastic/elasticsearch";
import AdmZip from "adm-zip";

// The two itemizable counters compared in the members table's
// "Consumed (ES / RL / MT)" column. Each file in the export details one of them.
// The RL figure has no file: Redis only holds a single counter for the cycle,
// with no per-event trace to list.
type ConsumptionSource = "elasticsearch" | "metronome";

const ES_EXPORT_PAGE_SIZE = 1_000;

// Every row of both files starts with these columns, so the two can be
// concatenated or diffed side by side. `awuCredits` is the row's contribution
// to that source's total. When the consumption happened is source-specific: ES
// rows carry the message `date`, Metronome rows the `startDate`/`endDate` of
// their usage bucket.
type SharedExportRow = {
  source: ConsumptionSource;
  workspaceId: string;
  userId: string;
  userEmail: string;
  cycleStart: string;
  cycleEnd: string;
  awuCredits: number;
};

const SHARED_HEADERS = [
  "source",
  "workspaceId",
  "userId",
  "userEmail",
  "cycleStart",
  "cycleEnd",
  "awuCredits",
] as const;

// One row per indexed agent message: the granular documents whose
// `cost.billable_awu` the members table sums into the ES figure.
type EsExportRow = SharedExportRow & {
  // When the message was indexed, i.e. when the consumption happened.
  date: string;
  messageId: string;
  conversationId: string;
  agentId: string;
  agentVersion: string;
  modelProviderId: string;
  modelId: string;
  status: string;
  isFreeSeat: string;
  contextOrigin: string;
  fullAwu: number;
  llmAwu: number;
  toolAwu: number;
};

const ES_HEADERS = [
  ...SHARED_HEADERS,
  "date",
  "messageId",
  "conversationId",
  "agentId",
  "agentVersion",
  "modelProviderId",
  "modelId",
  "status",
  "isFreeSeat",
  "contextOrigin",
  "fullAwu",
  "llmAwu",
  "toolAwu",
] as const;

// One row per Metronome usage bucket (metric × hour × usage type × tool
// category), the finest per-user breakdown the usage API exposes: Metronome
// does not let us list the underlying ingested events back, and the dimensions
// that would identify them (agent, model, origin, api key) are not compounded
// with `user_id` on the billable metrics. Hourly windows are what make a gap
// locatable in time.
type MetronomeExportRow = SharedExportRow & {
  // Bounds of the hourly usage bucket the row aggregates.
  startDate: string;
  endDate: string;
  metronomeUserId: string;
  metric: string;
  usageType: string;
  toolCategory: string;
  rawValue: number;
  awuWeight: number;
};

const METRONOME_HEADERS = [
  ...SHARED_HEADERS,
  "startDate",
  "endDate",
  "metronomeUserId",
  "metric",
  "usageType",
  "toolCategory",
  "rawValue",
  "awuWeight",
] as const;

type SharedRowContext = {
  workspaceId: string;
  userId: string;
  userEmail: string;
  cycleStart: string;
  cycleEnd: string;
};

/**
 * Every analytics document that contributes to the user's ES consumption for
 * the cycle. Mirrors the filter of `fetchConsumedAwuCreditsByUserId` (same
 * workspace/user/timestamp scope and the same free/paid seat split), so the
 * summed `cost.billable_awu` of these documents is the figure the members table
 * shows as "ES".
 */
async function fetchEsConsumptionDocuments({
  workspaceId,
  userId,
  isFreeSeat,
  cycle,
}: {
  workspaceId: string;
  userId: string;
  isFreeSeat: boolean;
  cycle: BillingCycle;
}): Promise<Result<AgentMessageAnalyticsData[], Error>> {
  const seatSplitClause: estypes.QueryDslQueryContainer = isFreeSeat
    ? { term: { is_free_seat: true } }
    : // `must_not is_free_seat=true` (rather than `is_free_seat=false`) so
      // documents indexed before the field existed count as paid.
      { bool: { must_not: [{ term: { is_free_seat: true } }] } };

  const query: estypes.QueryDslQueryContainer = {
    bool: {
      filter: [
        { term: { workspace_id: workspaceId } },
        { term: { user_id: userId } },
        seatSplitClause,
        {
          range: {
            timestamp: {
              gte: cycle.cycleStart.toISOString(),
              lte: cycle.cycleEnd.toISOString(),
            },
          },
        },
      ],
    },
  };

  const documents: AgentMessageAnalyticsData[] = [];
  let searchAfter: estypes.SortResults | undefined;
  let hitCount: number;

  do {
    const result = await searchAnalytics<AgentMessageAnalyticsData>(query, {
      size: ES_EXPORT_PAGE_SIZE,
      sort: [{ timestamp: "asc" }, { message_id: "asc" }],
      search_after: searchAfter,
    });
    if (result.isErr()) {
      return new Err(result.error);
    }

    const { hits } = result.value.hits;
    for (const hit of hits) {
      if (hit._source) {
        documents.push(hit._source);
      }
    }

    hitCount = hits.length;
    searchAfter = hits[hits.length - 1]?.sort;
  } while (hitCount === ES_EXPORT_PAGE_SIZE);

  return new Ok(documents);
}

function toEsExportRow(
  shared: SharedRowContext,
  doc: AgentMessageAnalyticsData
): EsExportRow {
  return {
    ...shared,
    source: "elasticsearch",
    date: doc.timestamp,
    awuCredits: roundToTwoDecimals(doc.cost.billable_awu),
    messageId: doc.message_id,
    conversationId: doc.conversation_id,
    agentId: doc.agent_id,
    agentVersion: doc.agent_version,
    modelProviderId: doc.model?.provider_id ?? "",
    modelId: doc.model?.model_id ?? "",
    status: doc.status,
    isFreeSeat: String(doc.is_free_seat),
    contextOrigin: doc.context_origin ?? "",
    fullAwu: roundToTwoDecimals(doc.cost.full_awu),
    llmAwu: roundToTwoDecimals(doc.cost.llm_awu),
    toolAwu: roundToTwoDecimals(doc.cost.tool_awu),
  };
}

function toMetronomeExportRow(
  shared: SharedRowContext,
  metronomeUserId: string,
  row: PerUserAwuUsageRow
): MetronomeExportRow {
  return {
    ...shared,
    source: "metronome",
    startDate: row.startingOn,
    endDate: row.endingBefore,
    awuCredits: roundToTwoDecimals(row.awuCredits),
    metronomeUserId,
    metric: row.metric,
    usageType: row.usageType,
    toolCategory: row.toolCategory ?? "",
    rawValue: roundToTwoDecimals(row.value),
    awuWeight: row.awuWeight,
  };
}

async function fetchMetronomeExportRows({
  auth,
  shared,
  metronomeUserId,
}: {
  auth: Authenticator;
  shared: SharedRowContext;
  metronomeUserId: string;
}): Promise<MetronomeExportRow[]> {
  const workspace = auth.getNonNullableWorkspace();
  if (!workspace.metronomeCustomerId) {
    return [];
  }

  const rowsResult = await fetchPerUserAwuUsageRows({
    workspaceId: workspace.sId,
    metronomeCustomerId: workspace.metronomeCustomerId,
    userIds: [metronomeUserId],
    hourly: true,
  });
  if (rowsResult.isErr()) {
    logger.warn(
      {
        err: rowsResult.error,
        workspaceId: workspace.sId,
        userId: shared.userId,
      },
      "[ConsumptionExport] Failed to read Metronome usage rows"
    );
    return [];
  }

  return rowsResult.value.map((row) =>
    toMetronomeExportRow(shared, metronomeUserId, row)
  );
}

/**
 * A ZIP holding the rows behind the consumption figures the poke members table
 * compares for one member over the current billing cycle: the Elasticsearch
 * analytics documents and the Metronome usage buckets, in two CSVs sharing a
 * leading set of columns (see `SHARED_HEADERS`). The RL figure has no file — see
 * `ConsumptionSource`.
 *
 * A source that can't be read (no Metronome customer, a Metronome failure)
 * contributes a header-only file rather than failing the whole export.
 */
export async function buildMemberConsumptionExportZip(
  auth: Authenticator,
  { user }: { user: UserResource }
): Promise<Result<{ zip: Buffer; filename: string }, Error>> {
  const workspace = auth.getNonNullableWorkspace();

  const periodResult = await getCachedMetronomeCurrentBillingPeriod(
    workspace.sId
  );
  if (periodResult.isErr()) {
    return new Err(periodResult.error);
  }
  const cycle = periodResult.value;
  if (!cycle) {
    return new Err(
      new Error(
        "No current billing period for this workspace; nothing to export."
      )
    );
  }

  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user,
      workspace,
    });
  if (!membership) {
    return new Err(new Error("User is not an active member of the workspace."));
  }

  const isFreeSeat = membership.seatType === "free";
  // Metronome splits free-seat usage under a prefixed user id; Elasticsearch
  // keys on the plain sId for everyone.
  const metronomeUserId = isFreeSeat
    ? toFreeMetronomeUserId(user.sId)
    : user.sId;

  const shared: SharedRowContext = {
    workspaceId: workspace.sId,
    userId: user.sId,
    userEmail: user.email ?? "",
    cycleStart: cycle.cycleStart.toISOString(),
    cycleEnd: cycle.cycleEnd.toISOString(),
  };

  const [esDocumentsResult, metronomeRows] = await Promise.all([
    fetchEsConsumptionDocuments({
      workspaceId: workspace.sId,
      userId: user.sId,
      isFreeSeat,
      cycle,
    }),
    fetchMetronomeExportRows({ auth, shared, metronomeUserId }),
  ]);
  if (esDocumentsResult.isErr()) {
    return new Err(normalizeError(esDocumentsResult.error));
  }

  const esRows = esDocumentsResult.value.map((doc) =>
    toEsExportRow(shared, doc)
  );

  const zip = new AdmZip();
  zip.addFile(
    "elasticsearch.csv",
    Buffer.from(rowsToCsv(ES_HEADERS, esRows), "utf-8")
  );
  zip.addFile(
    "metronome.csv",
    Buffer.from(rowsToCsv(METRONOME_HEADERS, metronomeRows), "utf-8")
  );

  return new Ok({
    zip: zip.toBuffer(),
    filename: `dust_consumption_${workspace.sId}_${user.sId}.zip`,
  });
}
