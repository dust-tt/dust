import { escapeSlackText, resolveSlackMentions } from "../lib/slack.ts";

type Repository = { owner: string; repo: string };

type WorkflowRun = {
  id: number;
  run_number: number;
  run_attempt: number;
  workflow_id: number;
  name: string | null;
  conclusion: string | null;
  head_sha: string;
  html_url: string;
  head_commit: { message: string } | null;
  actor: { login: string } | null;
  triggering_actor: { login: string } | null;
  run_started_at: string;
  updated_at: string;
};

type Step = { name: string; conclusion: string | null };

type Job = { name: string; conclusion: string | null; steps?: Step[] };

type BreakageContext = {
  repo: Repository;
  payload: { workflow_run: WorkflowRun };
};

type BreakageOptions = {
  github: {
    rest: {
      actions: {
        listWorkflowRuns(
          params: Repository & {
            workflow_id: number;
            branch: string;
            per_page: number;
          }
        ): Promise<{
          data: {
            workflow_runs: Array<{
              id: number;
              run_number: number;
              conclusion: string | null;
            }>;
          };
        }>;
        listJobsForWorkflowRun(
          params: Repository & { run_id: number; per_page: number }
        ): Promise<{ data: { jobs: Job[] } }>;
        listJobsForWorkflowRunAttempt(
          params: Repository & {
            run_id: number;
            attempt_number: number;
            per_page: number;
          }
        ): Promise<{ data: { jobs: Job[] } }>;
        getWorkflowRunAttempt(
          params: Repository & { run_id: number; attempt_number: number }
        ): Promise<{ data: { conclusion: string | null } }>;
        getWorkflowRun(params: Repository & { run_id: number }): Promise<{
          data: {
            run_attempt: number;
            status: string | null;
            conclusion: string | null;
            run_started_at: string;
            updated_at: string;
          };
        }>;
        reRunWorkflowFailedJobs(
          params: Repository & { run_id: number }
        ): Promise<unknown>;
      };
      repos: {
        listPullRequestsAssociatedWithCommit(
          params: Repository & { commit_sha: string }
        ): Promise<{
          data: Array<{
            number: number;
            html_url: string;
            merged_at: string | null;
          }>;
        }>;
      };
      pulls: {
        get(params: Repository & { pull_number: number }): Promise<{
          data: { merged_by: { login: string } | null };
        }>;
      };
    };
  };
  context: BreakageContext;
  core: {
    info(message: string): void;
    warning(message: string): void;
  };
  authors: string;
  slackToken: string;
  sleep?: (ms: number) => Promise<void>;
  nowMs?: () => number;
};

// A run conclusion that carries information about main's state, as opposed to the raw
// `string | null` GitHub reports, which also holds values like "cancelled" or "skipped".
type Conclusion = "success" | "failure";

export type Transition = "broken" | "recovered";

/**
 * @cc [label:product] main-breakage-transitions
 * success→failure MUST notify "broken" and failure→success MUST notify "recovered"; any other
 * pair, including a missing predecessor, MUST stay silent.
 */
export function getTransition(
  previous: Conclusion | null,
  current: string | null
): Transition | null {
  if (previous === null) {
    return null;
  }
  if (current === "failure" && previous === "success") {
    return "broken";
  }
  if (current === "success" && previous === "failure") {
    return "recovered";
  }
  return null;
}

/**
 * @cc [label:product] main-breakage-skipped-runs
 * A `success` run or rerun attempt counts as a green signal only when at least one job ran and
 * none were skipped: a path-gated workflow concludes `success` without testing anything, and such
 * a conclusion MUST neither notify nor serve as a comparison state.
 */
function isSignal(conclusion: string | null, jobs: Job[]): boolean {
  switch (conclusion) {
    case "failure":
      return true;
    case "success":
      return (
        jobs.length > 0 && jobs.every((job) => job.conclusion !== "skipped")
      );
    default:
      return false;
  }
}

