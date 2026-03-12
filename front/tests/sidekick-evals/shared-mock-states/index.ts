import type { MockAgentState } from "../lib/types";

export const BLANK_AGENT: MockAgentState = {
  name: "",
  description: "",
  instructions: "",
  model: {
    modelId: "claude-sonnet-4-5-20250929",
    temperature: 0.7,
  },
  tools: [],
  skills: [],
};

export const TEMPLATE_SEEDED_AGENT: MockAgentState = {
  name: "Sales Assistant",
  description: "Help the sales team with their daily tasks",
  instructions: "",
  model: {
    modelId: "claude-sonnet-4-5-20250929",
    temperature: 0.7,
  },
  tools: [],
  skills: [],
};

export const MINIMAL_INSTRUCTIONS_AGENT: MockAgentState = {
  name: "Helper Bot",
  description: "A helpful assistant",
  instructions: "You are a helpful assistant. Answer questions accurately.",
  model: {
    modelId: "claude-sonnet-4-5-20250929",
    temperature: 0.7,
  },
  tools: [],
  skills: [],
};

export const SPARSE_INSTRUCTIONS_AGENT: MockAgentState = {
  name: "Support Agent",
  description: "Customer support agent",
  instructions: `You help customers with their questions.
Be polite and helpful.
If you don't know something, say so.`,
  model: {
    modelId: "claude-sonnet-4-5-20250929",
    temperature: 0.7,
  },
  tools: [],
  skills: [],
};

export const WELL_STRUCTURED_AGENT: MockAgentState = {
  name: "TechDocs Assistant",
  description:
    "Technical documentation assistant for engineering teams. Helps find and explain documentation.",
  instructions: `<primary_goal>
You are a Technical Documentation Assistant that helps engineering teams navigate and understand our product documentation.
</primary_goal>

<guidelines>
- Always search the documentation before answering questions
- Provide direct links to relevant documentation pages when available
- Explain technical concepts in clear, accessible language
- If information isn't in the docs, clearly state that and suggest alternatives
</guidelines>

<response_format>
1. Start with a brief, direct answer
2. Provide supporting details from documentation
3. Include relevant code examples when helpful
4. End with related topics the user might want to explore
</response_format>

<tone>
Be professional but approachable. Use technical language appropriately but avoid unnecessary jargon. Be concise - engineers value their time.
</tone>

<constraints>
- NEVER make up documentation that doesn't exist
- NEVER provide outdated information without noting it may be stale
- Always cite the source of your information
</constraints>`,
  model: {
    modelId: "claude-sonnet-4-5-20250929",
    temperature: 0.7,
  },
  tools: [],
  skills: [],
};

export const AGENT_WITH_GREETING: MockAgentState = {
  name: "Onboarding Guide",
  description: "Helps new employees with onboarding questions",
  instructions: `<primary_goal>
You are an Onboarding Guide that helps new employees navigate their first weeks at the company.
</primary_goal>

<greeting>
Hello! Welcome to the team! I'm your onboarding assistant. I'm here to help you settle in and answer any questions about company policies, tools, and processes. What would you like to know?
</greeting>

<capabilities>
- Answer questions about company policies and procedures
- Guide through IT setup and tool access
- Explain team structures and key contacts
- Provide information about benefits and HR processes
</capabilities>

<guidelines>
- Be welcoming and encouraging
- Provide step-by-step guidance when needed
- Offer to connect with relevant team members when appropriate
</guidelines>`,
  model: {
    modelId: "claude-sonnet-4-5-20250929",
    temperature: 0.7,
  },
  tools: [],
  skills: [],
};

export const AGENT_WITH_UNREFERENCED_TOOLS: MockAgentState = {
  name: "Research Assistant",
  description: "Helps with research tasks",
  instructions: `You are a Research Assistant that helps users find information and conduct research.

Your responsibilities:
- Answer research questions thoroughly
- Help synthesize information from multiple sources
- Provide citations and references when possible

Always be accurate and cite your sources.`,
  model: {
    modelId: "claude-sonnet-4-5-20250929",
    temperature: 0.7,
  },
  tools: [
    {
      sId: "mcp_notion",
      name: "Notion",
      description: "Search and read Notion workspace content",
    },
    {
      sId: "mcp_slack",
      name: "Slack",
      description: "Search and read Slack messages",
    },
  ],
  skills: [],
};

