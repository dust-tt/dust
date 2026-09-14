type Repository = { owner: string; repo: string };
type PullRequestParams = Repository & { pull_number: number };
type ReviewRequest = {
  line: string;
  reviewers: string[];
  contractReview: boolean;
};
type ReviewNotification = {
  requester: string;
  pullNumber: number;
  prUrl: string;
  requests: ReviewRequest[];
};

type ReviewContext = {
  actor: string;
  runId: number;
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
      actions: {
        createWorkflowDispatch(
          params: Repository & {
            workflow_id: string;
            ref: string;
            inputs: Record<string, string>;
          }
        ): Promise<unknown>;
      };
      repos: {
        getCollaboratorPermissionLevel(
          params: Repository & { username: string }
        ): Promise<{ data: { permission: string } }>;
      };
      pulls: {
        get(params: PullRequestParams): Promise<{
          data: {
            user: { login: string };
            html_url: string;
            state: string;
            head: { ref: string; repo: { full_name: string } | null };
          };
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
 * Parse every whitespace-delimited GitHub mention and bare `cc` token after a column-zero `r?`
 * followed by whitespace, retaining the request line for notifications. Bare `cc` requests a
 * contract review case-insensitively anywhere on the line; `@cc` remains a GitHub mention. Prose
 * between tokens is ignored and does not end the list. Deduplicate handles case-insensitively
 * within each request. Markdown filtering is best-effort: skip simple fenced blocks, HTML comments,
 * and explicitly quoted lines. Inline code, nested blocks, lazy quote continuations, and
 * interactions between comments and fences may cause missed or extra requests.
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
    let contractReview = false;
    for (const token of request[1].split(/[ \t]+/)) {
      if (token.toLowerCase() === "cc") {
        contractReview = true;
        continue;
      }
      if (!/^@[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(token)) {
        continue;
      }
      reviewers.add(token.slice(1).toLowerCase());
    }
    if (reviewers.size > 0 || contractReview) {
      requests.push({ line, reviewers: [...reviewers], contractReview });
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
 * Request every parsed GitHub reviewer except the PR author for each eligible description edit or
 * new request, including users who previously reviewed. Open, closed, and merged PRs are eligible.
 * GitHub validation failures do not block other reviewers, contract reviews, or Slack delivery.
 * Return the requester, PR number, URL, and request lines only for eligible requests. Title edits
 * and pushes do not request reviews.
 */
/**
 * @cc [label:product] contract-review-delivery
 * Each eligible event with a parsed `r?` request MUST request one contract review, including
 * description edits retaining the request. Bare `cc` is optional. Callers emit `pull-request-number`
 * before Slack delivery and invoke the pinned `spolu/code-contracts` contract-review action in a
 * separate job even if Slack delivery fails. Description and conversation-comment requests require
 * `review-bot.yml` to be registered on the default branch and present on the PR head with
 * `workflow_dispatch` and its review inputs; missing prerequisites can fail dispatch. Inline comments
 * and review summaries invoke the action directly. That action reviews only open PRs with heads in
 * this repository and publishes a COMMENT review pinned to the inspected head.
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
  return {
    requester: context.actor,
    pullNumber: request.number,
    prUrl: pr.html_url,
    requests,
  };
}

/**
 * @cc [label:security] contract-review-dispatch-access
 * Callers supply only PR numbers emitted for an authorized `r?` request. Skip closed and fork PRs.
 * The imported action rechecks the human requester's access using the originating run ID.
 */
/**
 * @cc [label:product] contract-review-head-dispatch
 * Dispatch description and conversation-comment requests on the PR's head branch, preserving the
 * originating run ID. The review inspects its workflow run's commit and reports a distinct commit
 * status for each run; later pushes neither cancel the review nor request another one. Inline
 * comments and review summaries use direct invocation because upstream rejects their delegation.
 */
/**
 * @cc [label:security] review-automation-source
 * Privileged workflow callers load this function from the repository's default branch, never from
 * a PR revision.
 */
export async function dispatchContractReview({
  github,
  context,
  core,
  pullNumber,
}: ReviewBotOptions & { pullNumber: number }): Promise<void> {
  if (
    context.eventName !== "pull_request_target" &&
    context.eventName !== "issue_comment"
  ) {
    return;
  }
  const { data: pr } = await github.rest.pulls.get({
    ...context.repo,
    pull_number: pullNumber,
  });
  if (
    pr.state !== "open" ||
    pr.head.repo?.full_name.toLowerCase() !==
      `${context.repo.owner}/${context.repo.repo}`.toLowerCase()
  ) {
    core.info("Skipping contract review dispatch: the PR is closed or a fork.");
    return;
  }
  await github.rest.actions.createWorkflowDispatch({
    ...context.repo,
    workflow_id: "review-bot.yml",
    ref: pr.head.ref,
    inputs: {
      "pull-request-number": String(pullNumber),
      "request-run-id": String(context.runId),
    },
  });
  core.info(
    `Dispatched contract review on ${pr.head.ref} for PR #${pullNumber}.`
  );
}

function escapeSlackText(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * @cc [label:product] review-request-slack-format
 * Format each eligible `r?` line with trailing prose preserved, prefixed by
 * `from: @requester` and followed by the PR URL and on the same line. Resolve
 * requester and reviewer mentions through `.authors` emails and Slack user
 * lookup; unresolved handles remain plain text.
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
        `from ${requester}: ${line} ${escapeSlackText(notification.prUrl)}`
    )
    .join("\n");
}
