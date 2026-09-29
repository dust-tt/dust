import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  buildBreakageNotification,
  formatBreakageMessage,
  getTransition,
} from "./main-breakage.ts";

describe("getTransition", () => {
  it("reports the first failure after a success", () => {
    assert.equal(getTransition("success", "failure"), "broken");
  });

  it("reports the first success after a failure", () => {
    assert.equal(getTransition("failure", "success"), "recovered");
  });

  it("stays silent on repeated outcomes and without a predecessor", () => {
    assert.equal(getTransition("failure", "failure"), null);
    assert.equal(getTransition("success", "success"), null);
    assert.equal(getTransition(null, "failure"), null);
  });
});

const repo = { owner: "dust-tt", repo: "dust" };
const run = {
  id: 42,
  run_number: 7,
  run_attempt: 1,
  workflow_id: 3,
  name: "Lint & Build & Test (front)",
  conclusion: "failure",
  head_sha: "abcdef1234567890",
  html_url: "https://github.com/dust-tt/dust/actions/runs/42",
  head_commit: { message: "Break <main> & more\n\nBody" },
  actor: { login: "pusher" },
  triggering_actor: { login: "pusher" },
  run_started_at: "2026-09-28T12:00:00Z",
  updated_at: "2026-09-28T12:10:00Z",
};

describe("formatBreakageMessage", () => {
  it("escapes GitHub text and only inserts the resolved mention raw", () => {
    const text = formatBreakageMessage({
      transition: "broken",
      run,
      repo,
      failedJobs: ["Test Shard <5>"],
      pr: { number: 12, html_url: "https://github.com/dust-tt/dust/pull/12" },
      merger: "someone",
      mention: "<@U123>",
    });
    assert.equal(
      text,
      ":rotating_light: *main is broken*: Lint &amp; Build &amp; Test (front) failed on " +
        "<https://github.com/dust-tt/dust/commit/abcdef1234567890|abcdef1 Break &lt;main&gt; &amp; more> " +
        "(<https://github.com/dust-tt/dust/pull/12|#12>) merged by <@U123>. " +
        "Failed jobs: Test Shard &lt;5&gt;. <https://github.com/dust-tt/dust/actions/runs/42|See the run>."
    );
  });

  it("falls back to the plain login when the mention is unresolved", () => {
    const text = formatBreakageMessage({
      transition: "broken",
      run,
      repo,
      failedJobs: [],
      pr: null,
      merger: "someone",
      mention: null,
    });
    assert.match(text, / merged by @someone\. </);
  });

  it("escapes GitHub text in recovery messages", () => {
    const text = formatBreakageMessage({
      transition: "recovered",
      run: { ...run, conclusion: "success" },
      repo,
      failedJobs: [],
      pr: null,
      merger: null,
      mention: null,
    });
    assert.match(text, /Break &lt;main&gt; &amp; more/);
    assert.doesNotMatch(text, /<main>/);
  });
});

type FakeJob = {
  name: string;
  conclusion: string | null;
  steps?: Array<{ name: string; conclusion: string | null }>;
};