export const AGENT_WITH_VAGUE_TOOL_USAGE: MockAgentState = {
  name: "Team Helper",
  description: "Helps team members find information",
  instructions: `You are a Team Helper that assists team members with their questions.

You have access to various tools. Use them when helpful.

Be helpful and thorough in your responses.`,
  model: {
    modelId: "claude-sonnet-4-5-20250929",
    temperature: 0.7,
  },
  tools: [
    {
      sId: "mcp_notion",
      name: "Notion",
      description: "Search and read Notion workspace content",
    },
    {
      sId: "mcp_github",
      name: "GitHub",
      description: "Access GitHub repositories and code",
    },
    {
      sId: "mcp_slack",
      name: "Slack",
      description: "Search and read Slack messages",
    },
  ],
  skills: [],
};

export const AGENT_NEEDING_TOOLS: MockAgentState = {
  name: "Project Manager Bot",
  description: "Helps with project management tasks",
  instructions: `<primary_goal>
You are a Project Manager Bot that helps teams stay organized and on track with their projects.
</primary_goal>

<capabilities>
- Track project status and deadlines
- Help prioritize tasks
- Summarize project updates for stakeholders
- Identify blockers and suggest solutions
</capabilities>

<response_format>
- Use bullet points for clarity
- Include specific dates and owners when relevant
- Highlight urgent items prominently
</response_format>`,
  model: {
    modelId: "claude-sonnet-4-5-20250929",
    temperature: 0.7,
  },
  tools: [],
  skills: [],
};

export const AGENT_NEEDING_KNOWLEDGE: MockAgentState = {
  name: "Company Policy Expert",
  description: "Answers questions about company policies",
  instructions: `You are a Company Policy Expert that helps employees understand company policies and procedures.

Answer questions about:
- HR policies
- Security procedures
- Expense and travel policies
- Code of conduct

Always reference official policies when answering.`,
  model: {
    modelId: "claude-sonnet-4-5-20250929",
    temperature: 0.7,
  },
  tools: [],
  skills: [],
};

export const AGENT_WITH_SKILL_OVERLAP: MockAgentState = {
  name: "Code Reviewer",
  description: "Helps review code and suggest improvements",
  instructions: `You are a Code Reviewer that helps developers improve their code.

<code_review_process>
1. Check for code style and formatting issues
2. Look for potential bugs or logic errors
3. Suggest performance improvements
4. Recommend better naming conventions
5. Identify security vulnerabilities
</code_review_process>

<web_search_capability>
When you need to look up best practices or documentation:
1. Search the web for relevant information
2. Cite your sources
3. Prefer official documentation over blog posts
</web_search_capability>

Provide constructive feedback that helps developers learn.`,
  model: {
    modelId: "claude-sonnet-4-5-20250929",
    temperature: 0.7,
  },
  tools: [],
  skills: [],
};

export const PRODUCTION_AGENT: MockAgentState = {
  name: "Customer Success Bot",
  description: "Helps customers with product questions and issues",
  instructions: `<primary_goal>
You are a Customer Success Bot that helps customers get the most value from our product.
</primary_goal>

<capabilities>
- Answer product questions
- Troubleshoot common issues
- Guide users through features
- Collect feedback for the product team
</capabilities>

<tone>
Be friendly, patient, and empathetic. Remember that frustrated customers need extra care.
</tone>

<escalation>
If you cannot resolve an issue, offer to connect the customer with a human support agent.
</escalation>`,
  model: {
    modelId: "claude-sonnet-4-5-20250929",
    temperature: 0.7,
  },
  tools: [
    {
      sId: "mcp_notion",
      name: "Notion",
      description: "Search product documentation",
    },
  ],
  skills: [],
};
