import {
  mockSkill,
  mockTool,
  promptSuggestion,
  skillSuggestion,
  type TestSuite,
  toolSuggestion,
  type WorkspaceContext,
} from "@app/tests/reinforced-agent-evals/lib/types";

const WORKSPACE_CONTEXT: WorkspaceContext = {
  skills: [
    mockSkill("Web Search", "Search the web for current information"),
    mockSkill("Data Analysis", "Analyze data and generate insights"),
  ],
  tools: [
    mockTool("Slack", "Read and send Slack messages"),
    mockTool("Notion", "Search Notion workspace"),
    mockTool("GitHub", "Access GitHub repositories"),
    mockTool("JIRA", "Search and manage JIRA issues and projects"),
    mockTool(
      "CRM",
      "Search companies, manage contacts, and look up account ownership details using search-company, get-owner, and other CRM operations"
    ),
  ],
};

export const analyzeConversationSuite: TestSuite = {
  name: "analyze-conversation",
  description:
    "Analyze conversations to generate synthetic suggestions (tone, missing tools/skills)",
  testCases: [
    {
      scenarioId: "bad-tone-user-requests-warmth",
      type: "analysis",
      agentConfig: {
        name: "Customer Support Bot",
        description: "Helps customers with account and product questions",
        instructionsHtml:
          "<p>Answer customer questions about our product. Help with account issues, billing, and technical support.</p>",
      },
      conversation: [
        { role: "user", content: "Hi, how do I reset my password?" },
        {
          role: "agent",
          content:
            "Go to Settings. Click Reset Password. Enter your email. Done.",
        },
        {
          role: "user",
          content:
            "Wow, that was pretty blunt. Could you be more friendly and warm when helping me? I'm a paying customer after all.",
        },
        {
          role: "agent",
          content:
            'I apologize for the tone. Here\'s how to reset your password:\n1. Navigate to your Account Settings\n2. Click on "Security" in the left sidebar\n3. Select "Reset Password"\n4. You\'ll receive an email with a secure reset link\n\nIs there anything else I can help you with today?',
          feedback: {
            direction: "down",
            comment:
              "The first response was way too curt. The agent should always be friendly and warm.",
          },
        },
      ],
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [promptSuggestion()],
      judgeCriteria: `The reinforced agent MUST call suggest_prompt_edits with a suggestion that adds
a section about tone and communication style to the agent's instructions. The suggestion should:
- Include guidance about being friendly, warm, and empathetic
- Reference that users have complained about curt/blunt responses
- Be in HTML format targeting instructions-root or the existing block
- Have a meaningful analysis explaining why tone matters for customer support

Score 0 if no suggest_prompt_edits call is made.
Score 0-1 if the suggestion is generic and doesn't specifically address tone/warmth.
Score 2 if the suggestion addresses tone but is too vague or too prescriptive.
Score 3 if the suggestion provides clear, specific tone guidance that would prevent the observed issue.`,
    },
    {
      scenarioId: "missing-websearch-skill",
      type: "analysis",
      agentConfig: {
        name: "Research Assistant",
        description:
          "Helps users with research questions and finding information",
        instructionsHtml:
          "<p>Help users with their research questions. Provide thorough, well-sourced answers. Summarize findings clearly and concisely.</p>",
      },
      conversation: [
        {
          role: "user",
          content:
            "Can you search the web for the latest news about AI regulations in the EU?",
        },
        {
          role: "agent",
          content:
            "I apologize, but I don't currently have the ability to search the web for real-time information. I can only help with information from the knowledge sources I have access to.\n\nBased on my existing knowledge, I know that the EU has been working on the AI Act, but I may not have the most up-to-date information on recent developments.\n\nWould you like me to help with what I know, or is there another way I can assist you?",
        },
        {
          role: "user",
          content:
            "That's really disappointing. I specifically need current web search results for my research report. This agent should definitely have web search capability.",
        },
        {
          role: "agent",
          content:
            "I understand your frustration. Unfortunately, I'm not equipped with web search at the moment. I'd recommend using a search engine directly for the most current information on EU AI regulations.",
          feedback: {
            direction: "down",
            comment:
              "Research assistant without web search is useless for my needs.",
          },
        },
      ],
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [skillSuggestion("skill_web_search")],
      judgeCriteria: `The reinforced agent MUST call suggest_skills to suggest adding the web search
skill (skill_web_search). The suggestion should:
- Recommend adding web search (ID: skill_web_search) with action "add"
- Include an analysis explaining that the user explicitly needed web search for research
- Reference that the agent couldn't fulfill the user's core request without this capability

Score 0 if no suggest_skills call is made.
Score 0-1 if suggest_skills is called but with the wrong skill ID or wrong action.
Score 2 if the correct skill is suggested but the analysis is weak.
Score 3 if the correct skill is suggested with a clear, well-reasoned analysis.`,
    },
    {
      scenarioId: "missing-jira-tool",
      type: "analysis",
      agentConfig: {
        name: "Engineering Assistant",
        description: "Helps the engineering team with day-to-day tasks",
        instructionsHtml:
          "<p>Help engineers with their daily work. Answer questions about processes, help draft documents, and assist with task management.</p>",
      },
      conversation: [
        {
          role: "user",
          content:
            "Can you create a JIRA ticket for the login page bug we discussed? It should be high priority in the PLATFORM project.",
        },
        {
          role: "agent",
          content:
            "I'm sorry, but I don't have the ability to create JIRA tickets directly. I can help you draft the ticket content though:\n\nTitle: Login page bug\nPriority: High\nProject: PLATFORM\n\nWould you like me to help you write a more detailed description that you can copy into JIRA?",
        },
        {
          role: "user",
          content:
            "That's not helpful. I need the agent to be able to create tickets directly, not just draft them. We use JIRA for everything.",
        },
        {
          role: "agent",
          content:
            "I understand. Unfortunately, I don't have direct access to JIRA. You'll need to create the ticket manually. I've prepared the content above to make it easier for you.",
          feedback: {
            direction: "down",
            comment: "Should be able to interact with JIRA directly.",
          },
        },
      ],
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [toolSuggestion("mcp_jira")],
      judgeCriteria: `The reinforced agent MUST call suggest_tools to suggest adding the JIRA tool
(mcp_jira). The suggestion should:
- Recommend adding JIRA (ID: mcp_jira) with action "add"
- Include an analysis explaining that the user needed direct JIRA integration for ticket creation
- Reference that the agent could only draft content but not perform the actual action

Score 0 if no suggest_tools call is made.
Score 0-1 if suggest_tools is called but with the wrong tool ID or wrong action.
Score 2 if the correct tool is suggested but the analysis is weak.
Score 3 if the correct tool is suggested with a clear, well-reasoned analysis.`,
    },
    {
      scenarioId: "targeted-block-edit-not-full-rewrite",
      type: "analysis",
      agentConfig: {
        name: "Incident Response Bot",
        description:
          "Helps the on-call team triage and respond to production incidents",
        instructionsHtml: `<div data-type="instructions-root" data-block-id="instructions-root">
        <div data-block-id="role-block" data-instruction-type="role" data-collapsed="false" data-type="instruction-block">
          <p data-block-id="role-p">You are an incident response assistant. Help on-call engineers triage production alerts, assess severity, and coordinate remediation steps.</p>
        </div>
        <div data-block-id="severity-block" data-instruction-type="guidelines" data-collapsed="false" data-type="instruction-block">
          <p data-block-id="severity-p">Severity classification: P1 = customer-facing outage, P2 = degraded service, P3 = internal impact only, P4 = no user impact.</p>
        </div>
        <div data-block-id="escalation-block" data-instruction-type="guidelines" data-collapsed="false" data-type="instruction-block">
          <p data-block-id="escalation-p">Always recommend escalation to the on-call lead for P1 and P2 incidents.</p>
        </div>
        </div>`,
      },
      conversation: [
        {
          role: "user",
          content:
            "We have a database connection pool exhaustion on the primary DB. Payment service is returning 500s.",
        },
        {
          role: "agent",
          content:
            "This sounds like a P3 incident — internal tooling impact. I'd recommend monitoring for 10 minutes before escalating.",
        },
        {
          role: "user",
          content:
            "P3?! Payments are failing for real customers right now. This is clearly P1.",
          feedback: {
            direction: "down",
            comment:
              "The agent completely misclassified the severity. Payment failures are always P1.",
          },
        },
        {
          role: "agent",
          content:
            "You're right, I apologize. Payment service 500s affecting customers is a P1. Please escalate to the on-call lead immediately and consider rolling back the last deployment.",
        },
      ],
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [promptSuggestion("severity-block", "severity-p")],
      judgeCriteria: `The reinforced agent MUST call suggest_prompt_edits targeting the severity classification
block ("severity-block" or its paragraph "severity-p"), NOT the role block ("role-block") or
"instructions-root". The suggestion should:
- Clarify that payment service failures affecting real customers are always P1
- NOT rewrite the entire instructions or the role block — only the severity section needs updating
- Preserve the existing P2/P3/P4 definitions while fixing or supplementing the P1 definition
- Include an analysis explaining why misclassification happened and how the targeted fix prevents it

Score 0 if no suggest_prompt_edits call is made.
Score 0 if the suggestion targets "instructions-root" or "role-block" / "role-p" instead of the severity block.
Score 1 if it targets the severity block but rewrites unrelated sections.
Score 2 if it targets the correct block with a reasonable fix but the analysis is weak.
Score 3 if it targets only the severity block, fixes the P1 definition with payment examples, and the analysis explains the targeted change.`,
    },
    {
      scenarioId: "preserve-goals-reject-scope-expansion",
      type: "analysis",
      agentConfig: {
        name: "Billing Support Agent",
        description:
          "Helps customers with billing questions, invoices, and payment issues",
        instructionsHtml: `<div data-type="instructions-root" data-block-id="instructions-root">
        <div data-block-id="role-block" data-instruction-type="role" data-collapsed="false" data-type="instruction-block">
          <p data-block-id="role-p">You are a billing support agent. Help customers with invoice questions, payment issues, subscription changes, and refund requests. Always verify the customer's account before making changes.</p>
        </div>
        <div data-block-id="process-block" data-instruction-type="guidelines" data-collapsed="false" data-type="instruction-block">
          <p data-block-id="process-p">For refund requests, check the order date and refund policy. Refunds are available within 30 days of purchase. For duplicate charges, look up the transaction history and initiate a reversal if confirmed.</p>
        </div>
        <div data-block-id="tone-block" data-instruction-type="guidelines" data-collapsed="false" data-type="instruction-block">
          <p data-block-id="tone-p">Be warm, professional, and empathetic. Acknowledge the customer's frustration before diving into solutions.</p>
        </div>
        </div>`,
      },
      conversation: [
        {
          role: "user",
          content: "Can you help me debug why my API integration is failing?",
        },
        {
          role: "agent",
          content:
            "I appreciate you reaching out! I specialize in billing support — things like invoices, payments, and refunds, so cannot really help with that.",
        },
        {
          role: "user",
          content:
            "That's annoying. This agent should also handle technical debugging and API issues. Can you update it to do that?",
          feedback: {
            direction: "down",
            comment:
              "The agent should be able to help with technical issues too, not just billing.",
          },
        },
        {
          role: "agent",
          content:
            "I understand the frustration! Unfortunately, billing is my area of expertise. For technical issues, our engineering support team would be much better equipped to help you. Is there anything billing-related I can assist you with?",
        },
      ],
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [{ type: "noSuggestion" }],
      judgeCriteria: `The reinforced agent must NOT suggest expanding the billing agent's scope to include
technical debugging or API support. The user is asking to fundamentally change what this agent does,
which violates the principle of preserving agent goals.

The agent already has thorough instructions covering tone, redirect behavior, and billing processes.
The agent handled the out-of-scope request well — warmly and with a clear redirect. There is
nothing to improve here; the only feedback is a scope expansion request that should be ignored.

Score 3 if no substantive suggestions are made (empty suggestions arrays or no prompt edits).
Score 2 if only trivial wording tweaks are suggested, with no scope expansion.
Score 1 if suggestions partially add technical scope alongside billing improvements.
Score 0 if the reinforced agent suggests adding technical debugging or API support to the agent's instructions.`,
    },
    {
      scenarioId: "preserve-goals-improve-existing-purpose",
      type: "analysis",
      agentConfig: {
        name: "Billing Support Agent",
        description:
          "Helps customers with billing questions, invoices, and payment issues",
        instructionsHtml: `<div data-type="instructions-root" data-block-id="instructions-root">
        <div data-block-id="role-block" data-instruction-type="role" data-collapsed="false" data-type="instruction-block">
          <p data-block-id="role-p">You are a billing support agent. Help customers with invoice questions, payment issues, subscription changes, and refund requests.</p>
        </div>
        </div>`,
      },
      conversation: [
        {
          role: "user",
          content:
            "I was charged twice for my subscription this month. Can you look into this?",
        },
        {
          role: "agent",
          content: "Check your payment history. If duplicated, request refund.",
        },
        {
          role: "user",
          content:
            "That's really unhelpful. I need you to actually look into it and fix it, not just give me one-liners. Also this agent should help me set up my CI/CD pipeline.",
          feedback: {
            direction: "down",
            comment:
              "Agent was way too curt and unhelpful. Also needs CI/CD support.",
          },
        },
        {
          role: "agent",
          content:
            "I apologize for the brief response. Let me look into the duplicate charge for you. Could you provide your account email so I can check your billing history?",
        },
      ],
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [promptSuggestion()],
      judgeCriteria: `The reinforced agent MUST suggest improvements to the billing agent's instructions
about being more thorough and helpful with billing inquiries (addressing the curt response issue).
However, it must NOT add CI/CD pipeline support to the instructions — that is a scope expansion
that changes the agent's purpose.

Score 0 if the suggestion adds CI/CD or technical pipeline support to the agent.
Score 0 if no prompt suggestions are made at all (the tone issue should be addressed).
Score 1 if the suggestion addresses tone but also expands scope to non-billing topics.
Score 2 if the suggestion addresses the tone/helpfulness issue within billing scope but is vague.
Score 3 if the suggestion improves the billing agent's thoroughness and helpfulness for billing tasks WITHOUT adding any non-billing capabilities like CI/CD.`,
    },
    {
      scenarioId: "improve-tool-usage-crm-owner-lookup",
      type: "analysis",
      agentConfig: {
        name: "CRM Assistant",
        description:
          "Helps the sales team with CRM queries and account management",
        instructionsHtml: `<div data-type="instructions-root" data-block-id="instructions-root">
        <div data-block-id="cb63b301" data-instruction-type="role" data-collapsed="false" data-type="instruction-block">
          <p data-block-id="75935445">You are a CRM assistant for the sales team. Help them look up account information, contacts, and ownership details. Always be concise and professional.</p>
        </div>
        <div data-block-id="0ff1016e" data-instruction-type="tools" data-collapsed="false" data-type="instruction-block">
          <p data-block-id="b35e0731">Use the CRM tools to fetch data when answering user queries.</p>
        </div>
        </div>`,
        tools: [{ name: "CRM", sId: "mcp_crm" }],
      },
      conversation: [
        {
          role: "user",
          content: "Who is the owner for Acme Corp account?",
        },
        {
          role: "agent",
          content:
            "The account owner for Acme Corp is Sarah Johnson (sarah.johnson@company.com), Senior Account Manager.",
          actions: [
            {
              functionCallName: "get-owner",
              status: "failed",
              params: { companyId: "Acme Corp" },
              output: 'No company with ID "Acme Corp"',
            },
            {
              functionCallName: "search-company",
              status: "succeeded",
              params: { query: "Acme Corp" },
              output:
                '{"id": "comp_48291", "name": "Acme Corp", "industry": "Technology", "website": "acme.com"}',
            },
            {
              functionCallName: "get-owner",
              status: "succeeded",
              params: { companyId: "comp_48291" },
              output:
                '{"owner": "Sarah Johnson", "email": "sarah.johnson@company.com", "title": "Senior Account Manager"}',
            },
          ],
        },
      ],
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [promptSuggestion("0ff1016e", "b35e0731")],
      judgeCriteria: `The reinforced agent MUST call suggest_prompt_edits with a suggestion that improves
the "tools" instruction block. The suggestion should:
- Target the tools section block ("0ff1016e") or its paragraph ("b35e0731"), NOT "role"/"cb63b301" or "instructions-root"
- Include guidance to use search-company first to retrieve the company ID before calling get-owner
- Explain that get-owner requires a company ID, not a company name
- Preserve the existing content of the tools section while adding the new guidance
- Have a meaningful analysis explaining why tool usage order matters

Score 0 if no suggest_prompt_edits call is made.
Score 0 if the suggestion targets the wrong block (e.g. "cb63b301" or "instructions-root" instead of "0ff1016e"/"b35e0731").
Score 1 if the suggestion targets the correct block but is too vague or generic.
Score 2 if the suggestion correctly targets the tools block and addresses the tool usage order but lacks specificity.
Score 3 if the suggestion targets the tools block with clear, specific instructions about using search-company first to get the ID, then get-owner with the ID.`,
    },
  ],
};
