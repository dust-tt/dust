export type Member = {
  id: string;
  name: string;
  email: string;
  role: "Admin" | "Manager" | "Member";
  status: string;
  groups: string[];
  seat: "Pro" | "Max" | "Platform";
  seatUsage: number | null;
  poolUsed: number;
  poolLimit: number;
};

export const MEMBERS: Member[] = [
  { id: "1", name: "Dev Dust", email: "dev@dust.tt", role: "Member", status: "Active (Invited)", groups: [], seat: "Pro", seatUsage: 100, poolUsed: 137208, poolLimit: 300000 },
  { id: "2", name: "thomas+newtest4 d", email: "thomas+newtest4@dust.tt", role: "Member", status: "Active (Invited)", groups: [], seat: "Pro", seatUsage: 12, poolUsed: 2100, poolLimit: 300000 },
  { id: "3", name: "Édouard Perso Wautier", email: "edouardwautier@gmail.com", role: "Member", status: "Active (Invited)", groups: [], seat: "Platform", seatUsage: null, poolUsed: 112473, poolLimit: 300000 },
  { id: "4", name: "Accounts Dust", email: "accounts@dust.tt", role: "Member", status: "Active (Auto-joined)", groups: [], seat: "Pro", seatUsage: 3, poolUsed: 400, poolLimit: 300000 },
  { id: "5", name: "Nelson Wang", email: "nelson-ext@dust.tt", role: "Member", status: "Active (Auto-joined)", groups: [], seat: "Platform", seatUsage: null, poolUsed: 91204, poolLimit: 300000 },
  { id: "6", name: "Plamédie Bola", email: "plamedie-ext@dust.tt", role: "Member", status: "Active (Auto-joined)", groups: [], seat: "Platform", seatUsage: null, poolUsed: 84879, poolLimit: 300000 },
  { id: "7", name: "Sophie Bergeret", email: "sophie-ext@dust.tt", role: "Member", status: "Active (Provisioned)", groups: ["Team"], seat: "Pro", seatUsage: 55, poolUsed: 116130, poolLimit: 300000 },
  { id: "8", name: "Gaëtan Gachet", email: "gaetan@dust.tt", role: "Member", status: "Active (Auto-joined)", groups: [], seat: "Max", seatUsage: 100, poolUsed: 568400, poolLimit: 1500000 },
  { id: "9", name: "Ru Chikwenengere", email: "ru.chikwenengere-ext@dust.tt", role: "Member", status: "Active (Auto-joined)", groups: [], seat: "Platform", seatUsage: null, poolUsed: 65742, poolLimit: 300000 },
  { id: "10", name: "Stanislas Polu", email: "spolu@dust.tt", role: "Admin", status: "Active (Provisioned)", groups: ["Dev", "Team", "Team-France", "Admin-US", "Admin", "Engineering-Mdm"], seat: "Max", seatUsage: 100, poolUsed: 341416, poolLimit: 1500000 },
  { id: "11", name: "Nhat Phung Blanchard", email: "nhat.pb@dust.tt", role: "Member", status: "Active (Provisioned)", groups: ["Sales", "Team-France", "Team-Gtm"], seat: "Platform", seatUsage: null, poolUsed: 263823, poolLimit: 300000 },
  { id: "12", name: "Ellen Woodcock", email: "ellen.woodcock@dust.tt", role: "Manager", status: "Active (Provisioned)", groups: ["Team", "Team-Us", "Team-Gtm", "Team-Sf", "Area-Leads"], seat: "Platform", seatUsage: null, poolUsed: 228033, poolLimit: 500000 },
  { id: "13", name: "Ulysse Levallois", email: "ulysse@dust.tt", role: "Member", status: "Active (Provisioned)", groups: ["Dev", "Team", "Team-France", "Support-Mdm", "Billing-Mdm"], seat: "Platform", seatUsage: null, poolUsed: 104104, poolLimit: 350000 },
  { id: "14", name: "Flavien David", email: "flavien@dust.tt", role: "Admin", status: "Active (Provisioned)", groups: ["Dev", "Team", "Team-France", "Support", "Engineering-Mdm", "Eng-Tenured"], seat: "Max", seatUsage: 100, poolUsed: 152529, poolLimit: 1500000 },
  { id: "15", name: "Sheena Badani", email: "sheena-ext@dust.tt", role: "Member", status: "Unregistered (Provisioned)", groups: ["Contractors-Dust-Mdm"], seat: "Pro", seatUsage: 0, poolUsed: 0, poolLimit: 300000 },
];

