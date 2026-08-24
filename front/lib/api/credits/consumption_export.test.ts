// @vitest-environment node: adm-zip requires Node builtins (Buffer, zlib)
import { buildMemberConsumptionExportZip } from "@app/lib/api/credits/consumption_export";
import type { ElasticsearchBaseDocument } from "@app/lib/api/elasticsearch";
import { searchAnalytics } from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { getCachedMetronomeCurrentBillingPeriod } from "@app/lib/metronome/contracts";
import { fetchPerUserAwuUsageRows } from "@app/lib/metronome/per_user_usage";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Ok } from "@app/types/shared/result";
import AdmZip from "adm-zip";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Both consumption sources are external (Elasticsearch, Metronome); stub each
// read and keep the rest — membership resolution, row shaping, CSV and ZIP
// assembly — real.
vi.mock("@app/lib/api/elasticsearch", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/elasticsearch")>();
  return { ...actual, searchAnalytics: vi.fn() };
});

vi.mock("@app/lib/metronome/contracts", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/metronome/contracts")>();
  return { ...actual, getCachedMetronomeCurrentBillingPeriod: vi.fn() };
});

vi.mock("@app/lib/metronome/per_user_usage", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/metronome/per_user_usage")>();
  return { ...actual, fetchPerUserAwuUsageRows: vi.fn() };
});

const CYCLE_START = new Date("2026-08-01T00:00:00.000Z");
const CYCLE_END = new Date("2026-09-01T00:00:00.000Z");

function mockEsDocuments(documents: ElasticsearchBaseDocument[]) {
  vi.mocked(searchAnalytics).mockResolvedValue(
    new Ok({
      took: 1,
      timed_out: false,
      _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
      hits: {
        total: { value: documents.length, relation: "eq" },
        hits: documents.map((doc, i) => ({
          _index: "analytics",
          _id: String(i),
          _source: doc,
          sort: [i],
        })),
      },
    })
  );
}

function makeEsDocument({
  messageId,
  billableAwu,
}: {
  messageId: string;
  billableAwu: number;
}) {
  return {
    workspace_id: "workspace_id",
    message_id: messageId,
    conversation_id: "conv_1",
    agent_id: "agent_1",
    agent_version: "3",
    model: { provider_id: "anthropic", model_id: "claude-opus-5" },
    status: "succeeded",
    is_free_seat: false,
    context_origin: "web",
    timestamp: "2026-08-02T10:00:00.000Z",
    cost: {
      full_awu: billableAwu,
      llm_awu: billableAwu,
      tool_awu: 0,
      billable_awu: billableAwu,
    },
  };
}

function readCsv(zip: Buffer, entryName: string): string[] {
  return new AdmZip(zip)
    .getEntry(entryName)!
    .getData()
    .toString("utf-8")
    .trim()
    .split("\n");
}

async function setup() {
  const workspace = await WorkspaceFactory.creditPriced();
  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "user" });
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  return { auth, user, workspace };
}

describe("buildMemberConsumptionExportZip", () => {
  beforeEach(() => {
    vi.mocked(getCachedMetronomeCurrentBillingPeriod).mockResolvedValue(
      new Ok({ cycleStart: CYCLE_START, cycleEnd: CYCLE_END })
    );
    mockEsDocuments([]);
    vi.mocked(fetchPerUserAwuUsageRows).mockResolvedValue(new Ok([]));
  });

  it("writes one CSV per source, each row dated by its consumption event", async () => {
    const { auth, user } = await setup();

    mockEsDocuments([
      makeEsDocument({ messageId: "msg_1", billableAwu: 12 }),
      makeEsDocument({ messageId: "msg_2", billableAwu: 30 }),
    ]);
    vi.mocked(fetchPerUserAwuUsageRows).mockResolvedValue(
      new Ok([
        {
          userId: user.sId,
          metric: "llm_provider_cost_awu",
          usageType: "user",
          toolCategory: null,
          startingOn: "2026-08-02T00:00:00.000Z",
          endingBefore: "2026-08-03T00:00:00.000Z",
          value: 40,
          awuWeight: 1,
          awuCredits: 40,
        },
      ])
    );

    const result = await buildMemberConsumptionExportZip(auth, { user });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }

    const { zip } = result.value;
    const esLines = readCsv(zip, "elasticsearch.csv");
    const metronomeLines = readCsv(zip, "metronome.csv");

    // Header + one row per message / per usage bucket.
    expect(esLines).toHaveLength(3);
    expect(metronomeLines).toHaveLength(2);
    // Both files carry the shared columns, then their own dating: the message
    // timestamp for ES, the bucket bounds for Metronome.
    expect(esLines[0]).toContain("awuCredits,date,messageId");
    expect(esLines[1]).toContain("12,2026-08-02T10:00:00.000Z,msg_1");
    expect(metronomeLines[0]).toContain("awuCredits,startDate,endDate");
    expect(metronomeLines[1]).toContain(
      "40,2026-08-02T00:00:00.000Z,2026-08-03T00:00:00.000Z"
    );

    // Hourly windows: the finest per-user breakdown Metronome exposes, so a
    // reporting gap can be located in time.
    expect(fetchPerUserAwuUsageRows).toHaveBeenCalledWith(
      expect.objectContaining({ hourly: true })
    );

    // No file for the rate limiter: Redis has nothing to itemize.
    expect(new AdmZip(zip).getEntries().map((e) => e.entryName)).toEqual([
      "elasticsearch.csv",
      "metronome.csv",
    ]);
  });

  it("still exports Elasticsearch rows when the Metronome read comes back empty", async () => {
    const { auth, user } = await setup();

    mockEsDocuments([makeEsDocument({ messageId: "msg_1", billableAwu: 7 })]);
    vi.mocked(fetchPerUserAwuUsageRows).mockResolvedValue(
      new Ok([]) // No usage reported for the user.
    );

    const result = await buildMemberConsumptionExportZip(auth, { user });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }

    // Header-only file for the source with nothing to report.
    expect(readCsv(result.value.zip, "elasticsearch.csv")).toHaveLength(2);
    expect(readCsv(result.value.zip, "metronome.csv")).toHaveLength(1);
  });

  it("fails when the workspace has no current billing period", async () => {
    const { auth, user } = await setup();
    vi.mocked(getCachedMetronomeCurrentBillingPeriod).mockResolvedValue(
      new Ok(null)
    );

    const result = await buildMemberConsumptionExportZip(auth, { user });

    expect(result.isErr()).toBe(true);
  });
});