// How far back the run history search can see; the run-ordering contract depends on this value.
const RUN_LOOKBACK = 100;
// One page holds every job of a run for the workflows we watch.
const JOBS_PER_PAGE = 100;

async function findSignalConclusion(
  { github, context }: Pick<BreakageOptions, "github" | "context">,
  candidates: Array<{ id: number; conclusion: string | null }>
): Promise<Conclusion | null> {
  for (const candidate of candidates) {
    if (candidate.conclusion === "failure") {
      return "failure";
    }
    const { data } = await github.rest.actions.listJobsForWorkflowRun({
      ...context.repo,
      run_id: candidate.id,
      per_page: JOBS_PER_PAGE,
    });
    if (isSignal(candidate.conclusion, data.jobs)) {
      return "success";
    }
  }
  return null;
}

async function getAttemptConclusion({
  github,
  context,
}: Pick<BreakageOptions, "github" | "context">): Promise<Conclusion | null> {
  const run = context.payload.workflow_run;
  const attempt_number = run.run_attempt - 1;
  const { data: prior } = await github.rest.actions.getWorkflowRunAttempt({
    ...context.repo,
    run_id: run.id,
    attempt_number,
  });
  switch (prior.conclusion) {
    case "failure":
      return "failure";
    case "success": {
      const { data } = await github.rest.actions.listJobsForWorkflowRunAttempt({
        ...context.repo,
        run_id: run.id,
        attempt_number,
        per_page: JOBS_PER_PAGE,
      });
      return isSignal(prior.conclusion, data.jobs) ? "success" : null;
    }
    default:
      return null;
  }
}

// Steps that only prepare the runner, so their failure says nothing about the code under test.
// A composite step that also builds repository code is reported as one step, so it stays out.
const INFRA_STEPS = new Set([
  "Set up job",
  "Initialize containers",
  "Checkout",
  "Install Postgres",
  "Install Redis",
  "Install Protoc",
  "Install Sandbox",
  "Install Frame lint tools",
  "Install minimal stable",
  "Install Grit CLI",
  "Setup Rust Cache",
]);
const INFRA_STEP_PREFIXES = [
  "Run actions/checkout@",
  "Build dust-tt/postgresql-action@",
];

function isInfraStep(name: string): boolean {
  return (
    INFRA_STEPS.has(name) ||
    INFRA_STEP_PREFIXES.some((prefix) => name.startsWith(prefix))
  );
}

/**
 * @cc [label:product] main-breakage-infra-retry
 * A first-attempt breakage MUST be retried once when every failed job first failed on a
 * runner-preparation step, and notify without a retry otherwise. Only a successful retry
 * silences it: any other outcome, including a timeout or an error while retrying, notifies unless
 * a newer signal run completed meanwhile, and only a second failure is reported as retried. A
 * GitHub API error during the retry or the lookups that follow it MUST NOT drop the notification.
 */
function isInfraFailure(jobs: Job[]): boolean {
  const failed = jobs.filter((job) => job.conclusion === "failure");
  return (
    failed.length > 0 &&
    failed.every((job) => {
      const step = job.steps?.find((s) => s.conclusion === "failure");
      return step !== undefined && isInfraStep(step.name);
    })
  );
}

// The token behind the automatic retry; its rerun attempts are followed by the job that started them.
const RETRY_ACTOR = "github-actions[bot]";
const RETRY_POLL_MS = 30_000;
const RETRY_TIMEOUT_MS = 45 * 60_000;
// Bounds how long after the rerun request its attempt can start, for when polls cannot see it.
const RETRY_START_GRACE_MS = 5 * 60_000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The retrying job and the retried attempt both decide who reports the attempt from this single
// measure, so exactly one of them does.
function isWithinRetryPoll(
  attempt: Pick<WorkflowRun, "run_started_at" | "updated_at">
): boolean {
  const durationMs =
    Date.parse(attempt.updated_at) - Date.parse(attempt.run_started_at);
  return !(durationMs >= RETRY_TIMEOUT_MS);
}

