import {
  escapeSlackText,
  resolveSlackMentions,
} from "../review-bot/review-bot.ts";

type Repository = { owner: string; repo: string };

type WorkflowRun = {
  id: number;
  run_number: number;
  workflow_id: number;
  name: string | null;
  conclusion: string | null;
  head_sha: string;
  html_url: string;
  head_commit: { message: string } | null;
  actor: { login: string } | null;
};

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
        ): Promise<{
          data: { jobs: Array<{ name: string; conclusion: string | null }> };
        }>;
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

async function getPreviousConclusion({
  github,
  context,
}: Pick<BreakageOptions, "github" | "context">): Promise<string | null> {
  const run = context.payload.workflow_run;
  const { data } = await github.rest.actions.listWorkflowRuns({
    ...context.repo,
    workflow_id: run.workflow_id,
    branch: "main",
    status: "completed",
    per_page: 20,
  });
  // Older runs can finish after newer ones, so order by run number rather than completion.
  const previous = data.workflow_runs
    .filter(
      (candidate) =>
        candidate.run_number < run.run_number &&
        (candidate.conclusion === "success" ||
          candidate.conclusion === "failure")
    )
    .sort((a, b) => b.run_number - a.run_number)[0];
  return previous?.conclusion ?? null;
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
  const previous = await getPreviousConclusion({ github, context });
  const transition = getTransition(previous, run.conclusion);
  if (!transition) {
    core.info(
      `No notification: ${run.name} went from ${previous ?? "nothing"} to ${run.conclusion}.`
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

  const [{ data: jobs }, { pr, merger }] = await Promise.all([
    github.rest.actions.listJobsForWorkflowRun({
      ...context.repo,
      run_id: run.id,
      per_page: 100,
    }),
    getMergedPullRequest({ github, context }),
  ]);
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
    failedJobs: jobs.jobs
      .filter((job) => job.conclusion === "failure")
      .map((job) => job.name),
    pr,
    merger,
    mention: merger ? (mentions.get(merger.toLowerCase()) ?? null) : null,
  });
}
