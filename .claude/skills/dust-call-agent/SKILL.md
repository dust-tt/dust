---
name: dust-call-agent
description: Call a Dust agent to get information (read a slack thread, a notion URL, a google drive document...), perform an action (post a message to slack, create a calendar event, ...), provide context on any topic regarding Dust (the company, current discussions, customers...) or in general have the Dust agent perform a given task.
---

Access Dust agents that have context on all the company, e.g. recent projects, engineering, sales, marketing, etc., via the Dust CLI non-interactively, e.g.:
`$ dust chat -a issueBot -m "create an issue for this: ..."`
`$ dust chat -a deep-dive -m "Research all info we have on kubernetes probe failures in recent weeks."`

A conversation with an agent can be continued after the first message using the argument `-c CONVERSATION_STRING_ID`. The conversation id will be returned in the JSON result from the initial call.
`$ dust chat -a issueBot -c 'TdWyn4aDt1' -m "also add a subsequent issue about this: ..."`

Use `--projectName` or `--projectId` to create the conversation inside a specific project (space). These cannot be used with `-c` (only for new conversations):
`$ dust chat -a prea --projectName "Engineering" -m "summarize recent incidents"`
`$ dust chat -a prea --projectId "abc123" -m "summarize recent incidents"`

Use `-d` / `--details` to get detailed message information in the output (raw event stream, tool actions, and full agent message payload):
`$ dust chat -a prea -d -m "what's the status of project X?"`

If the CLI errors because login is needed, ask the user to perform it manually.

An agent may take long to answer. Avoid repeating an agent call if possible, especially if it timed out without a clear error, because:

- the agent call may not be idempotent, e.g. when creating an issue, if the conversation on Dust has been started, repeating will create two issues;
- multiple conversations are created in the user's Dust workspace, which bloats their conversation history.

If the CLI timed out but returned a `conversationId` and `messageId`, you can safely fetch the result without side effects:
`$ dust chat -c <conversationId> --messageId <messageId>`

Otherwise, wait for a clear answer. If you decide to time out with no conversation ID, make no assumption on success or failure; report back to the user.