type RetryOutcome = {
  // Null when no attempt concluded within the poll cap.
  conclusion: string | null;
  // Set when the last poll failed, so the attempt may have concluded unseen within the cap.
  unconfirmed: boolean;
};

async function retryFailedJobs({
  github,
  context,
  core,
  sleep = defaultSleep,
  nowMs = Date.now,
}: Pick<
  BreakageOptions,
  "github" | "context" | "core" | "sleep" | "nowMs"
>): Promise<RetryOutcome> {
  const run = context.payload.workflow_run;
  try {
    await github.rest.actions.reRunWorkflowFailedJobs({
      ...context.repo,
      run_id: run.id,
    });
  } catch (error) {
    core.warning(`Could not retry ${run.name} run ${run.id}: ${String(error)}`);
    return { conclusion: null, unconfirmed: false };
  }
  core.info(`Retrying the failed jobs of ${run.name} run ${run.id}.`);
  const requestedAtMs = nowMs();
  let startedAtMs: number | null = null;
  let lastPollFailed = false;
  // A failed poll must not end the wait early: a short attempt stays silent on its own, so this
  // job has to keep watching until the attempt has run for the whole cap.
  for (;;) {
    await sleep(RETRY_POLL_MS);
    lastPollFailed = false;
    try {
      const { data } = await github.rest.actions.getWorkflowRun({
        ...context.repo,
        run_id: run.id,
      });
      if (data.run_attempt > run.run_attempt) {
        if (data.status === "completed") {
          if (isWithinRetryPoll(data)) {
            return { conclusion: data.conclusion, unconfirmed: false };
          }
          break;
        }
        startedAtMs = Date.parse(data.run_started_at);
      }
    } catch (error) {
      lastPollFailed = true;
      core.warning(
        `Could not poll the retry of ${run.name} run ${run.id}: ${String(error)}`
      );
    }
    const deadlineMs =
      (startedAtMs ?? requestedAtMs + RETRY_START_GRACE_MS) + RETRY_TIMEOUT_MS;
    if (!(nowMs() < deadlineMs)) {
      break;
    }
  }
  core.warning(
    `The retry of ${run.name} run ${run.id} did not complete in time.`
  );
  return { conclusion: null, unconfirmed: lastPollFailed };
}

async function isSuperseded(
  { github, context }: Pick<BreakageOptions, "github" | "context">,
  completed: Array<{
    id: number;
    run_number: number;
    conclusion: string | null;
  }>
): Promise<boolean> {
  const run = context.payload.workflow_run;
  const newer = completed
    .filter((candidate) => candidate.run_number > run.run_number)
    .sort((a, b) => b.run_number - a.run_number);
  return (await findSignalConclusion({ github, context }, newer)) !== null;
}

async function listCompletedRuns({
  github,
  context,
}: Pick<BreakageOptions, "github" | "context">) {
  const run = context.payload.workflow_run;
  const { data } = await github.rest.actions.listWorkflowRuns({
    ...context.repo,
    workflow_id: run.workflow_id,
    branch: "main",
    // No status filter: GitHub serves inconsistent, sometimes weeks-old pages with it, while
    // in-progress runs are dropped below by their missing conclusion anyway.
    per_page: RUN_LOOKBACK,
  });
  return data.workflow_runs.filter(
    (candidate) =>
      candidate.run_number !== run.run_number &&
      (candidate.conclusion === "success" || candidate.conclusion === "failure")
  );
}

type PreviousState =
  | { superseded: true }
  | { superseded: false; previous: Conclusion | null };

/**
 * @cc [label:product] main-breakage-run-ordering
 * Runs complete out of order: a completed signal run newer than the current one MUST silence it.
 * Otherwise, unless a previous attempt of the current run supplies the comparison state, it is
 * the newest older signal run within the 100 most recent runs. A signal past that
 * window is invisible by design; its transition MUST be dropped silently, never guessed.
 */