function fakeGithub({
  otherRuns,
  otherRunsAfterRetry,
  jobs = [],
  retryJobs,
  retryConclusion = null,
  jobsByRunNumber = {},
  attempts = {},
  attemptJobs = {},
  pulls = [],
  mergedBy = null,
}: {
  otherRuns: Array<{ run_number: number; conclusion: string | null }>;
  otherRunsAfterRetry?: Array<{
    run_number: number;
    conclusion: string | null;
  }>;
  jobs?: FakeJob[];
  retryJobs?: FakeJob[];
  retryConclusion?: string | null;
  jobsByRunNumber?: Record<
    number,
    Array<{ name: string; conclusion: string | null }>
  >;
  attempts?: Record<number, { conclusion: string | null }>;
  attemptJobs?: Record<
    number,
    Array<{ name: string; conclusion: string | null }>
  >;
  pulls?: Array<{ number: number; html_url: string; merged_at: string | null }>;
  mergedBy?: string | null;
}) {
  const calls = { reruns: 0 };
  return {
    calls,
    rest: {
      actions: {
        listWorkflowRuns: async () => ({
          data: {
            workflow_runs: (calls.reruns > 0 && otherRunsAfterRetry
              ? otherRunsAfterRetry
              : otherRuns
            ).map((candidate) => ({
              id: 1000 + candidate.run_number,
              ...candidate,
            })),
          },
        }),
        listJobsForWorkflowRun: async ({ run_id }: { run_id: number }) => {
          if (run_id === run.id) {
            return {
              data: { jobs: calls.reruns > 0 && retryJobs ? retryJobs : jobs },
            };
          }
          return {
            data: {
              jobs: jobsByRunNumber[run_id - 1000] ?? [
                { name: "test", conclusion: "success" },
              ],
            },
          };
        },
        listJobsForWorkflowRunAttempt: async ({
          attempt_number,
        }: {
          attempt_number: number;
        }) => ({
          data: {
            jobs: attemptJobs[attempt_number] ?? [
              { name: "test", conclusion: "success" },
            ],
          },
        }),
        getWorkflowRunAttempt: async ({
          attempt_number,
        }: {
          attempt_number: number;
        }) => ({ data: attempts[attempt_number] ?? { conclusion: null } }),
        getWorkflowRun: async () => ({
          data:
            retryConclusion === null
              ? { run_attempt: 2, status: "in_progress", conclusion: null }
              : {
                  run_attempt: 2,
                  status: "completed",
                  conclusion: retryConclusion,
                },
        }),
        reRunWorkflowFailedJobs: async () => {
          calls.reruns += 1;
        },
      },
      repos: {
        listPullRequestsAssociatedWithCommit: async () => ({ data: pulls }),
      },
      pulls: {
        get: async () => ({
          data: { merged_by: mergedBy ? { login: mergedBy } : null },
        }),
      },
    },
  };
}

const core = { info() {}, warning() {} };

