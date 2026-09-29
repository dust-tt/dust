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
const INFRA_STEPS = new Set([
  "Set up job",
  "Initialize containers",
  "Checkout",
  "Setup Node Dependencies",
  "Install Postgres",
  "Install Redis",
  "Install Protoc",
  "Install Sandbox",
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
 * A first-attempt breakage counts as infra only when every failed job's first failed step
 * prepares the runner; any other or unknown failed step MUST notify without a retry. An infra
 * breakage MUST be retried once and stay silent unless the retry fails too and no newer run has
 * completed meanwhile. A retry that does not complete in time MUST notify as if never retried.
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

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Returns the conclusion of the retried attempt, or null when it did not complete in time.
async function retryFailedJobs({
  github,
  context,
  core,
  sleep = defaultSleep,
}: Pick<BreakageOptions, "github" | "context" | "core" | "sleep">): Promise<
  string | null
> {
  const run = context.payload.workflow_run;
  await github.rest.actions.reRunWorkflowFailedJobs({
    ...context.repo,
    run_id: run.id,
  });
  core.info(`Retrying the failed jobs of ${run.name} run ${run.id}.`);
  for (let waited = 0; waited < RETRY_TIMEOUT_MS; waited += RETRY_POLL_MS) {
    await sleep(RETRY_POLL_MS);
    const { data } = await github.rest.actions.getWorkflowRun({
      ...context.repo,
      run_id: run.id,
    });
    if (data.run_attempt > run.run_attempt && data.status === "completed") {
      return data.conclusion;
    }
  }
  core.warning(
    `The retry of ${run.name} run ${run.id} did not complete in time.`
  );
  return null;
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
 * stay silent: the job that started it waits for it and reports its outcome.
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
  retried?: boolean;
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
  retried = false,
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
  const retry = retried ? " Failed again after an automatic retry." : "";
  return (
    `:rotating_light: *main is broken*: ${workflow} failed on ${commit}${prPart}${mergedBy}.` +
    `${jobs}${retry} <${escapeSlackText(run.html_url)}|See the run>.`
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
}: BreakageOptions): Promise<string | null> {
  const run = context.payload.workflow_run;
  if (run.run_attempt > 1 && run.triggering_actor?.login === RETRY_ACTOR) {
    core.info(
      `No notification: the job that retried ${run.name} reports its outcome.`
    );
    return null;
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
  let retried = false;
  if (run.run_attempt === 1 && isInfraFailure(jobs)) {
    const conclusion = await retryFailedJobs({ github, context, core, sleep });
    if (conclusion === "failure") {
      const completed = await listCompletedRuns({ github, context });
      if (await isSuperseded({ github, context }, completed)) {
        core.info(
          `No notification: a newer ${run.name} run completed during the retry.`
        );
        return null;
      }
      const { data } = await github.rest.actions.listJobsForWorkflowRun({
        ...context.repo,
        run_id: run.id,
        per_page: JOBS_PER_PAGE,
      });
      jobs = data.jobs;
      retried = true;
    } else if (conclusion !== null) {
      core.info(
        `No notification: ${run.name} concluded ${conclusion} after a retry.`
      );
      return null;
    }
  }

  const { pr, merger } = await getMergedPullRequest({ github, context });
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
    retried,
  });
}
