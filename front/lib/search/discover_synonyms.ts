const SYNONYM_GROUPS: string[][] = [
  ["summarize", "summary", "recap", "digest", "tldr", "brief"],
  ["meeting", "call", "sync", "standup", "notes"],
  ["email", "mail", "inbox", "gmail", "outlook"],
  ["write", "draft", "compose", "redact", "copywriting"],
  ["translate", "translation", "translator", "localize"],
  ["research", "search", "investigate", "find", "lookup"],
  ["sales", "deal", "prospect", "lead", "crm", "outbound"],
  ["support", "ticket", "helpdesk", "customer", "zendesk"],
  ["code", "coding", "developer", "engineering", "github", "review"],
  ["doc", "document", "docs", "documentation", "wiki", "notion"],
  ["slides", "presentation", "deck", "pptx", "powerpoint"],
  ["spreadsheet", "sheet", "excel", "xlsx", "csv", "table"],
  ["report", "analysis", "analytics", "dashboard", "metrics", "kpi"],
  ["hiring", "recruiting", "recruiter", "candidate", "interview", "hr"],
  ["legal", "contract", "compliance", "policy", "nda"],
  ["marketing", "campaign", "seo", "content", "social"],
  ["bug", "issue", "incident", "error", "debug"],
  ["onboarding", "onboard", "welcome", "training"],
  ["plan", "planning", "roadmap", "priorities", "okr"],
  ["finance", "budget", "invoice", "expense", "accounting"],
];

const SYNONYMS_BY_TERM = new Map<string, string[]>(
  SYNONYM_GROUPS.flatMap((group) =>
    group.map((term) => [term, group.filter((other) => other !== term)])
  )
);

export function getDiscoverSynonyms(term: string): string[] {
  const normalized = term.toLowerCase();
  return (
    SYNONYMS_BY_TERM.get(normalized) ??
    SYNONYMS_BY_TERM.get(normalized.replace(/s$/, "")) ??
    []
  );
}
