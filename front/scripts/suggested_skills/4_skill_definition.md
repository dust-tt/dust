### What is a skill (non exclusive)

**Name** (WHAT)

Represents what the skills helps achieving. Format is PascalCase, for example:

- RetrieveProspectCompanyInformation,
- Create<some_project>GithubIssue

**User description** (WHAT)

Human readable, intended to quickly grasp what the skill does

- Should be concise, 100 characters and 1 - 2 small sentences max.

**Agent description** (WHAT, WHEN, WHY)

Intended for agent so they can chose to use the skill based on a conversation turn

- Should explain what the skill does, how is it useful and in what situation it should be used.
- Typically consists in a WHAT block (up to 2 sentences) and a WHEN block (up to 2 sentences) separated by a line break
- Should be concise but specific enough so the agent knows in which situation it can enable it and expand the skill’s instructions

**Instructions** (HOW)

- Steps to follow (HOW) to achieve the skill’s goal
- Specific guidelines on:
  - Workflows: when and how to use tools specifically in the context of the skill
  - Encoding company or team-specific knowledge into a format that can be leveraged by agents
  - What exact source to update or search into (e.g. specific Github repository or Jira project)
- Can include good and / or bad examples tied to required tools
- Can include a list of values to use with the tools (list of IDs, list of project names, list of search filters…)

---

## ➕  Additional informations about skills

There is no input/output to a skill as it is not "called", it is a guide explaining how to accomplish an action, which can be used as an intermediary step inside an agent instructions, and which can be reusable across multiple agents.

Some examples of actions accomplished by a skills:

- create a ticket in in a specific Jira project (given the id or the name, depending on the underlying tool) by following a template
- classify an entity from an input (e.g. an id, a name etc.) based on evaluation criteria after conducting data retrieval from specific sources

### What does NOT represent a skill:

- Broad instructions with conditions based on datasource or input
  - bad example: “If the input looks like a CRM inquiry, fetch information in Salesforce, otherwise look in Google”
- Instructions whose output is intended for humans
  - bad example: “ScoreLead” that classifies lead after a search in internal documents based on the lead email adress. This is intended for humans.
  - good example: “LeadInformationGetter” which can be reused across multiple agents as an intermediary step for different end purposes (e.g. write results in a Notion page, send a marketing email to the lead etc.)
- Skills should not be used as a prompt library in the more classical sense of the term, e.g. “Analyze the following reports and extract the key insights into a single memo.”, “Help me write a feedback for a candidate”. These examples are not skills because their outputs are more intended for humans than agents. They do not represent an intermediary step of an agent instructions.
