import {
  getConsumptionExportStatus,
  startConsumptionExport,
} from "@app/lib/api/analytics/consumption/export_jobs";
import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getHandleMock, describeWorkflowMock, startWorkflowMock } = vi.hoisted(
  () => ({
    getHandleMock: vi.fn(),
    describeWorkflowMock: vi.fn().mockResolvedValue({
      status: { name: "COMPLETED" },
    }),
    startWorkflowMock: vi.fn().mockResolvedValue(undefined),
  })
);

vi.mock(import("@app/lib/temporal"), async (importOriginal) => {
  const actual = await importOriginal();
  getHandleMock.mockReturnValue({ describe: describeWorkflowMock });
  return {
    ...actual,
    getTemporalClientForFrontNamespace: vi.fn().mockResolvedValue({
      workflow: {
        start: startWorkflowMock,
        getHandle: getHandleMock,
      },
    }),
  };
});

beforeEach(() => {
  getHandleMock.mockClear();
  describeWorkflowMock
    .mockClear()
    .mockResolvedValue({ status: { name: "COMPLETED" } });
  startWorkflowMock.mockClear().mockResolvedValue(undefined);
  fileStorageMock.setFileExists(() => false);
});

afterEach(() => {
  vi.useRealTimers();
});

// Regression test for a bug where `resolveConsumptionPeriod` resolves a "days" period's
// endDate to `now.toISOString()`, which is different on every call. The status check, the
// start request, and every later poll each computed a different exportId/workflowId for
// what should be the same logical export, so a poll could report the export as not-running
// while it was still generating.
describe("consumption export cache key stability for 'days' periods", () => {
  it("resolves the same exportId (and Temporal workflow ID) across status -> start -> status", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T10:00:00.000Z"));

    const { authenticator } = await createResourceTest({ role: "admin" });

    const periodAtFirstStatusCheck = await resolveConsumptionPeriod(
      authenticator,
      { kind: "days", days: 7 }
    );
    const status1 = await getConsumptionExportStatus(authenticator, {
      period: periodAtFirstStatusCheck,
      filter: {},
    });

    // Time passes before the user clicks "export".
    vi.setSystemTime(new Date("2026-08-18T10:00:05.500Z"));

    const periodAtStart = await resolveConsumptionPeriod(authenticator, {
      kind: "days",
      days: 7,
    });
    const startResult = await startConsumptionExport(authenticator, {
      period: periodAtStart,
      filter: {},
    });
    expect(startResult.isOk()).toBe(true);

    // More time passes before the panel polls status again.
    vi.setSystemTime(new Date("2026-08-18T10:00:12.900Z"));

    const periodAtSecondStatusCheck = await resolveConsumptionPeriod(
      authenticator,
      { kind: "days", days: 7 }
    );
    const status2 = await getConsumptionExportStatus(authenticator, {
      period: periodAtSecondStatusCheck,
      filter: {},
    });

    expect(status1.exportId).toBe(status2.exportId);

    // The workflow ID used to check status before starting, the one actually started, and
    // the one used to poll status afterwards must all be the same. `getHandle` is called
    // three times: by the first status check, by `launchConsumptionExportWorkflow`'s own
    // already-running guard, and by the second status check.
    expect(startWorkflowMock).toHaveBeenCalledTimes(1);
    const startedWorkflowId = startWorkflowMock.mock.calls[0][1].workflowId;
    const polledWorkflowIds = getHandleMock.mock.calls.map((call) => call[0]);

    expect(polledWorkflowIds).toEqual([
      startedWorkflowId,
      startedWorkflowId,
      startedWorkflowId,
    ]);
  });
});
