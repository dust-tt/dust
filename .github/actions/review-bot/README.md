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

Only human requesters with repository write access can trigger the bot. The bot skips closed PRs
and the PR author, and logs a warning for reviewers GitHub rejects.

The workflow uses `GITHUB_TOKEN` and loads this action from the default branch. Merge the workflow
and action into that branch to activate it.
