type Repository = { owner: string; repo: string };
type PullRequestParams = Repository & { pull_number: number };
type ReviewRequest = { line: string; reviewers: string[] };
type ReviewNotification = {
  requester: string;
  prUrl: string;
  requests: ReviewRequest[];
};

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
        get(params: PullRequestParams): Promise<{
          data: { user: { login: string }; html_url: string };
        }>;
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
 * line, retaining the request line for notifications. Trailing prose ends the list. Ignore fenced
 * code and HTML comments, and deduplicate handles case-insensitively within each request.
 */
export function parseReviewRequests(
  body: string | null | undefined
): ReviewRequest[] {
  const requests: ReviewRequest[] = [];
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
    const reviewers = new Set<string>();
    for (const token of request[1].split(/[ \t]+/)) {
      if (!/^@[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(token)) {
        break;
      }
      reviewers.add(token.slice(1).toLowerCase());
    }
    if (reviewers.size > 0) {
      requests.push({ line, reviewers: [...reviewers] });
    }
  }
  return requests;
}

/**
 * @cc [label:product] pull-request-message-events
 * Read PR descriptions on opening or body edits, new conversation and inline comments, and newly
 * submitted review summaries. Accept every PR state. Ignore ordinary issues, title-only edits,
 * pushes, and comment edits.
 */
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
 * @cc [label:product] pmrr-labeling
 * Add the `PMRR` label when an eligible PR description or message contains `PMRR` case-insensitively,
 * on open, closed, or merged PRs. Preserve other labels and never remove the label when text changes.
 * Callers process labeling before attempting GitHub review requests or Slack delivery.
 */
/**
 * @cc [label:security] review-automation-source
 * Privileged workflow callers load this function from the repository's default branch, never from
 * a PR revision.
 */
export async function labelPmrr({
  github,
  context,
}: {
  github: {
    rest: {
      issues: {
        addLabels(
          params: Repository & { issue_number: number; labels: string[] }
        ): Promise<unknown>;
      };
    };
  };
  context: ReviewContext;
}): Promise<void> {
  const request = getRequest(context);
  if (!request?.body?.toUpperCase().includes("PMRR")) {
    return;
  }
  await github.rest.issues.addLabels({
    ...context.repo,
    issue_number: request.number,
    labels: ["PMRR"],
  });
}

/**
 * @cc [label:security] review-request-access
 * Only accept human requesters with repository `write`, `maintain`, or `admin` permission.
 */
/**
 * @cc [label:product] review-request-delivery
 * Request every parsed reviewer except the PR author for each eligible description edit or newly
 * posted request, including users who previously reviewed. Open, closed, and merged PRs are eligible.
 * GitHub validation failures do not block other reviewers or Slack notifications. Return the
 * requester, PR URL, and request lines for Slack notification only for eligible requests. Title
 * edits and pushes do not request reviews.
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
}: ReviewBotOptions): Promise<ReviewNotification | undefined> {
  const request = getRequest(context);
  if (!request || context.payload.sender?.type !== "User") {
    return;
  }
  const requests = parseReviewRequests(request.body);
  if (requests.length === 0) {
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
  const reviewers = new Set(requests.flatMap((request) => request.reviewers));
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
  return { requester: context.actor, prUrl: pr.html_url, requests };
}

function escapeSlackText(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * @cc [label:product] review-request-slack-format
 * Format each eligible `r?` line with trailing prose preserved, followed by the PR URL and
 * `(req:@requester)` on the same line. Resolve requester and reviewer mentions through `.authors`
 * emails and Slack user lookup; unresolved handles remain plain text.
 */
/**
 * @cc [label:error-handling] review-request-slack-delivery
 * Callers must fail the workflow when Slack rejects or cannot deliver the notification.
 */
/**
 * @cc [label:security] review-request-slack-mentions
 * Escape literal Slack control characters before inserting resolved user mentions. Only the
 * requester and reviewers parsed from the request may become Slack mentions.
 */
export async function formatSlackNotification({
  notification,
  authors,
  slackToken,
  core,
}: {
  notification: ReviewNotification;
  authors: string;
  slackToken: string;
  core: ReviewBotOptions["core"];
}): Promise<string> {
  const emails = new Map<string, string>();
  for (const line of authors.split(/\r?\n/)) {
    const entry = /^([^:]+):\s*(\S+)\s*$/.exec(line);
    if (entry) {
      emails.set(entry[1].toLowerCase(), entry[2]);
    }
  }

  const handles = new Set([
    notification.requester.toLowerCase(),
    ...notification.requests.flatMap((request) => request.reviewers),
  ]);
  const mentions = new Map<string, string>();
  await Promise.all(
    [...handles].map(async (handle) => {
      const email = emails.get(handle);
      if (!email) {
        core.warning(`No .authors email found for @${handle}.`);
        return;
      }

      let data: unknown;
      try {
        const response = await fetch(
          "https://slack.com/api/users.lookupByEmail",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${slackToken}` },
            body: new URLSearchParams({ email }),
          }
        );
        if (!response.ok) {
          core.warning(
            `Slack user lookup failed for @${handle}: HTTP ${response.status}.`
          );
          return;
        }
        data = await response.json();
      } catch {
        core.warning(`Slack user lookup failed for @${handle}.`);
        return;
      }
      if (
        typeof data === "object" &&
        data !== null &&
        "ok" in data &&
        data.ok === true &&
        "user" in data &&
        typeof data.user === "object" &&
        data.user !== null &&
        "id" in data.user &&
        typeof data.user.id === "string" &&
        /^[UW][A-Z0-9]+$/.test(data.user.id)
      ) {
        mentions.set(handle, `<@${data.user.id}>`);
      } else {
        core.warning(`No Slack user found for @${handle}.`);
      }
    })
  );

  const requester =
    mentions.get(notification.requester.toLowerCase()) ??
    escapeSlackText(`@${notification.requester}`);
  const lines = notification.requests.map(({ line }) =>
    escapeSlackText(line).replace(
      /(?<!\S)@[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?(?=[ \t]|$)/gi,
      (mention) => mentions.get(mention.slice(1).toLowerCase()) ?? mention
    )
  );
  return lines
    .map(
      (line) =>
        `${line} ${escapeSlackText(notification.prUrl)} (req:${requester})`
    )
    .join("\n");
}