export type Group = {
  id: string;
  name: string;
  members: number;
  origin: "Provisioned" | "Manual";
  seat: "Pro" | "Max" | "Platform" | "—";
  monthlyLimit: string;
  tier: string;
};

export const GROUPS: Group[] = [
  { id: "g1", name: "team-france", members: 41, origin: "Provisioned", seat: "Max", monthlyLimit: "1,500,000", tier: "Frontier" },
  { id: "g2", name: "team-us", members: 22, origin: "Provisioned", seat: "Pro", monthlyLimit: "300,000", tier: "Standard" },
  { id: "g3", name: "team-nyc", members: 9, origin: "Provisioned", seat: "Pro", monthlyLimit: "300,000", tier: "Standard" },
  { id: "g4", name: "team-sf", members: 13, origin: "Provisioned", seat: "Pro", monthlyLimit: "300,000", tier: "Standard" },
  { id: "g5", name: "engineering-mdm", members: 27, origin: "Provisioned", seat: "Max", monthlyLimit: "1,500,000", tier: "Frontier" },
  { id: "g6", name: "support-mdm", members: 18, origin: "Provisioned", seat: "Pro", monthlyLimit: "350,000", tier: "Standard" },
  { id: "g7", name: "security-mdm", members: 3, origin: "Provisioned", seat: "—", monthlyLimit: "—", tier: "—" },
  { id: "g8", name: "Billing", members: 2, origin: "Manual", seat: "—", monthlyLimit: "—", tier: "—" },
  { id: "g9", name: "ai-ops", members: 5, origin: "Manual", seat: "Max", monthlyLimit: "1,000,000", tier: "Frontier" },
];

export type ApiKey = {
  id: string;
  name: string;
  owner: string;
  scope: "Read & write" | "Read-only";
  key: string;
  used: number;
  cap: number | null;
  lastUsed: string;
  status: "Active" | "Revoked";
};

export const API_KEYS: ApiKey[] = [
  { id: "k1", name: "Arthur Demo hackathon", owner: "Arthur Verrezt", scope: "Read-only", key: "9558", used: 5, cap: null, lastUsed: "1 day ago", status: "Active" },
  { id: "k2", name: "Arthur Demo hackathon", owner: "Arthur Verrezt", scope: "Read-only", key: "c603", used: 5, cap: null, lastUsed: "Never", status: "Revoked" },
  { id: "k3", name: "thomas", owner: "Thomas Draier", scope: "Read-only", key: "7f6f", used: 70, cap: null, lastUsed: "14 days ago", status: "Active" },
  { id: "k4", name: "Default Integration", owner: "Zeid Marouf", scope: "Read-only", key: "0a46", used: 0, cap: null, lastUsed: "Never", status: "Active" },
  { id: "k5", name: "Default Integration", owner: "Zeid Marouf", scope: "Read-only", key: "15a5", used: 0, cap: null, lastUsed: "Never", status: "Revoked" },
  { id: "k6", name: "[GROWTH] - SIGNAL HUNTER", owner: "Zeid Marouf", scope: "Read-only", key: "2f46", used: 0, cap: null, lastUsed: "1 month ago", status: "Active" },
  { id: "k7", name: "zapier-prod", owner: "Gaëtan Gachet", scope: "Read & write", key: "b21e", used: 124800, cap: 200000, lastUsed: "2 min ago", status: "Active" },
  { id: "k8", name: "analytics-etl", owner: "Flavien David", scope: "Read-only", key: "77ac", used: 31000, cap: null, lastUsed: "1 h ago", status: "Active" },
];

