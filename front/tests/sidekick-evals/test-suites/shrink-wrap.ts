import {
  formatConversationForShrinkWrap,
  type ShrinkWrapAgentMessage,
  type ShrinkWrapConversationData,
  type ShrinkWrapUserMessage,
} from "@app/lib/api/assistant/conversation/shrink_wrap";
import { buildFirstMessage } from "@app/pages/api/w/[wId]/assistant/builder/sidekick/prompt/shrink-wrap";

import type { ConversationMessage, TestSuite } from "../lib/types";
import { BLANK_AGENT } from "../shared-mock-states/index";

function userMsg(
  index: number,
  username: string,
  content: string,
  mentions: Array<{ configurationId: string }> = []
): ShrinkWrapUserMessage {
  return {
    type: "user_message",
    sId: `msg_${index}`,
    created: 1708000000000 + index * 60000,
    content,
    context: { username },
    mentions,
  };
}

function agentMsg(
  index: number,
  agentSId: string,
  agentName: string,
  content: string | null,
  actions: ShrinkWrapAgentMessage["actions"] = []
): ShrinkWrapAgentMessage {
  return {
    type: "agent_message",
    sId: `msg_${index}`,
    created: 1708000000000 + index * 60000,
    content,
    status: "succeeded",
    configuration: { sId: agentSId, name: agentName },
    actions,
    parentAgentMessageId: null,
  };
}

const BUG_TRIAGE_CONVERSATION: ShrinkWrapConversationData = {
  sId: "conv_abc123",
  title: "Bug Triage - NullPointerException in PaymentService",
  messages: [
    userMsg(
      0,
      "john.doe",
      "Hey @helper, I'm seeing this error in production: `NullPointerException in PaymentService.processRefund() at line 142`. Can you search for similar occurrences on Datadog?",
      [{ configurationId: "helper_agent" }]
    ),
    agentMsg(
      1,
      "helper_agent",
      "Helper",
      `I found 2 other occurrences of this error in the last 24 hours:

1. **2024-02-15 14:23 UTC** - \`NullPointerException in PaymentService.processRefund()\` - user_id: usr_4521
2. **2024-02-15 16:45 UTC** - \`NullPointerException in PaymentService.processRefund()\` - user_id: usr_7834

Both errors occur in the same method and seem related to refund processing.`,
      [
        {
          functionCallName: "datadog__search_logs",
          status: "succeeded",
          internalMCPServerName: null,
          params: {
            query: "NullPointerException PaymentService.processRefund",
            timeRange: "24h",
            service: "payment-service",
          },
        },
      ]
    ),
    userMsg(
      2,
      "john.doe",
      "Interesting, can you check in our database who these users are? Search on Snowflake."
    ),
    agentMsg(
      3,
      "helper_agent",
      "Helper",
      `Here are the user details from Snowflake:

| User ID | Name | Plan | Account Created |
|---------|------|------|-----------------|
| usr_4521 | Alice Martin | Enterprise | 2023-01-15 |
| usr_7834 | Bob Chen | Pro | 2023-06-20 |

Both are paying customers on premium plans.`,
      [
        {
          functionCallName: "data_warehouses__query",
          status: "succeeded",
          internalMCPServerName: "data_warehouses",
          params: {
            query:
              "SELECT user_id, name, plan, created_at FROM users WHERE user_id IN ('usr_4521', 'usr_7834')",
            database: "production",
          },
        },
      ]
    ),
    userMsg(
      4,
      "john.doe",
      "Are there any open JIRA issues related to this error?"
    ),
    agentMsg(
      5,
      "helper_agent",
      "Helper",
      "I searched JIRA for issues related to `PaymentService.processRefund NullPointerException` and found **no open tickets**. There are no existing bug reports or tasks tracking this issue.",
      [
        {
          functionCallName: "jira__search_issues",
          status: "succeeded",
          internalMCPServerName: "jira",
          params: {
            jql: "text ~ 'PaymentService processRefund NullPointerException' AND status != Done",
            project: "ENG",
          },
        },
      ]
    ),
    userMsg(
      6,
      "john.doe",
      "Ok, can you search our codebase on GitHub to find the root cause?"
    ),
    agentMsg(
      7,
      "helper_agent",
      "Helper",
      `I found the root cause by examining the code:

**File: src/services/PaymentService.ts (line 142)**
The method \`processRefund\` accesses \`payment.user.subscription.refundPolicy\` without a null check. The \`subscription\` field can be null when a user has cancelled their subscription.

**File: src/models/Payment.ts**
The Payment model defines \`user.subscription\` as optional (\`Subscription | null\`), confirming this is an expected nullable field.

**Root cause**: Missing null check on \`subscription\` before accessing \`refundPolicy\`. When a user cancels their subscription and then requests a refund for a previous charge, the subscription is null, causing the NullPointerException.`,
      [
        {
          functionCallName: "github__search_code",
          status: "succeeded",
          internalMCPServerName: "github",
          params: {
            query: "processRefund PaymentService",
            repo: "acme/payment-service",
          },
        },
        {
          functionCallName: "github__get_file",
          status: "succeeded",
          internalMCPServerName: "github",
          params: {
            repo: "acme/payment-service",
            path: "src/services/PaymentService.ts",
          },
        },
        {
          functionCallName: "github__get_file",
          status: "succeeded",
          internalMCPServerName: "github",
          params: {
            repo: "acme/payment-service",
            path: "src/models/Payment.ts",
          },
        },
      ]
    ),
    userMsg(
      8,
      "john.doe",
      "Great analysis! Can you write a full triage report with all findings? Include the occurences, the root cause analysis and recommended fixes"
    ),
    agentMsg(
      9,
      "helper_agent",
      "Helper",
      `# Bug Triage Report: NullPointerException in PaymentService.processRefund()

## Summary
A NullPointerException occurs at line 142 of PaymentService.processRefund() when processing refunds for users with cancelled subscriptions.

## Occurrences
| # | Timestamp | User ID | User Name | Plan |
|---|-----------|---------|-----------|------|
| 1 | 2024-02-15 14:23 UTC | usr_4521 | Alice Martin | Enterprise |
| 2 | 2024-02-15 16:45 UTC | usr_7834 | Bob Chen | Pro |
| 3 | Current report | - | - | - |

**JIRA Status**: No existing tickets found.

## Root Cause
Missing null check on payment.user.subscription in PaymentService.processRefund() (line 142). The subscription field is nullable but the code accesses .refundPolicy without a guard.

**Trigger condition**: User cancels subscription then requests refund for previous charge.

## Recommended Fixes
1. Add null check before accessing refundPolicy
2. Add database constraint or service-level validation for cancelled-subscription refunds
3. Add unit tests covering the cancelled-subscription refund path

## Severity
**High** - Affects paying customers on premium plans. 3 occurrences in 24 hours.`
    ),
  ],
};

