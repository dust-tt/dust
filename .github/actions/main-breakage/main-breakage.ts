import { escapeSlackText, resolveSlackMentions } from "../lib/slack.ts";

type Repository = { owner: string; repo: string };

type WorkflowRun = {
  id: number;
  run_number: number;
  run_attempt: number;
  workflow_id: number;
  created_at: string;
  name: string | null;
  conclusion: string | null;
  head_sha: string;
  html_url: string;
  head_commit: { message: string } | null;
  actor: { login: string } | null;
};

type Job = { name: string; conclusion: string | null };

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
            created: string;
            per_page: number;
          }
        ): Promise<{
          data: {
            workflow_runs: Array<{
              id: number;
              run_number: number;
              created_at: string;
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

// How far back the run history search can see; the run-ordering contract depends on these values.
const RUN_LOOKBACK = 100;
const RUN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
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

type PreviousState =
  | { superseded: true }
  | { superseded: false; previous: Conclusion | null };

/**
 * @cc [label:product] main-breakage-run-ordering
 * Runs complete out of order: a completed signal run newer than the current one MUST silence it.
 * Otherwise, unless a previous attempt of the current run supplies the comparison state, it is
 * the newest older signal run within the 100 most recent runs, created at most 7 days before
 * the current one. A signal past that window is invisible by design; its transition MUST be
 * dropped silently, never guessed.
 */
/**
 * @cc [label:product] main-breakage-reruns
 * A rerun keeps its run number, so its comparison state MUST be its immediately previous attempt
 * when that attempt carries a signal (otherwise recovery-by-rerun would stay silent forever), and
 * the previous-run lookup when it does not.
 */
async function getPreviousState({
  github,
  context,
}: Pick<BreakageOptions, "github" | "context">): Promise<PreviousState> {
  const run = context.payload.workflow_run;
  const oldestAllowed = Date.parse(run.created_at) - RUN_MAX_AGE_MS;
  const { data } = await github.rest.actions.listWorkflowRuns({
    ...context.repo,
    workflow_id: run.workflow_id,
    branch: "main",
    // No status filter: GitHub serves inconsistent, sometimes weeks-old pages with it, while
    // in-progress runs are dropped below by their missing conclusion anyway. A creation-date
    // filter is reported to avoid those stale pages.
    created: `>=${new Date(oldestAllowed).toISOString()}`,
    per_page: RUN_LOOKBACK,
  });
  // The server-side date filter is not trusted alone: an old failure served anyway must not pass
  // for the previous state.
  const completed = data.workflow_runs.filter(
    (candidate) =>
      candidate.run_number !== run.run_number &&
      Date.parse(candidate.created_at) >= oldestAllowed &&
      (candidate.conclusion === "success" || candidate.conclusion === "failure")
  );

  const newer = completed
    .filter((candidate) => candidate.run_number > run.run_number)
    .sort((a, b) => b.run_number - a.run_number);
  if ((await findSignalConclusion({ github, context }, newer)) !== null) {
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
  return (
    `:rotating_light: *main is broken*: ${workflow} failed on ${commit}${prPart}${mergedBy}.` +
    `${jobs} <${escapeSlackText(run.html_url)}|See the run>.`
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
}: BreakageOptions): Promise<string | null> {
  const run = context.payload.workflow_run;
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
    failedJobs: jobsData.jobs
      .filter((job) => job.conclusion === "failure")
      .map((job) => job.name),
    pr,
    merger,
    mention: merger ? (mentions.get(merger.toLowerCase()) ?? null) : null,
  });
}