export type Trigger = {
  id: string;
  name: string;
  owner: string;
  agent: string;
  type: "Schedule" | "Webhook";
  credits: string;
  pool: "Workspace" | "Member";
  enabled: boolean;
};

export const TRIGGERS: Trigger[] = [
  { id: "t1", name: "Fathom Post Call Trigger - Nic", owner: "Nic Siegle", agent: "morty", type: "Webhook", credits: "42.2K", pool: "Workspace", enabled: true },
  { id: "t2", name: "Schedule", owner: "Zeid Marouf", agent: "z", type: "Schedule", credits: "26.3K", pool: "Workspace", enabled: true },
  { id: "t3", name: "Nic OS - Evening Engine - 7pm", owner: "Nic Siegle", agent: "dust-lionel-high", type: "Schedule", credits: "20.4K", pool: "Member", enabled: true },
  { id: "t4", name: "EV-Fathom-Personal-Trigger", owner: "Edouard Villette", agent: "ChubbyHubby", type: "Webhook", credits: "19.9K", pool: "Workspace", enabled: true },
  { id: "t5", name: "Claap Events", owner: "Nic Siegle", agent: "morty", type: "Webhook", credits: "19.9K", pool: "Member", enabled: true },
  { id: "t6", name: "Nic OS - Morning Engine - 4:30am", owner: "Nic Siegle", agent: "dust-lionel-high", type: "Schedule", credits: "18.3K", pool: "Member", enabled: true },
  { id: "t7", name: "NEW schedule", owner: "Victor Blanc", agent: "dust-lionel", type: "Schedule", credits: "17.8K", pool: "Member", enabled: false },
  { id: "t8", name: "Schedule", owner: "Pierre Milliotte", agent: "ModelSupport", type: "Schedule", credits: "17.2K", pool: "Member", enabled: true },
];

export type Workflow = { id: string; name: string; spaces: string; added: string };
export const WORKFLOWS: Workflow[] = [
  { id: "w1", name: "Incident summary", spaces: "Engineering", added: "Aug 14, 2026" },
  { id: "w2", name: "Deal desk approval", spaces: "Sales, Company", added: "Jul 2, 2026" },
];

export type Invoice = { id: string; date: string; amount: string; status: "Paid" | "Open" };
export const INVOICES: Invoice[] = [
  { id: "INV-2026-09", date: "Sep 1, 2026", amount: "0.00€", status: "Open" },
  { id: "INV-2026-08", date: "Aug 1, 2026", amount: "0.00€", status: "Paid" },
  { id: "INV-2026-07", date: "Jul 1, 2026", amount: "0.00€", status: "Paid" },
];

export type Provider = {
  id: string;
  name: string;
  models: string;
  enabledForAgents: boolean;
  appKey: string | null;
};
export const PROVIDERS: Provider[] = [
  { id: "openai", name: "OpenAI", models: "GPT 6 Astra, GPT 6 Sol, GPT 6 Luna, GPT 5.6 Sol, GPT 5.6 Terra, GPT 5.6 Terra (long context), GPT 5.6 Luna, GPT-5.4 Mini, GPT-5.4 Nano", enabledForAgents: true, appKey: "•••••••••••••••••••••••••••••••••••••••••••••••_" },
  { id: "azure", name: "Azure OpenAI", models: "", enabledForAgents: false, appKey: "•••••••••••••••••••••••••••••••••a968" },
  { id: "anthropic", name: "Anthropic", models: "Claude Opus 5.5, Claude Fable 5.1, Claude Fable 5, Claude Opus 5, Claude Sonnet 5, Claude Opus 4.8, Claude Sonnet 4.6, Claude 4.5 Haiku", enabledForAgents: true, appKey: "•••••••••••••••••••••••••••••••••••••••••••••••_" },
  { id: "mistral", name: "Mistral AI", models: "Mistral Large, Mistral Medium 3.5, Mistral Small, Mistral Codestral", enabledForAgents: true, appKey: "•••••••••••••••••••••••••••••••••odUt" },
  { id: "google", name: "Google", models: "Gemini 3.8 Flash, Gemini 3.7 Flash, Gemini 3.5 Flash Lite, Gemini 3.1 Pro (Preview), Gemini 3.1 Flash Lite", enabledForAgents: true, appKey: "•••••••••••••••••••••••••••••••••QxYx" },
  { id: "deepseek", name: "Deepseek", models: "", enabledForAgents: false, appKey: "•••••••••••••••••••••••••••••••••9d2c" },
  { id: "fireworks", name: "Fireworks", models: "DeepSeek V4.1 Flash, Kimi K3, GLM-5.3, GLM-5.3 Flash, Inkling", enabledForAgents: true, appKey: null },
  { id: "xai", name: "xAI", models: "Grok 4.7, Grok 4.6", enabledForAgents: true, appKey: null },
];

