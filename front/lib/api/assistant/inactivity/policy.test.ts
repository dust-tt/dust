import type {
  AgentInactivitySnapshot,
  AgentTriggerSnapshot,
} from "@app/lib/api/assistant/inactivity/policy";
import {
  computeInactivityCutoffAt,
  evaluateAgentArchivalEligibility,
  MAX_INACTIVITY_THRESHOLD_DAYS,
  MIN_INACTIVITY_THRESHOLD_DAYS,
} from "@app/lib/api/assistant/inactivity/policy";
import type { AgentConfigurationStatus } from "@app/types/assistant/agent";
import type { TriggerStatus } from "@app/types/assistant/triggers";
import { describe, expect, it } from "vitest";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const EVALUATED_AT = new Date("2026-08-18T09:00:00.000Z");

const THRESHOLD_30_DAYS = 30;

function agent(
  overrides: Partial<AgentInactivitySnapshot> = {}
): AgentInactivitySnapshot {
  return {
    agentId: "agent_12345",
    // Old enough that tests which say nothing about creation are testing what they mean to.
    createdAt: new Date("2020-01-01T00:00:00.000Z"),
    lastMentionedAt: null,
    status: "active",
    triggers: [],
    ...overrides,
  };
}

function scheduleTrigger(status: TriggerStatus): AgentTriggerSnapshot {
  return { kind: "schedule", status };
}

function daysBeforeEvaluation(days: number): Date {
  return new Date(EVALUATED_AT.getTime() - days * ONE_DAY_MS);
}

function cutoffFor(thresholdDays: number): Date {
  const cutoffRes = computeInactivityCutoffAt({
    thresholdDays,
    evaluatedAt: EVALUATED_AT,
  });
  if (cutoffRes.isErr()) {
    throw cutoffRes.error;
  }
  return cutoffRes.value;
}

const CUTOFF_30_DAYS = cutoffFor(THRESHOLD_30_DAYS);

describe("computeInactivityCutoffAt", () => {
  it("subtracts the threshold and truncates to the start of the UTC day", () => {
    const cutoffRes = computeInactivityCutoffAt({
      thresholdDays: THRESHOLD_30_DAYS,
      evaluatedAt: EVALUATED_AT,
    });

    expect(cutoffRes.isOk()).toBe(true);
    expect(cutoffRes.isOk() && cutoffRes.value).toEqual(
      new Date("2026-07-19T00:00:00.000Z")
    );
  });

  it("resolves the minimum threshold", () => {
    const cutoffRes = computeInactivityCutoffAt({
      thresholdDays: MIN_INACTIVITY_THRESHOLD_DAYS,
      evaluatedAt: EVALUATED_AT,
    });

    expect(cutoffRes.isOk()).toBe(true);
    expect(cutoffRes.isOk() && cutoffRes.value).toEqual(
      new Date("2026-08-16T00:00:00.000Z")
    );
  });

  it("ignores the time of day, so every run on one date shares a cutoff", () => {
    const nightly = computeInactivityCutoffAt({
      thresholdDays: THRESHOLD_30_DAYS,
      evaluatedAt: new Date("2026-08-18T02:00:00.000Z"),
    });
    const afternoon = computeInactivityCutoffAt({
      thresholdDays: THRESHOLD_30_DAYS,
      evaluatedAt: new Date("2026-08-18T17:45:12.345Z"),
    });

    expect(nightly.isOk() && nightly.value).toEqual(
      new Date("2026-07-19T00:00:00.000Z")
    );
    expect(afternoon.isOk() && afternoon.value).toEqual(
      new Date("2026-07-19T00:00:00.000Z")
    );
  });

  it("resolves the maximum threshold", () => {
    expect(MAX_INACTIVITY_THRESHOLD_DAYS).toBe(366);

    const cutoffRes = computeInactivityCutoffAt({
      thresholdDays: MAX_INACTIVITY_THRESHOLD_DAYS,
      evaluatedAt: EVALUATED_AT,
    });

    expect(cutoffRes.isOk()).toBe(true);
    expect(cutoffRes.isOk() && cutoffRes.value).toEqual(
      new Date("2025-08-17T00:00:00.000Z")
    );
  });

  it("fails on every invalid threshold, so nothing can be archived", () => {
    const invalidThresholds = [
      1,
      0,
      -1,
      -5,
      2.5,
      NaN,
      Infinity,
      MAX_INACTIVITY_THRESHOLD_DAYS + 1,
      3650,
      // Overflows the cutoff arithmetic to an Invalid Date, which `Number.isInteger` alone would
      // have let through and bound straight into SQL.
      Number.MAX_SAFE_INTEGER,
    ];

    for (const thresholdDays of invalidThresholds) {
      const cutoffRes = computeInactivityCutoffAt({
        thresholdDays,
        evaluatedAt: EVALUATED_AT,
      });

      expect(cutoffRes.isErr()).toBe(true);
      expect(cutoffRes.isErr() && cutoffRes.error.type).toBe(
        "invalid_threshold"
      );
    }
  });

  it("reports the offending threshold in the error message", () => {
    const cutoffRes = computeInactivityCutoffAt({
      thresholdDays: 1,
      evaluatedAt: EVALUATED_AT,
    });

    expect(cutoffRes.isErr() && cutoffRes.error.message).toContain("got 1");
  });
});

