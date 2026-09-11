# Review bot

Start a line in a PR description or message with `r?`, followed by GitHub user mentions to request
their reviews and a contract review. Use `r? cc` to request only a contract review:

```text
r? @spolu @flvndvd
r? please take a look at @spolu
r? cc
r? @spolu cc @flvndvd PMRR
```

Each description edit containing a request and each new conversation comment, inline comment, or
review summary containing a request requests reviews again, including from users who already
reviewed. Opening a PR with a request also works. Title edits, pushes, and comment edits do not
request reviews.

The `r?` must start the line without indentation. Surrounding lines and trailing prose are allowed;
all GitHub mentions anywhere after `r?` are reviewers. Bare `cc` tokens anywhere on the request line
request a contract review. `cc` is case-insensitive; `@cc` requests the GitHub user instead. Team
mentions are not supported. Markdown filtering is best-effort: simple fenced blocks, HTML comments,
and explicitly quoted lines are skipped. Inline code, nested blocks, lazy quote continuations, and
interactions between comments and fences may cause missed or extra requests.

GitHub reviews, contract reviews, and Slack notifications require a human requester with repository
`write`, `maintain`, or `admin` permission.
Requests are accepted on open, closed, and merged PRs. The bot skips the PR author and logs a warning
for review requests GitHub rejects with a validation error, while still sending the Slack notification.

Each eligible request also posts to `#engineering_pr_reviews` (`C09GELMTTRT`):

```text
r? @reviewer please take a look https://github.com/dust-tt/dust/pull/123 (req:@requester)
```

The requester and reviewer handles become real Slack mentions through `.authors` email mappings
and Slack's `users.lookupByEmail`. Unmapped handles remain plain text. Only request lines are
forwarded, each followed by the PR URL and requester on the same line. Trailing prose is preserved;
other PR description or comment text is omitted.
Slack delivery errors fail the workflow so rejected notifications are visible in the run logs.

The workflow uses `GITHUB_TOKEN` and the existing `SLACK_BOT_TOKEN`, and loads this action from the
default branch. The Slack bot needs `users:read.email` and permission to post in the reviews channel.
Merge the workflow and action into that branch to activate it.

The bot also adds the `PMRR` label whenever an eligible description or message contains `PMRR`
(case-insensitively), on open, closed, or merged PRs. Labeling runs before review requests, does not
require an `r?` command or requester write access, and never removes labels.

Each eligible event containing an `r?` request triggers one contract review, regardless of whether
`cc` appears in the reviewer list or how many request lines it contains. Description edits retaining
the request trigger another review, just like human reviewers. Bare `cc` stays plain text in Slack
and is never sent to GitHub as a reviewer.

The workflow calls the pinned
[`spolu/code-contracts` contract-review action](https://github.com/spolu/code-contracts/tree/main/.github/actions/contract-review)
in a separate job using `gpt-6-astra` with `xhigh` reasoning effort and the existing `OPENAI_API_KEY`
secret. It includes its own `review.md`, contract discovery tooling, review generation, and publication.
Slack delivery failures do not block an emitted contract review request, and contract review failures
do not block human reviews or Slack.

Description and conversation-comment requests dispatch `review-bot.yml` on the PR's head branch.
The review inspects that workflow run's commit, even if the branch advances while it is queued or
running. Later pushes neither cancel the review nor trigger another one. The originating run ID
preserves the human requester's identity and request across dispatches and retries; the action
rechecks that person's access before reviewing.

Inline comments and review summaries invoke the action directly in their request workflow because
the imported action does not yet accept these events as delegated requests. They still publish a
review and progress status on the captured PR head.

Each review run reports a distinct `Review Code Contracts (<run-id>)` commit status linked to the
workflow, including progress, completion, failure, and cancellation. Success means the review
completed; findings remain in the comment review. Concurrent runs cannot overwrite one another's
status.

The request job needs `actions: write` to dispatch. Review execution needs `contents: read`,
`pull-requests: write`, `statuses: write`, and `actions: read` to resolve delegated requesters.
Manual dispatches select the PR's head branch, supply its number, and leave `request-run-id` empty.
Merge the dispatch-capable workflow into main and bring it into a PR branch before requesting
head-branch execution.

The imported action accepts open PRs, including drafts, whose head branch is in this repository;
it skips closed, merged, and fork PRs. It publishes a `COMMENT` review pinned to the inspected commit,
never an approval or a request for changes. A new workflow run can review the same commits again;
rerunning a workflow that already published a review for those commits skips duplicate publication.