/**
 * @cc [label:product] main-breakage-reruns
 * A rerun keeps its run number, so its comparison state MUST be its immediately previous attempt
 * when that attempt carries a signal (otherwise recovery-by-rerun would stay silent forever), and
 * the previous-run lookup when it does not. An attempt started by the automatic infra retry MUST
 * stay silent when its own start-to-completion time is under the poll cap, and MUST report its own
 * transition otherwise; the job that started it MUST report its outcome in exactly the first case,
 * so it MUST keep polling through API errors until that cap has passed. When its last poll at the
 * cap fails, the outcome is unknown: it MUST still report the breakage, flagged as unconfirmed,
 * accepting that a quick success of the attempt leaves that alert without a recovery.
 */
async function getPreviousState({
  github,
  context,
}: Pick<BreakageOptions, "github" | "context">): Promise<PreviousState> {
  const run = context.payload.workflow_run;
  const completed = await listCompletedRuns({ github, context });
  if (await isSuperseded({ github, context }, completed)) {
    return { superseded: true };
  }

  if (run.run_attempt > 1) {
    const previous = await getAttemptConclusion({ github, context });
    if (previous !== null) {
      return { superseded: false, previous };
    }
  }

  const older = completed
    .filter((candidate) => candidate.run_number < run.run_number)
    .sort((a, b) => b.run_number - a.run_number);
  return {
    superseded: false,
    previous: await findSignalConclusion({ github, context }, older),
  };
}

type BreakageDetails = {
  transition: Transition;
  run: Pick<WorkflowRun, "name" | "head_sha" | "html_url" | "head_commit">;
  repo: Repository;
  failedJobs: string[];
  pr: { number: number; html_url: string } | null;
  merger: string | null;
  mention: string | null;
  retry?: "failed" | "unconfirmed";
};

/**
 * @cc [label:security] main-breakage-slack-format
 * Every value copied from GitHub into the message MUST go through Slack escaping. Only the
 * resolved merger mention may be inserted as a Slack control sequence.
 */
export function formatBreakageMessage({
  transition,
  run,
  repo,
  failedJobs,
  pr,
  merger,
  mention,
  retry,
}: BreakageDetails): string {
  const shortSha = run.head_sha.slice(0, 7);
  const title = run.head_commit?.message.split("\n")[0] ?? shortSha;
  const commitUrl = `https://github.com/${repo.owner}/${repo.repo}/commit/${run.head_sha}`;
  const commit = `<${commitUrl}|${shortSha} ${escapeSlackText(title)}>`;
  const workflow = escapeSlackText(run.name ?? "A workflow");

  if (transition === "recovered") {
    return `:white_check_mark: *main is green again*: ${workflow} passed on ${commit}.`;
  }

  const who = mention ?? (merger ? escapeSlackText(`@${merger}`) : null);
  const prPart = pr ? ` (<${escapeSlackText(pr.html_url)}|#${pr.number}>)` : "";
  const mergedBy = who ? ` merged by ${who}` : "";
  const jobs =
    failedJobs.length > 0
      ? ` Failed jobs: ${failedJobs.map(escapeSlackText).join(", ")}.`
      : "";
  const retryNote =
    retry === "failed"
      ? " Failed again after an automatic retry."
      : retry === "unconfirmed"
        ? " The outcome of an automatic retry could not be read."
        : "";
  return (
    `:rotating_light: *main is broken*: ${workflow} failed on ${commit}${prPart}${mergedBy}.` +
    `${jobs}${retryNote} <${escapeSlackText(run.html_url)}|See the run>.`
  );
}

async function getMergedPullRequest({
  github,
  context,
}: Pick<BreakageOptions, "github" | "context">): Promise<{
  pr: { number: number; html_url: string } | null;
  merger: string | null;
}> {
  const run = context.payload.workflow_run;
  const { data: pulls } =
    await github.rest.repos.listPullRequestsAssociatedWithCommit({
      ...context.repo,
      commit_sha: run.head_sha,
    });
  const merged = pulls.find((pull) => pull.merged_at !== null);
  if (!merged) {
    return { pr: null, merger: run.actor?.login ?? null };
  }
  const { data: pr } = await github.rest.pulls.get({
    ...context.repo,
    pull_number: merged.number,
  });
  return {
    pr: { number: merged.number, html_url: merged.html_url },
    merger: pr.merged_by?.login ?? run.actor?.login ?? null,
  };
}