describe("buildBreakageNotification", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns null when main was already red", async () => {
    const text = await buildBreakageNotification({
      github: fakeGithub({
        otherRuns: [
          { run_number: 6, conclusion: "failure" },
          { run_number: 5, conclusion: "success" },
        ],
      }),
      context: { repo, payload: { workflow_run: run } },
      core,
      authors: "",
      slackToken: "token",
    });
    assert.equal(text, null);
  });

  it("stays silent when a newer run already completed", async () => {
    const text = await buildBreakageNotification({
      github: fakeGithub({
        otherRuns: [
          { run_number: 8, conclusion: "success" },
          { run_number: 6, conclusion: "success" },
        ],
      }),
      context: { repo, payload: { workflow_run: run } },
      core,
      authors: "",
      slackToken: "token",
    });
    assert.equal(text, null);
  });

  it("ignores cancelled runs when finding the previous state", async () => {
    globalThis.fetch = (async () =>
      new Response("", { status: 500 })) as typeof fetch;
    const text = await buildBreakageNotification({
      github: fakeGithub({
        otherRuns: [
          { run_number: 6, conclusion: "cancelled" },
          { run_number: 5, conclusion: "success" },
        ],
        jobs: [
          { name: "Test Shard 5 of 6", conclusion: "failure" },
          { name: "Test Shard 1 of 6", conclusion: "success" },
        ],
        pulls: [
          {
            number: 12,
            html_url: "https://github.com/dust-tt/dust/pull/12",
            merged_at: "2026-09-28T00:00:00Z",
          },
        ],
        mergedBy: "Merger",
      }),
      context: { repo, payload: { workflow_run: run } },
      core,
      authors: "merger: merger@dust.tt\n",
      slackToken: "token",
    });
    assert.notEqual(text, null);
    assert.match(
      text ?? "",
      /merged by @Merger\. Failed jobs: Test Shard 5 of 6\./
    );
  });

  it("does not treat a run with skipped jobs as a green signal", async () => {
    const text = await buildBreakageNotification({
      github: fakeGithub({
        otherRuns: [{ run_number: 6, conclusion: "failure" }],
        jobs: [
          { name: "check-changes", conclusion: "success" },
          { name: "test", conclusion: "skipped" },
        ],
      }),
      context: {
        repo,
        payload: { workflow_run: { ...run, conclusion: "success" } },
      },
      core,
      authors: "",
      slackToken: "token",
    });
    assert.equal(text, null);
  });

  it("skips runs with skipped jobs when finding the previous state", async () => {
    const text = await buildBreakageNotification({
      github: fakeGithub({
        otherRuns: [
          { run_number: 6, conclusion: "success" },
          { run_number: 5, conclusion: "failure" },
        ],
        jobs: [{ name: "test", conclusion: "success" }],
        jobsByRunNumber: {
          6: [
            { name: "check-changes", conclusion: "success" },
            { name: "test", conclusion: "skipped" },
          ],
        },
      }),
      context: {
        repo,
        payload: { workflow_run: { ...run, conclusion: "success" } },
      },
      core,
      authors: "",
      slackToken: "token",
    });
    assert.match(text ?? "", /main is green again/);
  });

  it("posts recovery when a rerun turns the latest run green", async () => {
    const text = await buildBreakageNotification({
      github: fakeGithub({
        otherRuns: [{ run_number: 6, conclusion: "success" }],
        jobs: [{ name: "test", conclusion: "success" }],
        attempts: { 1: { conclusion: "failure" } },
      }),
      context: {
        repo,
        payload: {
          workflow_run: { ...run, conclusion: "success", run_attempt: 2 },
        },
      },
      core,
      authors: "",
      slackToken: "token",
    });
    assert.match(text ?? "", /main is green again/);
  });

  it("ignores a skipped-success attempt and falls back to run history", async () => {
    const text = await buildBreakageNotification({
      github: fakeGithub({
        otherRuns: [{ run_number: 6, conclusion: "failure" }],
        jobs: [{ name: "test", conclusion: "failure" }],
        attempts: { 1: { conclusion: "success" } },
        attemptJobs: {
          1: [
            { name: "check-changes", conclusion: "success" },
            { name: "test", conclusion: "skipped" },
          ],
        },
      }),
      context: {
        repo,
        payload: { workflow_run: { ...run, run_attempt: 2 } },
      },
      core,
      authors: "",
      slackToken: "token",
    });
    assert.equal(text, null);
  });

  it("finds the previous state behind a long stretch of skipped runs", async () => {
    const otherRuns = Array.from({ length: 60 }, (_, i) => ({
      run_number: 200 - i,
      conclusion: "success",
    }));
    otherRuns.push({ run_number: 140, conclusion: "failure" });
    const jobsByRunNumber = Object.fromEntries(
      otherRuns
        .filter((candidate) => candidate.conclusion === "success")
        .map((candidate) => [
          candidate.run_number,
          [
            { name: "check-changes", conclusion: "success" },
            { name: "test", conclusion: "skipped" },
          ],
        ])
    );
    const text = await buildBreakageNotification({
      github: fakeGithub({
        otherRuns,
        jobs: [{ name: "test", conclusion: "success" }],
        jobsByRunNumber,
      }),
      context: {
        repo,
        payload: {
          workflow_run: { ...run, run_number: 250, conclusion: "success" },
        },
      },
      core,
      authors: "",
      slackToken: "token",
    });
    assert.match(text ?? "", /main is green again/);
  });

  it("mentions the merger when Slack resolves the email", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: true, user: { id: "U42" } }), {
        status: 200,
      })) as typeof fetch;
    const text = await buildBreakageNotification({
      github: fakeGithub({
        otherRuns: [{ run_number: 6, conclusion: "success" }],
        pulls: [
          {
            number: 12,
            html_url: "https://github.com/dust-tt/dust/pull/12",
            merged_at: "2026-09-28T00:00:00Z",
          },
        ],
        mergedBy: "Merger",
      }),
      context: { repo, payload: { workflow_run: run } },
      core,
      authors: "merger: merger@dust.tt\n",
      slackToken: "token",
    });
    assert.match(text ?? "", /merged by <@U42>\./);
  });
});

const infraJobs: FakeJob[] = [
  {
    name: "Test Shard 3 of 6",
    conclusion: "failure",
    steps: [
      { name: "Setup Node Dependencies", conclusion: "success" },
      { name: "Install Postgres", conclusion: "failure" },
      { name: "Run Tests", conclusion: "skipped" },
    ],
  },
  { name: "Test Shard 1 of 6", conclusion: "success" },
];

async function notifyWith(
  github: ReturnType<typeof fakeGithub>,
  workflowRun: typeof run = run
) {
  return buildBreakageNotification({
    github,
    context: { repo, payload: { workflow_run: workflowRun } },
    core,
    authors: "",
    slackToken: "token",
    sleep: async () => {},
  });
}

