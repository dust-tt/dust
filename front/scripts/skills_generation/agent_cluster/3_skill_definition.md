## Skill definition

### What is a skill (non exclusive)

**Name**

Represents what the skills help achieving. For example:

- RetrieveProspectCompanyInformation,
- Create<some_project>GithubIssue

**User description**

Human readable, intended to quickly grasp when to attach the skill to an agent

**Agent description**

Intended to agent so they can chose to use the skill based on a conversation turn

- Should include hints to explain when the skill is useful, in what situation it should be used.

**Instructions:**

- Steps to follow (HOW) to achieve an action or return a qualitative result
- Specific guidelines on :
  - when and how to use tools in the context of the skill (e.g. how to use the websearch tool to retrieve linkedin profiles)
  - how to encode company or team-specific knowledge into a format that can be leveraged by agents.
  - What exact source to update or search into (specific Github repo or Jira project)
- Can include good and / or bad examples
- Can include a list of values to use with the tools (list of IDs, list of project names, list of search filters…)

The output of a skill should be either:

- an action (e.g. create a ticket in Jira by following a template and rules, run multiple successive searches by following a process, classify some inputs based on evaluation criteria…)
- a result intended for agents, not humans (otherwise it is more an agent than a skill)

### What does NOT represent a skill

- Instructions with conditions based on datasource or input
  - example: “If the input looks like a CRM inquiry, fetch information in Salesforce, otherwise look in Google”
- Instructions whose output is intended for human —> this is an agent
  - bad example: “ScoreLead” that classifies lead after a search in internal documents based on the lead email adress. This is intended for humans.
  - good example: “LeadInformationGetter”
- Skills should not be used as a prompt library in the more classical sense of the term, e.g. “Analyze the following reports and extract the key insights into a single memo.”, “Help me write a feedback for a candidate”.