describe("evaluateAgentArchivalEligibility", () => {
  it("keeps an agent created after the cutoff, however unused", () => {
    // Without this rule the first nightly run after somebody builds an agent archives it.
    expect(
      evaluateAgentArchivalEligibility({
        agent: agent({
          createdAt: daysBeforeEvaluation(5),
          lastMentionedAt: null,
        }),
        cutoffAt: CUTOFF_30_DAYS,
      })
    ).toEqual({ eligible: false, reason: "recent_creation" });
  });

  it("puts the creation boundary where the mention boundary is", () => {
    expect(
      evaluateAgentArchivalEligibility({
        agent: agent({ createdAt: new Date(CUTOFF_30_DAYS.getTime() - 1) }),
        cutoffAt: CUTOFF_30_DAYS,
      })
    ).toEqual({ eligible: true });

    expect(
      evaluateAgentArchivalEligibility({
        agent: agent({ createdAt: CUTOFF_30_DAYS }),
        cutoffAt: CUTOFF_30_DAYS,
      })
    ).toEqual({ eligible: false, reason: "recent_creation" });
  });

  it("archives an agent that was never mentioned", () => {
    expect(
      evaluateAgentArchivalEligibility({
        agent: agent({ lastMentionedAt: null }),
        cutoffAt: CUTOFF_30_DAYS,
      })
    ).toEqual({ eligible: true });
  });

  it("archives an agent whose last mention predates the cutoff", () => {
    expect(
      evaluateAgentArchivalEligibility({
        agent: agent({ lastMentionedAt: daysBeforeEvaluation(31) }),
        cutoffAt: CUTOFF_30_DAYS,
      })
    ).toEqual({ eligible: true });
  });

  it("keeps an agent whose last mention is more recent than the cutoff", () => {
    expect(
      evaluateAgentArchivalEligibility({
        agent: agent({ lastMentionedAt: daysBeforeEvaluation(29) }),
        cutoffAt: CUTOFF_30_DAYS,
      })
    ).toEqual({ eligible: false, reason: "recent_mention" });
  });

  describe("cutoff boundary", () => {
    it("keeps an agent whose mention lands exactly on the cutoff", () => {
      expect(
        evaluateAgentArchivalEligibility({
          agent: agent({ lastMentionedAt: CUTOFF_30_DAYS }),
          cutoffAt: CUTOFF_30_DAYS,
        })
      ).toEqual({ eligible: false, reason: "recent_mention" });
    });

    it("archives an agent one millisecond before the cutoff", () => {
      expect(
        evaluateAgentArchivalEligibility({
          agent: agent({
            lastMentionedAt: new Date(CUTOFF_30_DAYS.getTime() - 1),
          }),
          cutoffAt: CUTOFF_30_DAYS,
        })
      ).toEqual({ eligible: true });
    });
  });

  describe("schedule exemption", () => {
    it("exempts an agent with an enabled schedule trigger, however inactive", () => {
      expect(
        evaluateAgentArchivalEligibility({
          agent: agent({
            lastMentionedAt: null,
            triggers: [scheduleTrigger("enabled")],
          }),
          cutoffAt: CUTOFF_30_DAYS,
        })
      ).toEqual({ eligible: false, reason: "active_schedule" });
    });

    it("exempts an agent whose schedule Dust paused, not the workspace", () => {
      // Relocation and plan downgrade flip every enabled trigger of a workspace in bulk.
      const dustPausedStatuses: TriggerStatus[] = ["relocating", "downgraded"];

      for (const status of dustPausedStatuses) {
        expect(
          evaluateAgentArchivalEligibility({
            agent: agent({
              lastMentionedAt: null,
              triggers: [scheduleTrigger(status)],
            }),
            cutoffAt: CUTOFF_30_DAYS,
          })
        ).toEqual({ eligible: false, reason: "active_schedule" });
      }
    });

    it("does not exempt an agent whose schedule the workspace turned off", () => {
      const workspaceDisabledStatuses: TriggerStatus[] = [
        "disabled",
        "disabled_by_manager",
      ];

      for (const status of workspaceDisabledStatuses) {
        expect(
          evaluateAgentArchivalEligibility({
            agent: agent({
              lastMentionedAt: null,
              triggers: [scheduleTrigger(status)],
            }),
            cutoffAt: CUTOFF_30_DAYS,
          })
        ).toEqual({ eligible: true });
      }
    });

    it("does not exempt an agent that only has a webhook trigger", () => {
      expect(
        evaluateAgentArchivalEligibility({
          agent: agent({
            lastMentionedAt: null,
            triggers: [{ kind: "webhook", status: "enabled" }],
          }),
          cutoffAt: CUTOFF_30_DAYS,
        })
      ).toEqual({ eligible: true });
    });

    it("exempts on any one protecting trigger among several", () => {
      expect(
        evaluateAgentArchivalEligibility({
          agent: agent({
            lastMentionedAt: null,
            triggers: [
              scheduleTrigger("disabled"),
              { kind: "webhook", status: "enabled" },
              scheduleTrigger("relocating"),
            ],
          }),
          cutoffAt: CUTOFF_30_DAYS,
        })
      ).toEqual({ eligible: false, reason: "active_schedule" });
    });
  });

  it("does not exempt an agent that only has pending wake-ups", () => {
    // A wake-up continues one conversation rather than driving the agent, so it is not in the
    // snapshot at all.
    expect(
      evaluateAgentArchivalEligibility({
        agent: agent({
          lastMentionedAt: daysBeforeEvaluation(31),
          triggers: [],
        }),
        cutoffAt: CUTOFF_30_DAYS,
      })
    ).toEqual({ eligible: true });
  });

  it("excludes agents that are not active", () => {
    // The `disabled_*` statuses only ever belong to global agents, which a workspace does not own.
    const nonActiveStatuses: AgentConfigurationStatus[] = [
      "archived",
      "draft",
      "pending",
      "disabled_by_admin",
      "disabled_missing_datasource",
      "disabled_free_workspace",
    ];

    for (const status of nonActiveStatuses) {
      expect(
        evaluateAgentArchivalEligibility({
          agent: agent({ status, lastMentionedAt: null }),
          cutoffAt: CUTOFF_30_DAYS,
        })
      ).toEqual({ eligible: false, reason: "agent_not_active" });
    }
  });

  it("reports the status exclusion before any activity-based reason", () => {
    // A repeated run has to be a no-op for the same machine-readable reason every time.
    expect(
      evaluateAgentArchivalEligibility({
        agent: agent({
          status: "archived",
          triggers: [scheduleTrigger("enabled")],
          lastMentionedAt: EVALUATED_AT,
        }),
        cutoffAt: CUTOFF_30_DAYS,
      })
    ).toEqual({ eligible: false, reason: "agent_not_active" });
  });

  it("archives at the minimum threshold", () => {
    expect(
      evaluateAgentArchivalEligibility({
        agent: agent({ lastMentionedAt: daysBeforeEvaluation(3) }),
        cutoffAt: cutoffFor(MIN_INACTIVITY_THRESHOLD_DAYS),
      })
    ).toEqual({ eligible: true });
  });

  it("is deterministic for a given cutoff", () => {
    const snapshot = agent({
      lastMentionedAt: daysBeforeEvaluation(30),
    });

    expect(
      evaluateAgentArchivalEligibility({
        agent: snapshot,
        cutoffAt: CUTOFF_30_DAYS,
      })
    ).toEqual({ eligible: false, reason: "recent_mention" });

    expect(
      evaluateAgentArchivalEligibility({
        agent: snapshot,
        cutoffAt: new Date(CUTOFF_30_DAYS.getTime() + ONE_DAY_MS),
      })
    ).toEqual({ eligible: true });
  });
});
