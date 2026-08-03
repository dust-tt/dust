import type {
  ChatStoryline,
  ChatStorylineSection,
  IntegrationBase,
  IntegrationPageConfig,
} from "../types";

import {
  analyzeToolShape,
  pickAnyTools,
  pickToolsForIntent,
} from "./toolShapeAnalysis";

// Extract a small, deduplicated set of domain nouns from a partner's tool
// names. Tool names typically follow `<verb>-<noun>` or `<verb><Noun>`
// patterns (search-records, getIssue, postMessage), so the noun is the last
// token after splitting on non-alphanumerics and stripping the verb prefix.
//
// Used by the heuristic chat generator to produce bullets that read coherent
// with the partner's domain ("Recent records: ..." instead of "Recent
// items: ..."). Hand-authored storylines bypass this entirely.
function extractDomainNouns(tools: IntegrationBase["tools"]): string[] {
  const VERB_TOKENS = new Set([
    "search",
    "list",
    "get",
    "fetch",
    "read",
    "find",
    "show",
    "describe",
    "view",
    "create",
    "post",
    "send",
    "add",
    "draft",
    "upsert",
    "update",
    "edit",
    "write",
    "delete",
    "remove",
    "summarize",
  ]);

  const counts = new Map<string, number>();
  for (const tool of tools) {
    // Split on common name separators: dashes, underscores, camelCase
    // boundaries. Keep alphabetic tokens only.
    const parts = tool.name
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .split(/[^a-zA-Z]+/)
      .map((p) => p.toLowerCase())
      .filter((p) => p.length > 0 && !VERB_TOKENS.has(p));

    for (const part of parts) {
      counts.set(part, (counts.get(part) ?? 0) + 1);
    }
  }

  // Sort by frequency desc so the most common noun shows up first.
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([noun]) => noun);
}

function singular(noun: string): string {
  // Tiny heuristic: strip a trailing "s" if not "ss". Misses irregular
  // plurals (people, leaves) but works for the noun shapes we see in MCP
  // tool names (records, issues, messages, contacts, deals).
  if (noun.endsWith("ss")) {
    return noun;
  }
  if (noun.endsWith("ies") && noun.length > 3) {
    return `${noun.slice(0, -3)}y`;
  }
  if (noun.endsWith("s") && noun.length > 1) {
    return noun.slice(0, -1);
  }
  return noun;
}

function plural(noun: string): string {
  if (noun.endsWith("s") || noun.endsWith("ies")) {
    return noun;
  }
  if (noun.endsWith("y") && noun.length > 1) {
    return `${noun.slice(0, -1)}ies`;
  }
  return `${noun}s`;
}

function capitalize(s: string): string {
  if (s.length === 0) {
    return s;
  }
  return s[0].toUpperCase() + s.slice(1);
}

// Build a heuristic chat storyline for a partner that doesn't have a
// hand-authored `enrichment.chatStoryline`. The output is intentionally
// generic but uses real tool names + partner domain nouns so each page reads
// distinctly even without curation. When a top partner needs more polish,
// override in configs/index.ts.
function generateGenericStoryline(integration: IntegrationBase): ChatStoryline {
  const shape = analyzeToolShape(integration.tools);
  const nouns = extractDomainNouns(integration.tools);
  // Domain noun used in the user prompt + bullets. Falls back to a generic
  // word if extraction found nothing usable.
  const primaryNoun = nouns[0] ?? "activity";
  const primaryPlural = plural(primaryNoun);

  // Pick the tools we want the agent to "call". Prefer read tools (the
  // chat is a "show me what's happening" scenario for most partners);
  // when the partner is write-heavy, include a write tool so the chip
  // strip reads true to the integration's character.
  let toolCalls: string[];
  if (shape.bias === "write-heavy") {
    toolCalls = [
      ...pickToolsForIntent(shape, "write", 2),
      ...pickToolsForIntent(shape, "read", 1),
    ];
  } else {
    toolCalls = pickToolsForIntent(shape, "read", 4);
  }
  // Deduplicate + fall back to anything we have if the pick came up short.
  toolCalls = Array.from(new Set(toolCalls));
  if (toolCalls.length < 3) {
    const filler = pickAnyTools(shape, 4).filter((t) => !toolCalls.includes(t));
    toolCalls = [...toolCalls, ...filler].slice(0, 4);
  }

  // User prompt: a generic "catch me up" question keyed by tool bias.
  const userPrompt =
    shape.bias === "write-heavy"
      ? `Draft an update for our latest ${primaryPlural} in ${integration.name}.`
      : `Give me a recap of recent ${primaryPlural} in ${integration.name}.`;

  // Response intro: short paragraph mentioning the partner + the actions taken.
  const responseIntro =
    shape.bias === "write-heavy"
      ? `Pulled the latest ${primaryPlural} from ${integration.name} and drafted what's worth sharing. Here's a quick summary you can edit:`
      : `I checked your ${integration.name} workspace and surfaced what changed this week. Here's the short version:`;

  // Build 2 response sections with bullets. The bullets use placeholder
  // example labels — coherent with the partner's domain noun, not specific
  // company names — so the mockup reads like a believable agent output for
  // any partner without inventing customer-shaped data.
  const responseSections: ChatStorylineSection[] = [
    {
      heading: `New ${primaryPlural} (3)`,
      bullets: [
        {
          title: `${capitalize(singular(primaryNoun))} #1042`,
          body: `Added 2 days ago — flagged as high priority. Last updated by the ${integration.name} sync.`,
        },
        {
          title: `${capitalize(singular(primaryNoun))} #1041`,
          body: "Touched yesterday; an owner change needs a follow-up.",
        },
        {
          title: `${capitalize(singular(primaryNoun))} #1039`,
          body: "Three field edits this week — worth reviewing before your next sync.",
        },
      ],
    },
    {
      heading: "Activity highlights",
      bullets: [
        {
          title: "Most-touched item",
          body: `The top ${singular(primaryNoun)} this week saw 4 updates from 2 collaborators.`,
        },
        {
          title: "Stale items",
          body: `2 ${primaryPlural} haven't been updated in 14+ days — likely worth a check-in.`,
        },
      ],
    },
  ];

  const followUpPrompt =
    shape.bias === "write-heavy"
      ? `Want me to push these updates back to ${integration.name}?`
      : `Want me to draft follow-ups for the stale ${primaryPlural}?`;

  return {
    userPrompt,
    toolCalls,
    completedInSeconds: 12,
    responseIntro,
    responseSections,
    followUpPrompt,
  };
}

// Public entry point. Returns the hand-authored storyline if present; falls
// back to the generic generator otherwise.
//
// Returns `null` only if the integration has no tools at all and no override
// — in that case the section should hide itself rather than render an empty
// chat. IntegrationChatMockupSection handles the null case.
export function getChatStorylineForIntegration(
  integration: IntegrationPageConfig
): ChatStoryline | null {
  const override = integration.enrichment?.chatStoryline;
  if (override) {
    return override;
  }
  if (integration.tools.length === 0) {
    return null;
  }
  return generateGenericStoryline(integration);
}