function buildShrinkWrapInitialMessage(
  conversation: ShrinkWrapConversationData
): string {
  const conversationText = formatConversationForShrinkWrap(conversation);
  return buildFirstMessage(conversationText);
}

function buildShrinkWrapConversationWithClarifyingInstructions(
  conversation: ShrinkWrapConversationData,
  agentClarifyingResponse: string,
  userInstruction: string
): ConversationMessage[] {
  return [
    { role: "user", content: buildShrinkWrapInitialMessage(conversation) },
    { role: "assistant", content: agentClarifyingResponse },
    { role: "user", content: userInstruction },
  ];
}

export const shrinkWrapSuite: TestSuite = {
  name: "shrink-wrap",
  description: "Creating agents from existing conversations (shrink-wrap)",
  testCases: [
    {
      scenarioId: "bug-triage-clarificationclarification",
      userMessage: buildShrinkWrapInitialMessage(BUG_TRIAGE_CONVERSATION),
      mockState: BLANK_AGENT,
      judgeCriteria: `This is a shrink-wrap scenario where the sidekick receives a conversation but NO explicit user instruction. The sidekick must clarify with the user before making changes.

The sidekick MUST ask a clarifying question that demonstrates understanding of the conversation (e.g., mentioning bug triage, error investigation, inputs/outputs/workflow). It must NOT call suggest_prompt_edits, suggest_tools, or suggest_knowledge without first getting user confirmation.

Score 0-1 if the sidekick starts building the agent (calling suggest_prompt_edits or suggest_tools) without asking the user first, or asks a generic question without showing understanding of the conversation.`,
    },
    {
      scenarioId: "bug-triage-report",
      conversation: buildShrinkWrapConversationWithClarifyingInstructions(
        BUG_TRIAGE_CONVERSATION,
        `I can see this conversation follows a clear bug investigation workflow. Before I create the agent, let me confirm a few things:

- **Inputs**: The user provides an error message or stack trace.
- **Output**: A structured bug triage report with occurrences, affected users, root cause analysis, and recommended fixes.
- **Goal**: Automate the investigation process by searching logs, querying user data, checking for existing issues, and analyzing code.

Does this match what you want, or would you like to adjust anything?`,
        "Make an agent which reproduces the investigation and report process given an error."
      ),
      mockState: BLANK_AGENT,
      expectedToolCalls: [
        "get_agent_config",
        "suggest_prompt_edits",
        "suggest_tools",
      ],
      judgeCriteria: `This is a shrink-wrap scenario: the sidekick must analyze a bug triage conversation and suggest a reusable agent configuration.

REQUIRED tool suggestions (suggest_tools must include ALL of these):
- Datadog (for searching error logs and occurrences)
- GitHub (for searching codebase / root cause analysis)
- JIRA (for checking existing issues)

REQUIRED knowledge suggestion (suggest_knowledge must be called):
- Snowflake or a database/data warehouse source (for looking up user information)

REQUIRED instructions (suggest_prompt_edits):
- The agent workflow must include: search similar occurrences on Datadog, check for existing JIRA issues, look up affected users via Snowflake/database, search code for root cause on GitHub, and produce a structured triage report.
- Output format: the instructions must describe a structured bug triage report format (with sections like summary, occurrences, root cause, recommended fixes, severity).

Score 0-1 if:
- Any of the three tools (Datadog, GitHub, JIRA) are missing from suggest_tools
- suggest_knowledge is not called (Snowflake data source must be suggested)
- The suggested instructions don't describe a multi-step triage workflow
- The suggested instructions don't mention a structured report output format

Score 2 if tools and knowledge are suggested but the workflow steps or report format are incomplete.
Score 3 if all tools, knowledge, workflow steps, and report format are correctly suggested.`,
    },
  ],
};
