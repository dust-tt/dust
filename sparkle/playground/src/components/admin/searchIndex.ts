/** One searchable setting: where it lives and how people might ask for it. */
export type SettingEntry = {
  label: string;
  page: string; // NAV id
  tab: string; // AdminTabs value
  section: string;
  keywords?: string;
};

const e = (page: string, tab: string, section: string, items: (string | [string, string])[]): SettingEntry[] =>
  items.map((it) =>
    typeof it === "string"
      ? { page, tab, section, label: it }
      : { page, tab, section, label: it[0], keywords: it[1] }
  );

export const SEARCH_INDEX: SettingEntry[] = [
  // Members
  ...e("people", "members", "Members", [
    ["Member list", "name email role status groups"],
    ["Search members", "filter by role"],
    ["Invite members", "invitation email"],
    ["Invitations", "pending invites resend revoke"],
    ["Change a member's role", "admin manager member update role"],
  ]),
  ...e("people", "members", "Joining the workspace", [
    ["Auto-join Workspace", "verified domain auto join enrollment"],
  ]),
  ...e("people", "groups", "Groups", [
    ["Groups list", "member count provisioned manual"],
    ["Create group", "manual group"],
    ["Delete group", "edit manual group"],
  ]),
  ...e("people", "groups", "User provisioning", [
    ["Directory sync", "gsuite google workspace scim workos provisioning"],
    ["View synced groups", "directory groups"],
  ]),
  ...e("people", "roles", "Roles", [
    ["Admin role groups", "full administrative control"],
    ["Manager role groups", "members groups roles analytics"],
  ]),
  ...e("people", "roles", "Billing and security", [
    ["Access billing features", "billing settings invoices payment methods groups"],
    ["Access security features", "user access identities provisioning groups"],
  ]),

  // Security
  ...e("security", "identity", "Domain Verification", [
    ["Verified domains", "domain status"],
    ["Add Domain", "verify company domain"],
  ]),
  ...e("security", "identity", "Authentication and access", [
    ["Single Sign-On (SSO)", "workos google oidc saml idp configure de-activate"],
    ["Enforce SSO login", "disable social logins"],
  ]),
  ...e("security", "network", "Network", [
    ["Agent-requested domains", "computer sandbox approval per domain"],
    ["Allowed domains", "network allowlist wildcard exact domain workspace pod egress computer"],
  ]),
  ...e("security", "audit", "Audit Logs", [
    ["View Logs", "workspace activity logs audit"],
    ["Configure Export", "siem export audit"],
    ["Emit audit events to WorkOS", "audit logs section"],
  ]),

  // Governance
  ...e("governance", "agents", "Agents", [
    ["Create agents", "who can create agents agent builder permission"],
    ["Publish agents", "publish to whole workspace permission"],
  ]),
  ...e("governance", "agents", "Skills", [
    ["Create skills", "custom skills permission"],
    ["Manage skill availability", "skills available across workspace"],
    ["Make skills discoverable to agents", "@dust discover skills"],
  ]),
  ...e("governance", "agents", "Self-Improving Skills", [
    ["Allow self-improving skills", "self improving skills reinforcement analyze conversations"],
    ["Enable batch processing", "self improving skills zdr immediate data deletion batches"],
    ["Self-improving skills list", "per skill editors enabled currently spent lock state"],
  ]),
  ...e("governance", "pods", "Pods", [
    ["Restricted and Open Pods", "members create open pods"],
    ["Pod files", "manually add files to pods manual updates"],
  ]),
  ...e("governance", "pods", "Frames", [
    ["Frame sharing", "shareable outside workspace restriction"],
    ["Invite people by email", "frames external sharing"],
    ["Share by public link", "frames public links"],
  ]),
  ...e("governance", "pods", "Automations", [
    ["Charge automations to the workspace", "trigger workspace credit pool instead of their own"],
  ]),
  ...e("governance", "features", "Workspace Name", [["Workspace Name", "rename workspace edit"]]),
  ...e("governance", "features", "Features", [
    ["Voice transcription", "dictation conversations"],
    ["Email and Slack notifications", "conversation notifications"],
    ["Private conversation URLs by default", "conversation privacy participants"],
    ["Workspace Analyst", "analyst agent analytics tools admins"],
    ["Archive unused agents", "archive them once auto"],
    ["Inactivity threshold", "days unmentioned archived schedule excluded"],
  ]),

  // Credits
  ...e("credits", "seats", "Credit pool", [
    ["Remaining credits in the pool", "credit pool usage"],
    ["Used this cycle", "cycle day"],
    ["Programmatic usage this cycle", "api triggers share"],
    ["Add credits", "buy credits top-up purchase"],
  ]),
  ...e("credits", "seats", "Members", [
    ["Member seats", "pro max platform seat usage pool usage"],
    ["Change seat type", "upgrade seat assign seat remove seat"],
    ["Edit spend limit", "override member limit"],
    ["Bulk selection", "batch change seat batch edit spend limit"],
    ["Upgrade requests", "review member requests deny"],
  ]),
  ...e("credits", "groups", "Groups", [
    ["Group granted seat", "per group seat"],
    ["Group monthly spend limit", "per group limit highest limit wins"],
  ]),
  ...e("credits", "topups", "Top-ups history", [
    ["Cycle history", "used credits per cycle"],
    ["Top-ups history", "credit grants added credits expiration bonus purchased"],
  ]),
  ...e("credits", "settings", "Spending policies", [
    ["Default per-user workspace credit pool monthly limit", "spending policy default limit"],
    ["Upgrade request", "allow members request upgrade"],
    ["Require a reason for upgrade requests", "justification"],
    ["Auto-upgrade seats", "free pro max at limit"],
    ["Credit spend checkpoint", "pause agent message threshold"],
  ]),
  ...e("credits", "settings", "Programmatic usage", [
    ["Programmatic monthly limit", "api keys triggers block programmatic access"],
    ["Self-improving skills global spending cap", "self improving skills monthly cap credits"],
    ["Default cost cap per skill", "self improving skills per run cap"],
  ]),
  ...e("credits", "settings", "Notifications", [
    ["Workspace credit pool threshold alert", "email alert pool percent"],
    ["Upgrade request emails", "email admins managers"],
  ]),

  // Billing
  ...e("billing", "info", "Billing information", [
    ["Subscription", "plan status frequency next billing date amount cancel subscription"],
    ["Seats by type", "pro max platform yearly seats assigned credits per month"],
    ["Billing contact", "email"],
    ["Address", "billing address"],
    ["Payment method", "card visa"],
  ]),
  ...e("billing", "invoices", "Invoices", [["Invoices", "download invoice pdf"]]),

  // Analytics
  ...e("analytics", "overview", "Consumption", [
    ["Period selector", "this cycle this month this week"],
    ["Daily vs cumulative", "view chart"],
    ["Active members", "of 136 members active"],
    ["Used this period", "credits used cap kpi"],
    ["Messages", "credits per message avg cost"],
    ["Top agent", "share of consumption"],
    ["Consumption chart", "credits active users by agent"],
    ["Filters", "explore filter"],
  ]),
  ...e("analytics", "overview", "Attribution", [
    ["Attribution by agents", "consumption share total credits vs workspace avg vs prev"],
    ["Attribution by members", "users"],
    ["Attribution by groups", ""],
    ["Attribution by models", "reasoning effort"],
    ["Attribution by tools", ""],
    ["Attribution by skills", "self improving skills consumption current period spend"],
    ["Attribution by sources", ""],
    ["Attribution by triggers", "automations credits triggers enabled workspace pool slack workflows"],
    ["Attribution by API keys", "keys active credits used"],
    ["Download raw data", "export csv"],
    ["Ask @analyst", "analyst agent session"],
  ]),
  ...e("analytics", "export", "Exports", [["Export usage data", "csv download raw data"]]),

  // Models
  ...e("models", "providers", "Providers", [
    ["Make all providers available", "enable all"],
    ["Enable/disable AI providers", "openai anthropic mistral google fireworks xai models"],
    ["Embedding Provider", "semantic search embeddings"],
    ["EU-hosted models only", "data residency regional"],
  ]),
  ...e("models", "tiers", "Model access tiers", [
    ["Workspace access", "highest model tier standard advanced frontier"],
    ["Published agents", "run above member tier"],
    ["Group model tiers", "models tier per group"],
  ]),
  ...e("models", "apps", "App Credentials", [
    ["Model providers for Dust Apps", "api key openai azure anthropic mistral google ai studio deepseek fireworks xai app credentials"],
    ["Service Providers", "serpapi serper browserless google search web scrape"],
  ]),

  // Integrations
  ...e("integrations", "messaging", "Messaging apps", [
    ["Slack Bot", "slack reconnect"],
    ["Microsoft Teams Bot", "teams"],
    ["Discord Bot", "discord reconnect"],
    ['"Sent via Agent" Slack footer', "remove footer user credentials"],
  ]),
  ...e("integrations", "email", "Email", [["Email agents", "AGENT_NAME@dust.team reach agents by email"]]),
  ...e("integrations", "clients", "Clients & tools", [
    ["MCP server", "external mcp clients connect manage"],
    ["Browser Extension Tools", "list read browser tabs extension"],
  ]),

  // Automations
  ...e("automations", "triggers", "Triggers", [
    ["Triggers list", "schedule webhook owner agent credits pool enabled"],
    ["Set pool", "workspace pool member pool"],
    ["Filters", "type pool enabled"],
  ]),
  ...e("automations", "workflows", "Slack workflows", [
    ["Allow a workflow", "slack workflow spaces"],
    ["Workflows allowed", "list spaces added revoke"],
  ]),

  // Developers
  ...e("developers", "keys", "API keys", [
    ["Create API Key", "new key scope spaces monthly cap"],
    ["API Reference", "documentation docs"],
    ["API key list", "name scope key spaces credits last used status"],
    ["Revoke API key", "revoke"],
    ["Edit monthly cap", "per key credits cap"],
    ["Keys active", "kpi revoked"],
  ]),
  ...e("developers", "secrets", "Secrets", [
    ["Developer Secrets", "env.secrets dust apps mcp servers"],
    ["Create Secret", "secret name value"],
  ]),
  ...e("developers", "env", "Computer environment", [
    ["HTTPS secrets (DSEC_)", "computer encrypted outbound https allowlisted domains env"],
    ["Config (DST_)", "computer plain environment variables"],
    ["Write-only values", "snapshotted at computer start"],
  ]),
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9@]+/g, " ").trim();

/** A token matches if it, or a prefix of it (down to 3 chars, at most 3 chars shorter), appears in the haystack. */
function tokenMatches(hay: string, token: string) {
  for (let len = token.length; len >= Math.max(3, token.length - 3); len--) {
    if (hay.includes(token.slice(0, len))) {
      return true;
    }
  }
  return token.length < 3 && hay.includes(token);
}

export function searchSettings(query: string, pageLabel: (id: string) => string): SettingEntry[] {
  const tokens = norm(query).split(" ").filter(Boolean);
  if (tokens.length === 0) {
    return [];
  }
  const scored = SEARCH_INDEX.map((entry) => {
    const label = norm(entry.label);
    const hay = `${label} ${norm(entry.keywords ?? "")} ${norm(entry.section)} ${norm(pageLabel(entry.page))}`;
    if (!tokens.every((t) => tokenMatches(hay, t))) {
      return null;
    }
    // Label matches rank above keyword-only matches.
    const score = tokens.filter((t) => tokenMatches(label, t)).length * 2 + (label.startsWith(tokens[0]) ? 1 : 0);
    return { entry, score };
  }).filter((x): x is { entry: SettingEntry; score: number } => x !== null);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 12).map((x) => x.entry);
}
