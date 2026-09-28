import {
  escapeSlackText,
  resolveSlackMentions,
} from "../review-bot/review-bot.ts";

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
            status: "completed";
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

export type Transition = "broken" | "recovered";

/**
 * @cc [label:product] main-breakage-transitions
 * Notify only when main changes state: the first failure after a success is "broken" and the
 * first success after a failure is "recovered". Repeated failures or successes MUST stay silent,
 * and a run with no completed success-or-failure predecessor MUST NOT notify.
 */
export function getTransition(
  previous: string | null,
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
 * A path-gated workflow concludes `success` when its gate skips every real job, without testing
 * anything. Such a run MUST NOT count as a green signal: it MUST neither notify nor serve as the
 * state another run is compared against. A success counts only when at least one job ran and none
 * were skipped.
 */
function isSignal(conclusion: string | null, jobs: Job[]): boolean {
  if (conclusion === "failure") {
    return true;
  }
  if (conclusion !== "success") {
    return false;
  }
  return jobs.length > 0 && jobs.every((job) => job.conclusion !== "skipped");
}

async function findSignalConclusion(
  { github, context }: Pick<BreakageOptions, "github" | "context">,
  candidates: Array<{ id: number; conclusion: string | null }>
): Promise<string | null> {
  for (const candidate of candidates) {
    if (candidate.conclusion === "failure") {
      return "failure";
    }
    const { data } = await github.rest.actions.listJobsForWorkflowRun({
      ...context.repo,
      run_id: candidate.id,
      per_page: 100,
    });
    if (isSignal(candidate.conclusion, data.jobs)) {
      return "success";
    }
  }
  return null;
}

type PreviousState =
  | { superseded: true }
  | { superseded: false; previous: string | null };

/**
 * @cc [label:product] main-breakage-run-ordering
 * Runs complete out of order. When a signal run newer than the current one has already completed,
 * the current run MUST stay silent: the newer run defines main's state. Otherwise the previous
 * state is the newest signal run older than the current one, regardless of completion order.
 */
/**
 * @cc [label:product] main-breakage-reruns
 * A rerun keeps its run number, so its state change MUST be computed against its own most recent
 * success-or-failure attempt rather than against the previous run; comparing to the previous run
 * would keep recovery-by-rerun silent forever.
 */
async function getPreviousState({
  github,
  context,
}: Pick<BreakageOptions, "github" | "context">): Promise<PreviousState> {
  const run = context.payload.workflow_run;
  const { data } = await github.rest.actions.listWorkflowRuns({
    ...context.repo,
    workflow_id: run.workflow_id,
    branch: "main",
    status: "completed",
    per_page: 20,
  });
  const completed = data.workflow_runs.filter(
    (candidate) =>
      candidate.conclusion === "success" || candidate.conclusion === "failure"
  );

  const newer = completed
    .filter((candidate) => candidate.run_number > run.run_number)
    .sort((a, b) => b.run_number - a.run_number);
  if ((await findSignalConclusion({ github, context }, newer)) !== null) {
    return { superseded: true };
  }

  for (let attempt = run.run_attempt - 1; attempt >= 1; attempt--) {
    const { data: prior } = await github.rest.actions.getWorkflowRunAttempt({
      ...context.repo,
      run_id: run.id,
      attempt_number: attempt,
    });
    if (prior.conclusion === "success" || prior.conclusion === "failure") {
      return { superseded: false, previous: prior.conclusion };
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
 * Returns the state change and its Slack message text, or null when main did not change state.
 */
export async function buildBreakageNotification({
  github,
  context,
  core,
  authors,
  slackToken,
}: BreakageOptions): Promise<{ transition: Transition; text: string } | null> {
  const run = context.payload.workflow_run;
  const { data: jobsData } = await github.rest.actions.listJobsForWorkflowRun({
    ...context.repo,
    run_id: run.id,
    per_page: 100,
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
    return {
      transition,
      text: formatBreakageMessage({
        transition,
        run,
        repo: context.repo,
        failedJobs: [],
        pr: null,
        merger: null,
        mention: null,
      }),
    };
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
  return {
    transition,
    text: formatBreakageMessage({
      transition,
      run,
      repo: context.repo,
      failedJobs: jobsData.jobs
        .filter((job) => job.conclusion === "failure")
        .map((job) => job.name),
      pr,
      merger,
      mention: merger ? (mentions.get(merger.toLowerCase()) ?? null) : null,
    }),
  };
}