export type Skill = { id: string; name: string; editors: string; enabled: boolean; spent: number; cap: number; locked: boolean };
export const SKILLS: Skill[] = [
  { id: "s1", name: "Write release notes", editors: "engineering-mdm", enabled: true, spent: 620, cap: 2000, locked: false },
  { id: "s2", name: "Qualify inbound lead", editors: "team-us", enabled: true, spent: 2000, cap: 2000, locked: true },
  { id: "s3", name: "Summarize support thread", editors: "support-mdm", enabled: false, spent: 0, cap: 2000, locked: false },
];

export const SECRETS = [
  "ASHBY_API_KEY",
  "ATLASSIAN_API_TOKEN",
  "BIG_QUERY_ACCESS_TOKEN",
  "CURSOR_TEST",
  "DBT_API_KEY",
  "DUST_TOKEN",
  "ED_FIGBOT",
  "ELIA_VAL_TOWN_API_KEY",
  "FIRECRAWL",
  "FRANK_GURU_PASSWORD",
  "FRANK_OPENAI_TEST_KEY",
  "FRONT_SUPPORT_TOKEN",
];

export const ALLOWED_DOMAINS = [
  "*.dust.tt",
  "*.licdn.com",
  "*.youtube.com",
  "api.1password.com",
  "api.datadoghq.eu",
  "api.envoy.com",
];

/** name, consumption share, total credits, active / total members, vs workspace avg, vs prev */
export const ATTRIBUTION = {
  agents: [
    ["dust", "45%", "2.86M", "118 / 136", "+12%", "+4%"],
    ["support", "11%", "699K", "24 / 136", "-3%", "+9%"],
    ["deep-dive", "8%", "508K", "31 / 136", "+21%", "-2%"],
    ["dust-lionel-high", "6%", "381K", "3 / 136", "+140%", "+18%"],
    ["morty", "5%", "318K", "2 / 136", "+96%", "+1%"],
  ],
  members: [
    ["Nic Siegle", "9%", "568K", "—", "+180%", "+22%"],
    ["Ilias Bettahi", "5%", "341K", "—", "+68%", "-4%"],
    ["Maxence Garnier", "4%", "264K", "—", "+30%", "+6%"],
  ],
  keys: [
    ["zapier-prod", "2%", "125K", "—", "—", "+3%"],
    ["analytics-etl", "0.5%", "31K", "—", "—", "-1%"],
    ["thomas", "<0.1%", "70", "—", "—", "0%"],
  ],
  triggers: [
    ["Fathom Post Call Trigger - Nic", "0.7%", "42.2K", "—", "+2.1×", "+4%"],
    ["Schedule", "0.4%", "26.3K", "—", "+1.3×", "0%"],
    ["Nic OS - Evening Engine - 7pm", "0.3%", "20.4K", "—", "+1.0×", "-6%"],
  ],
  skills: [
    ["Qualify inbound lead", "<0.1%", "2,000", "—", "—", "+12%"],
    ["Write release notes", "<0.1%", "620", "—", "—", "+3%"],
  ],
};