describe("infra retry", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("stays silent when the retry of an infra failure passes", async () => {
    const github = fakeGithub({
      otherRuns: [{ run_number: 6, conclusion: "success" }],
      jobs: infraJobs,
      retryConclusion: "success",
    });
    assert.equal(await notifyWith(github), null);
    assert.equal(github.calls.reruns, 1);
  });

  it("reports the breakage when the retry fails too", async () => {
    globalThis.fetch = (async () =>
      new Response("", { status: 500 })) as typeof fetch;
    const github = fakeGithub({
      otherRuns: [{ run_number: 6, conclusion: "success" }],
      jobs: infraJobs,
      retryJobs: [
        { name: "Test Shard 3 of 6", conclusion: "failure" },
        { name: "Test Shard 1 of 6", conclusion: "success" },
      ],
      retryConclusion: "failure",
    });
    assert.match(
      (await notifyWith(github)) ?? "",
      /Failed jobs: Test Shard 3 of 6\. Failed again after an automatic retry\./
    );
  });

  it("stays silent when a newer run completes during the retry", async () => {
    const github = fakeGithub({
      otherRuns: [{ run_number: 6, conclusion: "success" }],
      otherRunsAfterRetry: [
        { run_number: 8, conclusion: "success" },
        { run_number: 6, conclusion: "success" },
      ],
      jobs: infraJobs,
      retryConclusion: "failure",
    });
    assert.equal(await notifyWith(github), null);
  });

  it("reports without claiming a retry when the retry is cancelled", async () => {
    globalThis.fetch = (async () =>
      new Response("", { status: 500 })) as typeof fetch;
    const github = fakeGithub({
      otherRuns: [{ run_number: 6, conclusion: "success" }],
      jobs: infraJobs,
      retryConclusion: "cancelled",
    });
    const text = (await notifyWith(github)) ?? "";
    assert.match(text, /main is broken/);
    assert.doesNotMatch(text, /automatic retry/);
  });

  it("reports without claiming a retry when the retry never completes", async () => {
    globalThis.fetch = (async () =>
      new Response("", { status: 500 })) as typeof fetch;
    const github = fakeGithub({
      otherRuns: [{ run_number: 6, conclusion: "success" }],
      jobs: infraJobs,
    });
    const text = (await notifyWith(github)) ?? "";
    assert.match(text, /main is broken/);
    assert.doesNotMatch(text, /automatic retry/);
  });

  it("does not retry a failure outside the setup steps", async () => {
    globalThis.fetch = (async () =>
      new Response("", { status: 500 })) as typeof fetch;
    const github = fakeGithub({
      otherRuns: [{ run_number: 6, conclusion: "success" }],
      jobs: [
        ...infraJobs,
        {
          name: "Test Shard 5 of 6",
          conclusion: "failure",
          steps: [
            { name: "Install Postgres", conclusion: "success" },
            { name: "Run Tests", conclusion: "failure" },
          ],
        },
      ],
    });
    assert.match((await notifyWith(github)) ?? "", /main is broken/);
    assert.equal(github.calls.reruns, 0);
  });

  it("does not retry a manual rerun", async () => {
    globalThis.fetch = (async () =>
      new Response("", { status: 500 })) as typeof fetch;
    const github = fakeGithub({
      otherRuns: [{ run_number: 6, conclusion: "success" }],
      jobs: infraJobs,
      attempts: { 1: { conclusion: "success" } },
    });
    assert.match(
      (await notifyWith(github, { ...run, run_attempt: 2 })) ?? "",
      /main is broken/
    );
    assert.equal(github.calls.reruns, 0);
  });

  it("stays silent on the attempt started by the automatic retry", async () => {
    const github = fakeGithub({
      otherRuns: [{ run_number: 6, conclusion: "success" }],
      jobs: [{ name: "test", conclusion: "success" }],
      attempts: { 1: { conclusion: "failure" } },
    });
    const text = await notifyWith(github, {
      ...run,
      conclusion: "success",
      run_attempt: 2,
      triggering_actor: { login: "github-actions[bot]" },
    });
    assert.equal(text, null);
  });

  it("posts recovery when the retried attempt outlives the retrying job", async () => {
    const github = fakeGithub({
      otherRuns: [{ run_number: 6, conclusion: "success" }],
      jobs: [{ name: "test", conclusion: "success" }],
      attempts: { 1: { conclusion: "failure" } },
    });
    const text = await notifyWith(github, {
      ...run,
      conclusion: "success",
      run_attempt: 2,
      triggering_actor: { login: "github-actions[bot]" },
      run_started_at: "2026-09-28T12:00:00Z",
      updated_at: "2026-09-28T12:50:00Z",
    });
    assert.match(text ?? "", /main is green again/);
  });
});