/**
 * Returns the Slack message text for this run, or null when main did not change state.
 */
export async function buildBreakageNotification({
  github,
  context,
  core,
  authors,
  slackToken,
  sleep,
  nowMs,
}: BreakageOptions): Promise<string | null> {
  const run = context.payload.workflow_run;
  if (run.run_attempt > 1 && run.triggering_actor?.login === RETRY_ACTOR) {
    if (isWithinRetryPoll(run)) {
      core.info(
        `No notification: the job that retried ${run.name} reports its outcome.`
      );
      return null;
    }
    core.info(
      `Reporting ${run.name} attempt ${run.run_attempt} itself: it outlived the retrying job.`
    );
  }
  const { data: jobsData } = await github.rest.actions.listJobsForWorkflowRun({
    ...context.repo,
    run_id: run.id,
    per_page: JOBS_PER_PAGE,
  });
  if (!isSignal(run.conclusion, jobsData.jobs)) {
    core.info(
      `No notification: ${run.name} concluded ${run.conclusion} without running its jobs.`
    );
    return null;
  }

  const state = await getPreviousState({ github, context });
  if (state.superseded) {
    core.info(`No notification: a newer ${run.name} run already completed.`);
    return null;
  }
  const transition = getTransition(state.previous, run.conclusion);
  if (!transition) {
    core.info(
      `No notification: ${run.name} went from ${state.previous ?? "nothing"} to ${run.conclusion}.`
    );
    return null;
  }

  if (transition === "recovered") {
    return formatBreakageMessage({
      transition,
      run,
      repo: context.repo,
      failedJobs: [],
      pr: null,
      merger: null,
      mention: null,
    });
  }

  let jobs = jobsData.jobs;
  let retry: BreakageDetails["retry"];
  if (run.run_attempt === 1 && isInfraFailure(jobs)) {
    const { conclusion, unconfirmed } = await retryFailedJobs({
      github,
      context,
      core,
      sleep,
      nowMs,
    });
    if (conclusion === "success") {
      core.info(`No notification: ${run.name} succeeded after a retry.`);
      return null;
    }
    if (unconfirmed) {
      retry = "unconfirmed";
    }
    // A failed refresh falls back to reporting the original failure rather than dropping it.
    try {
      const completed = await listCompletedRuns({ github, context });
      if (await isSuperseded({ github, context }, completed)) {
        core.info(
          `No notification: a newer ${run.name} run completed during the retry.`
        );
        return null;
      }
      if (conclusion === "failure") {
        const { data } = await github.rest.actions.listJobsForWorkflowRun({
          ...context.repo,
          run_id: run.id,
          per_page: JOBS_PER_PAGE,
        });
        jobs = data.jobs;
        retry = "failed";
      }
    } catch (error) {
      core.warning(
        `Could not refresh ${run.name} run ${run.id} after the retry: ${String(error)}`
      );
    }
  }

  // Attribution is optional: a failed lookup must not drop the alert.
  const { pr, merger } = await getMergedPullRequest({ github, context }).catch(
    (error) => {
      core.warning(
        `Could not find the pull request of ${run.head_sha}: ${String(error)}`
      );
      return { pr: null, merger: run.actor?.login ?? null };
    }
  );
  const mentions = merger
    ? await resolveSlackMentions({
        handles: [merger],
        authors,
        slackToken,
        core,
      })
    : new Map<string, string>();
  return formatBreakageMessage({
    transition,
    run,
    repo: context.repo,
    failedJobs: jobs
      .filter((job) => job.conclusion === "failure")
      .map((job) => job.name),
    pr,
    merger,
    mention: merger ? (mentions.get(merger.toLowerCase()) ?? null) : null,
    retry,
  });
}
