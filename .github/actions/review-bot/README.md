# Review bot

Start a line in a PR description or message with `r?`, followed by GitHub user mentions:

```text
r? @spolu @flvndvd
r? @spolu please take a look
```

Each description edit containing a request and each new conversation comment, inline comment, or
review summary containing a request requests reviews again, including from users who already
reviewed. Opening a PR with a request also works. Title edits, pushes, and comment edits do not
request reviews.

The `r?` must start the line without indentation. Surrounding lines and trailing prose are allowed;
only the consecutive mentions immediately after `r?` are reviewers. Fenced code, HTML comments,
quoted lines, team mentions, and mentions after trailing prose are ignored.

Only human requesters with repository `write`, `maintain`, or `admin` permission can trigger the bot.
Requests are accepted on open, closed, and merged PRs. The bot skips the PR author and logs a warning
for review requests GitHub rejects with a validation error, while still sending the Slack notification.

Each eligible request also posts to `#engineering_pr_reviews` (`C09GELMTTRT`):

```text
r? @reviewer please take a look https://github.com/dust-tt/dust/pull/123 (from: @requester)
```

The requester and reviewer handles become real Slack mentions through `.authors` email mappings
and Slack's `users.lookupByEmail`. Unmapped handles remain plain text. Only request lines are
forwarded, each followed by the PR URL and requester on the same line. Trailing prose is preserved;
other PR description or comment text is omitted.
Slack delivery errors fail the workflow so rejected notifications are visible in the run logs.

The workflow uses `GITHUB_TOKEN` and the existing `SLACK_BOT_TOKEN`, and loads this action from the
default branch. The Slack bot needs `users:read.email` and permission to post in the reviews channel.
Merge the workflow and action into that branch to activate it.
