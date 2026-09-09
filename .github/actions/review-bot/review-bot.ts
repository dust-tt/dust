type Repository = { owner: string; repo: string };
type PullRequestParams = Repository & { pull_number: number };

type ReviewContext = {
  actor: string;
  repo: Repository;
  eventName: string;
  payload: {
    sender?: { type: string };
    action?: string;
    pull_request?: { number: number; body?: string | null };
    issue?: { number: number; pull_request?: unknown };
    comment?: { body?: string | null };
    review?: { body?: string | null };
    changes?: {
      body?: { from?: string | null };
      title?: { from?: string };
    };
  };
};

type ReviewBotOptions = {
  github: {
    rest: {
      repos: {
        getCollaboratorPermissionLevel(
          params: Repository & { username: string }
        ): Promise<{ data: { permission: string } }>;
      };
      pulls: {
        get(
          params: PullRequestParams
        ): Promise<{ data: { state: string; user: { login: string } } }>;
        requestReviewers(
          params: PullRequestParams & { reviewers: string[] }
        ): Promise<unknown>;
      };
    };
  };
  context: ReviewContext;
  core: {
    info(message: string): void;
    warning(message: string): void;
  };
};

/**
 * @cc [label:product] review-request-syntax
 * Parse the leading list of GitHub mentions after a column-zero `r?` followed by whitespace on each
 * line. Trailing prose ends the list. Ignore fenced code and HTML comments, and deduplicate handles
 * case-insensitively.
 */
export function parseReviewers(body: string | null | undefined): string[] {
  const reviewers = new Set<string>();
  let fence: string | undefined;
  for (const line of (body ?? "")
    .replace(/<!--[\s\S]*?(?:-->|$)/g, (comment) =>
      comment.replace(/[^\r\n]/g, " ")
    )
    .split(/\r?\n/)) {
    const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (
        delimiter &&
        delimiter[1][0] === fence[0] &&
        delimiter[1].length >= fence.length &&
        !delimiter[2].trim()
      ) {
        fence = undefined;
      }
      continue;
    }
    if (delimiter) {
      fence = delimiter[1];
      continue;
    }

    const request = /^r\?[ \t]+(.*)$/.exec(line);
    if (!request) {
      continue;
    }
    for (const token of request[1].split(/[ \t]+/)) {
      if (!/^@[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(token)) {
        break;
      }
      reviewers.add(token.slice(1).toLowerCase());
    }
  }
  return [...reviewers];
}

function getRequest(context: ReviewContext) {
  const { eventName, payload } = context;
  if (
    eventName === "pull_request_target" &&
    payload.pull_request &&
    (payload.action === "opened" ||
      (payload.action === "edited" &&
        Object.hasOwn(payload.changes?.body ?? {}, "from")))
  ) {
    return {
      number: payload.pull_request.number,
      body: payload.pull_request.body,
    };
  }
  if (
    eventName === "issue_comment" &&
    payload.action === "created" &&
    payload.issue?.pull_request
  ) {
    return { number: payload.issue.number, body: payload.comment?.body };
  }
  if (
    eventName === "pull_request_review_comment" &&
    payload.pull_request &&
    payload.action === "created"
  ) {
    return {
      number: payload.pull_request.number,
      body: payload.comment?.body,
    };
  }
  if (
    eventName === "pull_request_review" &&
    payload.pull_request &&
    payload.action === "submitted"
  ) {
    return {
      number: payload.pull_request.number,
      body: payload.review?.body,
    };
  }
  return null;
}

/**
 * @cc [label:security] review-request-access
 * Only accept human requesters with repository write access and open PRs.
 */
/**
 * @cc [label:product] review-request-delivery
 * Request every parsed reviewer except the PR author for each eligible description edit or newly
 * posted request, including users who previously reviewed. Invalid reviewers do not block valid
 * requests. Title edits and pushes do not request reviews.
 */
/**
 * @cc [label:security] review-automation-source
 * Privileged workflow callers load this function from the repository's default branch, never from
 * a PR revision.
 */
export async function requestReviews({
  github,
  context,
  core,
}: ReviewBotOptions): Promise<void> {
  const request = getRequest(context);
  if (!request || context.payload.sender?.type !== "User") {
    return;
  }
  const reviewers = parseReviewers(request.body);
  if (reviewers.length === 0) {
    return;
  }

  let permission;
  try {
    const { data } = await github.rest.repos.getCollaboratorPermissionLevel({
      ...context.repo,
      username: context.actor,
    });
    permission = data.permission;
  } catch (error) {
    if (
      !(error instanceof Error && "status" in error && error.status === 404)
    ) {
      throw error;
    }
  }
  if (!permission || !["write", "maintain", "admin"].includes(permission)) {
    core.info(
      "Skipping review request: the requester lacks repository write access."
    );
    return;
  }

  const params = { ...context.repo, pull_number: request.number };
  const { data: pr } = await github.rest.pulls.get(params);
  if (pr.state !== "open") {
    return;
  }
  for (const reviewer of reviewers) {
    if (reviewer === pr.user.login.toLowerCase()) {
      continue;
    }
    try {
      await github.rest.pulls.requestReviewers({
        ...params,
        reviewers: [reviewer],
      });
      core.info(`Requested review from @${reviewer}.`);
    } catch (error) {
      if (
        !(error instanceof Error && "status" in error && error.status === 422)
      ) {
        throw error;
      }
      core.warning(`GitHub rejected the review request for @${reviewer}.`);
    }
  }
}
