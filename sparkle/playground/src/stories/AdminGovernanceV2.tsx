import {
  Avatar,
  ActionFrame,
  BarChart01,
  Brain,
  Robot,
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  Card,
  Checkbox,
  Chip,
  Code01,
  Settings01,
  CreditCard01,
  DataTable,
  Dialog,
  DialogClose,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DotsHorizontal,
  Fingerprint04,
  Folder,
  Globe01,
  Input,
  Key01,
  Label,
  LayerSingle,
  ListGroup,
  ListItem,
  LayersThree01,
  LayersTwo01,
  Lock01,
  Mail01,
  Microphone01,
  NavigationList,
  NavigationListCollapsibleSection,
  NavigationListItem,
  Page,
  PieChart01,
  Plus,
  Pencil01,
  PuzzlePiece01,
  ScrollArea,
  ScrollBar,
  SearchInput,
  Server01,
  SliderToggle,
  Toggle01Left,
  Tool01,
  Shield01,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  LayoutLeft,
  NavTabPill,
  NavTabPillContent,
  NavTabPillList,
  NavTabPillTrigger,
  IntersectDust,
  Planet,
  SidebarLayout,
  type SidebarLayoutRef,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextArea,
  Users01,
  XClose,
  CloudArrowLeftRight,
  Lightning01,
  ShapesPlus,
  ChevronRight,
  Trash01,
} from "@dust-tt/sparkle";
import {
  AmplitudeLogo,
  AnthropicLogo,
  AsanaLogo,
  AshbyLogo,
  AttioLogo,
  BigQueryLogo,
  ConfluenceLogo,
  FathomLogo,
  FireworksLogo,
  GeminiLogo,
  GithubLogo,
  GongLogo,
  DriveLogo,
  IntercomLogo,
  JiraLogo,
  LinearLogo,
  DiscordLogo,
  MicrosoftLogo,
  MicrosoftTeamsLogo,
  MistralLogo,
  NotionLogo,
  OpenaiLogo,
  SlackLogo,
  SnowflakeLogo,
  ZendeskLogo,
} from "@dust-tt/sparkle/logo/platforms";
import type { ColumnDef } from "@tanstack/react-table";
import React, { useEffect, useMemo, useRef, useState } from "react";

// ─── Global animation styles ──────────────────────────────────────────────────

const ANIMATION_CSS = `
  :root {
    --ease-out-cubic: cubic-bezier(0.215, 0.61, 0.355, 1);
    --ease-out-quart: cubic-bezier(0.165, 0.84, 0.44, 1);
    --ease-in-out-cubic: cubic-bezier(0.645, 0.045, 0.355, 1);
  }

  @keyframes ag-page-in {
    from { opacity: 0; transform: translateY(6px); filter: blur(3px); }
    to   { opacity: 1; transform: translateY(0);   filter: blur(0px); }
  }
  @keyframes ag-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes ag-chip-in {
    from { opacity: 0; transform: scale(0.92); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes ag-section-in {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes ag-chart-draw {
    from { stroke-dashoffset: 2000; }
    to   { stroke-dashoffset: 0; }
  }

  .ag-page-in    { animation: ag-page-in    180ms var(--ease-out-cubic) both; }
  .ag-fade-in    { animation: ag-fade-in    150ms var(--ease-out-cubic) both; }
  .ag-chip-in    { animation: ag-chip-in    140ms var(--ease-out-quart) both; }
  .ag-section-in { animation: ag-section-in 180ms var(--ease-out-cubic) both; }

  /* Chip stagger — each nth chip delays slightly so groups cascade in */
  .ag-chip-in:nth-child(2) { animation-delay: 20ms; }
  .ag-chip-in:nth-child(3) { animation-delay: 40ms; }
  .ag-chip-in:nth-child(4) { animation-delay: 60ms; }
  .ag-chip-in:nth-child(5) { animation-delay: 80ms; }
  .ag-chip-in:nth-child(6) { animation-delay: 100ms; }
  .ag-chip-in:nth-child(7) { animation-delay: 120ms; }
  .ag-chip-in:nth-child(n+8) { animation-delay: 140ms; }

  /* Button press feedback */
  .ag-btn-press:active { transform: scale(0.97); }
  .ag-btn-press { transition: transform 80ms ease-out; }

  /* Nav item hover polish */
  .ag-nav-item {
    transition: opacity 180ms var(--ease-out-cubic), background-color 120ms ease;
  }

  /* Model row hover */
  .ag-model-row {
    transition: background-color 120ms ease;
  }
  @media (hover: hover) and (pointer: fine) {
    .ag-model-row:hover { background-color: var(--color-muted); }
  }

  .ag-governance-row { }

  /* Chart line draw */
  .ag-chart-line {
    stroke-dasharray: 2000;
    stroke-dashoffset: 0;
    animation: ag-chart-draw 900ms var(--ease-out-cubic) both;
  }

  /* Reduced motion: crossfade fallback instead of hard cut */
  @media (prefers-reduced-motion: reduce) {
    .ag-page-in    { animation: ag-fade-in 100ms ease both; }
    .ag-section-in { animation: ag-fade-in 100ms ease both; }
    .ag-chip-in    { animation: ag-fade-in 100ms ease both; }
    .ag-fade-in    { animation: ag-fade-in 100ms ease both; }
    .ag-chip-in:nth-child(n) { animation-delay: 0ms; }
    .ag-btn-press { transition: none; }
    .ag-nav-item  { transition: none; }
    .ag-model-row { transition: none; }
    .ag-governance-row { transition: none; }
    .ag-chart-line { animation: none; }
  }
`;

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = "super_admin" | "admin" | "security_admin" | "billing_admin";

type AdminPage =
  // Team
  | "people"
  // Access
  | "capabilities"
  // Security
  | "identity"
  // Workspace
  | "model_providers"
  | "analytics"
  // Developer
  | "api_keys"
  | "programmatic"
  | "credentials"
  | "secrets"
  // Billing
  | "billing"
  | "usage";

type GovernanceScope = "everyone" | "groups" | "disabled";

type MemberRole =
  | "super_admin"
  | "admin"
  | "security_admin"
  | "billing_admin"
  | "member";

interface MemberRow {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  seat: "max" | "pro" | "free";
  usage?: number;
  limit?: number | null;
  status: "active" | "active_provisioned" | "invited" | "auto_joined";
  groupCount: number;
  groupIds: string[];
  visual?: string;
  onClick?: () => void;
}

interface GroupRow {
  id: string;
  name: string;
  memberCount: number;
  type: "provisioned" | "manual";
  onClick?: () => void;
}

interface DomainRow {
  id: string;
  domain: string;
  status: "verified" | "pending" | "failed";
  onClick?: () => void;
}

interface InvitationRow {
  id: string;
  email: string;
  role: MemberRole;
  invitedAt: string;
}

interface GovernanceSetting {
  id: string;
  label: string;
  description: string;
  scope: GovernanceScope;
  groups: string[];
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const INITIAL_MEMBERS: MemberRow[] = [
  {
    id: "m1",
    name: "Olivia Rhye",
    email: "olivia@acme.com",
    role: "super_admin",
    seat: "max",
    usage: 8237,
    limit: null,
    status: "active_provisioned",
    groupCount: 1,
    groupIds: ["g1"],
    visual: "https://i.pravatar.cc/150?img=47",
  },
  {
    id: "m2",
    name: "Phoenix Baker",
    email: "phoenix@acme.com",
    role: "admin",
    seat: "max",
    usage: 6327,
    limit: 268001,
    status: "active",
    groupCount: 1,
    groupIds: ["g2"],
    visual: "https://i.pravatar.cc/150?img=12",
  },
  {
    id: "m3",
    name: "Lana Steiner",
    email: "lana@acme.com",
    role: "admin",
    seat: "pro",
    usage: 10856,
    limit: 268001,
    status: "active",
    groupCount: 3,
    groupIds: ["g1", "g2", "g3"],
    visual: "https://i.pravatar.cc/150?img=32",
  },
  {
    id: "m4",
    name: "Demi Wilkinson",
    email: "demi@acme.com",
    role: "member",
    seat: "pro",
    usage: 0,
    limit: 260001,
    status: "active",
    groupCount: 1,
    groupIds: ["g4"],
    visual: "https://i.pravatar.cc/150?img=23",
  },
  {
    id: "m5",
    name: "Candice Wu",
    email: "candice@acme.com",
    role: "member",
    seat: "max",
    usage: 9328,
    limit: 268001,
    status: "active_provisioned",
    groupCount: 2,
    groupIds: ["g3", "g4"],
    visual: "https://i.pravatar.cc/150?img=44",
  },
  {
    id: "m6",
    name: "Natali Craig",
    email: "natali@acme.com",
    role: "member",
    seat: "free",
    usage: 142,
    limit: 5000,
    status: "invited",
    groupCount: 0,
    groupIds: [],
    visual: "https://i.pravatar.cc/150?img=15",
  },
  {
    id: "m7",
    name: "Drew Cano",
    email: "drew@acme.com",
    role: "member",
    seat: "free",
    usage: 3891,
    limit: 5000,
    status: "auto_joined",
    groupCount: 1,
    groupIds: ["g4"],
    visual: "https://i.pravatar.cc/150?img=8",
  },
  {
    id: "m8",
    name: "Orlando Diggs",
    email: "orlando@acme.com",
    role: "admin",
    seat: "pro",
    usage: 15420,
    limit: 84000,
    status: "active",
    groupCount: 2,
    groupIds: ["g1", "g3"],
    visual: "https://i.pravatar.cc/150?img=18",
  },
  {
    id: "m9",
    name: "Sia Fuentes",
    email: "sia@acme.com",
    role: "member",
    seat: "pro",
    usage: 72300,
    limit: 84000,
    status: "active",
    groupCount: 1,
    groupIds: ["g2"],
    visual: "https://i.pravatar.cc/150?img=39",
  },
  {
    id: "m10",
    name: "Koray Okumus",
    email: "koray@acme.com",
    role: "member",
    seat: "free",
    usage: 0,
    limit: 5000,
    status: "active",
    groupCount: 0,
    groupIds: [],
    visual: "https://i.pravatar.cc/150?img=58",
  },
  {
    id: "m11",
    name: "Amélie Laurent",
    email: "amelie@acme.com",
    role: "member",
    seat: "pro",
    usage: 41200,
    limit: 84000,
    status: "active_provisioned",
    groupCount: 1,
    groupIds: ["g2"],
    visual: "https://i.pravatar.cc/150?img=41",
  },
  {
    id: "m12",
    name: "Ryan Hartmann",
    email: "ryan@acme.com",
    role: "member",
    seat: "free",
    usage: 2100,
    limit: 5000,
    status: "active",
    groupCount: 1,
    groupIds: ["g4"],
    visual: "https://i.pravatar.cc/150?img=6",
  },
  {
    id: "m13",
    name: "Sofia Christopoulos",
    email: "sofia@acme.com",
    role: "member",
    seat: "free",
    usage: 880,
    limit: 5000,
    status: "invited",
    groupCount: 0,
    groupIds: [],
    visual: "https://i.pravatar.cc/150?img=49",
  },
  {
    id: "m14",
    name: "Marcus Webb",
    email: "marcus@acme.com",
    role: "member",
    seat: "pro",
    usage: 33750,
    limit: 84000,
    status: "active",
    groupCount: 2,
    groupIds: ["g1", "g4"],
    visual: "https://i.pravatar.cc/150?img=3",
  },
  {
    id: "m15",
    name: "Yuki Tanaka",
    email: "yuki@acme.com",
    role: "member",
    seat: "max",
    usage: 198400,
    limit: null,
    status: "auto_joined",
    groupCount: 1,
    groupIds: ["g3"],
    visual: "https://i.pravatar.cc/150?img=57",
  },
];

const GROUPS: GroupRow[] = [
  { id: "g1", name: "Design Team", memberCount: 16, type: "provisioned" },
  { id: "g2", name: "Engineering Team", memberCount: 16, type: "provisioned" },
  { id: "g3", name: "Managers", memberCount: 16, type: "provisioned" },
  { id: "g4", name: "Marketing", memberCount: 16, type: "manual" },
];

const DOMAINS: DomainRow[] = [
  { id: "d1", domain: "@dust.us", status: "verified" },
  { id: "d2", domain: "@dust.com", status: "pending" },
  { id: "d3", domain: "@dust.tt", status: "failed" },
];

const INITIAL_INVITATIONS: InvitationRow[] = [
  {
    id: "inv1",
    email: "alex.martin@newco.io",
    role: "member",
    invitedAt: "2025-07-14",
  },
  {
    id: "inv2",
    email: "priya.sharma@newco.io",
    role: "admin",
    invitedAt: "2025-07-13",
  },
  {
    id: "inv3",
    email: "tom.okafor@newco.io",
    role: "member",
    invitedAt: "2025-07-12",
  },
  {
    id: "inv4",
    email: "celine.dubois@newco.io",
    role: "billing_admin",
    invitedAt: "2025-07-10",
  },
  {
    id: "inv5",
    email: "jake.wu@newco.io",
    role: "member",
    invitedAt: "2025-07-08",
  },
];

const INITIAL_GOVERNANCE: GovernanceSetting[] = [
  {
    id: "create_agents",
    label: "Create agents",
    description: "Control who can build agents in the Agent Builder.",
    scope: "groups",
    groups: ["Design Team", "Engineering Team"],
  },
  {
    id: "publish_agents",
    label: "Publish agents",
    description: "Control who can publish agents to the whole workspace.",
    scope: "everyone",
    groups: [],
  },
  {
    id: "create_skills",
    label: "Create Skills",
    description: "Control who can build custom Skills.",
    scope: "everyone",
    groups: [],
  },
  {
    id: "publish_skills",
    label: "Publish Skills",
    description: "Control who can publish Skills to the whole workspace.",
    scope: "disabled",
    groups: [],
  },
  {
    id: "billing_access",
    label: "Billing access",
    description:
      "Control who can manage billing settings, invoices, and payment methods.",
    scope: "groups",
    groups: ["Managers"],
  },
  {
    id: "security_access",
    label: "Security access",
    description:
      "Control who can manage user access, identities, and provisioning.",
    scope: "groups",
    groups: ["Managers"],
  },
];

// ─── Spaces sidebar data ──────────────────────────────────────────────────────

const OPEN_SPACES = ["Company Data", "GTM", "ProjectManagement", "Shell_Space"];
const RESTRICTED_SPACES_MEMBER = [
  "Adèle",
  "Alex's test space",
  "Alexandre",
  "AlexTest With a Very long space name",
  "aubin",
  "aubin 2",
];
const RESTRICTED_SPACES_NO_ACCESS = [
  "Abboud's Space",
  "Adrien",
  "alban",
  "Ambra",
  "Amelie",
  "Anas",
  "Anya",
  "ap",
  "Area Leads",
  "Ben",
];

// ─── Connections data ─────────────────────────────────────────────────────────

interface ConnectionRow {
  name: string;
  usedBy: number;
  lastSync: string;
  managedByAvatar: string;
  delegates: string[];
  logo: React.ComponentType<{ className?: string }>;
  configured: boolean;
  onClick?: () => void;
}

const INITIAL_CONNECTIONS: Omit<ConnectionRow, "onClick">[] = [
  {
    name: "BigQuery",
    usedBy: 43,
    lastSync: "12min ago",
    managedByAvatar: "OL",
    delegates: [],
    logo: BigQueryLogo,
    configured: true,
  },
  {
    name: "Confluence",
    usedBy: 117,
    lastSync: "7min ago",
    managedByAvatar: "FR",
    delegates: [],
    logo: ConfluenceLogo,
    configured: true,
  },
  {
    name: "GitHub",
    usedBy: 254,
    lastSync: "<1m ago",
    managedByAvatar: "GH",
    delegates: [],
    logo: GithubLogo,
    configured: true,
  },
  {
    name: "Gong",
    usedBy: 0,
    lastSync: "—",
    managedByAvatar: "",
    delegates: [],
    logo: GongLogo,
    configured: false,
  },
  {
    name: "Google Drive",
    usedBy: 442,
    lastSync: "1min ago",
    managedByAvatar: "OL",
    delegates: [],
    logo: DriveLogo,
    configured: true,
  },
  {
    name: "Intercom",
    usedBy: 116,
    lastSync: "14min ago",
    managedByAvatar: "IN",
    delegates: [],
    logo: IntercomLogo,
    configured: true,
  },
  {
    name: "Microsoft",
    usedBy: 113,
    lastSync: "2min ago",
    managedByAvatar: "MS",
    delegates: [],
    logo: MicrosoftLogo,
    configured: true,
  },
  {
    name: "Notion",
    usedBy: 533,
    lastSync: "<1m ago",
    managedByAvatar: "OL",
    delegates: [],
    logo: NotionLogo,
    configured: true,
  },
  {
    name: "Slack",
    usedBy: 393,
    lastSync: "<1m ago",
    managedByAvatar: "OL",
    delegates: [],
    logo: SlackLogo,
    configured: true,
  },
  {
    name: "Slack (community)",
    usedBy: 124,
    lastSync: "11m ago",
    managedByAvatar: "SC",
    delegates: [],
    logo: SlackLogo,
    configured: true,
  },
  {
    name: "Snowflake",
    usedBy: 233,
    lastSync: "3h ago",
    managedByAvatar: "SW",
    delegates: [],
    logo: SnowflakeLogo,
    configured: true,
  },
  {
    name: "Zendesk",
    usedBy: 121,
    lastSync: "17min ago",
    managedByAvatar: "ZD",
    delegates: [],
    logo: ZendeskLogo,
    configured: true,
  },
];

const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Manager",
  security_admin: "Security Admin",
  billing_admin: "Billing Admin",
};

// Exact pages accessible per role — V2 IA
const ROLE_ACCESS: Record<Role, AdminPage[]> = {
  super_admin: [
    "people",
    "capabilities",
    "model_providers",
    "identity",
    "analytics",
    "api_keys",
    "programmatic",
    "credentials",
    "secrets",
    "billing",
    "usage",
  ],
  admin: ["people", "capabilities", "model_providers", "analytics", "usage"],
  security_admin: ["people", "identity"],
  billing_admin: ["billing", "usage"],
};

const STATUS_LABELS: Record<MemberRow["status"], string> = {
  active: "Active",
  active_provisioned: "Active (Provisioned)",
  invited: "Invited",
  auto_joined: "Auto-joined",
};

const ROLE_DISPLAY: Record<
  MemberRole,
  {
    label: string;
    color: "green" | "blue" | "warning" | "highlight" | "primary";
  }
> = {
  super_admin: { label: "Super Admin", color: "green" },
  admin: { label: "Manager", color: "green" },
  security_admin: { label: "Security Admin", color: "warning" },
  billing_admin: { label: "Billing Admin", color: "highlight" },
  member: { label: "Member", color: "blue" },
};

const ROLE_DESCRIPTIONS: Record<MemberRole, string> = {
  super_admin:
    "Full access: SSO, billing, connectors, members, spaces, groups, analytics and audit logs.",
  admin:
    "Can manage members, spaces, groups, analytics and connectors. No access to SSO, billing or audit logs.",
  security_admin:
    "Read-only access to audit logs and identity & provisioning. No other admin access.",
  billing_admin: "Access to billing and usage settings only.",
  member: "Can use and create agents in the workspace.",
};

const DOMAIN_STATUS_COLOR: Record<
  DomainRow["status"],
  "green" | "warning" | "rose"
> = {
  verified: "green",
  pending: "warning",
  failed: "rose",
};

// ─── People Page ──────────────────────────────────────────────────────────────

// ─── Member picker used by multiple sheets ────────────────────────────────────

// SHEET_MEMBERS replaced by workspace members passed as prop

interface MemberPickerProps {
  title: string;
  open: boolean;
  onClose: () => void;
  primaryLabel: string;
  onPrimary: (selected: string[]) => void;
  preSelected?: string[];
  searchPlaceholder?: string;
  members?: MemberRow[];
}

function MemberPickerSheet({
  title,
  open,
  onClose,
  primaryLabel,
  onPrimary,
  preSelected = [],
  searchPlaceholder = "Search by name or email",
  members: pickerMembers = INITIAL_MEMBERS,
}: MemberPickerProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>(preSelected);

  const filtered = pickerMembers.filter(
    (m) =>
      !search ||
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const allChecked =
    filtered.length > 0 && filtered.every((m) => selected.includes(m.id));
  const toggleAll = () =>
    setSelected(
      allChecked
        ? selected.filter((id) => !filtered.some((m) => m.id === id))
        : [...new Set([...selected, ...filtered.map((m) => m.id)])]
    );

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" size="lg">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col flex-1 overflow-hidden px-6 gap-4 py-4">
          <Page.Vertical gap="xs">
            <Label>Add members</Label>
            <SearchInput
              name="search"
              placeholder={searchPlaceholder}
              value={search}
              onChange={setSearch}
            />
          </Page.Vertical>
          <div className="flex-1 overflow-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border dark:border-border-night">
                  <th className="py-2 pr-4 text-left w-8">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={toggleAll}
                    />
                  </th>
                  <th className="py-2 text-left text-xs font-semibold text-foreground dark:text-foreground-night w-full">
                    <div className="flex items-center gap-1">Name ↓</div>
                  </th>
                  <th className="py-2 w-24" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-border dark:border-border-night last:border-0 cursor-pointer hover:bg-muted-background dark:hover:bg-muted-background-night"
                    onClick={() => toggle(m.id)}
                  >
                    <td
                      className="py-3 pr-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={selected.includes(m.id)}
                        onCheckedChange={() => toggle(m.id)}
                      />
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <Avatar size="sm" name={m.name} />
                        <span className="text-sm font-medium text-foreground dark:text-foreground-night">
                          {m.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 text-right">
                      <Chip
                        color={
                          ROLE_DISPLAY[(m as MemberRow).role ?? "member"].color
                        }
                        label={
                          ROLE_DISPLAY[(m as MemberRow).role ?? "member"].label
                        }
                        size="sm"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            onClick: onClose,
            variant: "outline",
          }}
          rightButtonProps={{
            label: primaryLabel,
            onClick: () => {
              onPrimary(selected);
              onClose();
            },
            variant: "primary",
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

// ─── Group Edit Dialog ────────────────────────────────────────────────────────

function GroupEditDialog({
  group,
  members,
  onSave,
  onDelete,
  onClose,
}: {
  group: GroupRow;
  members: MemberRow[];
  onSave: (name: string, selectedIds: string[]) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [groupName, setGroupName] = useState(group.name);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>(
    members.slice(0, 3).map((m) => m.id)
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const filtered = members.filter(
    (m) =>
      !search ||
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const allChecked =
    filtered.length > 0 && filtered.every((m) => selected.includes(m.id));
  const toggleAll = () =>
    setSelected(
      allChecked
        ? selected.filter((id) => !filtered.some((m) => m.id === id))
        : [...new Set([...selected, ...filtered.map((m) => m.id)])]
    );

  return (
    <>
      <Dialog open={!confirmDelete} onOpenChange={(o) => !o && onClose()}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{group.name}</DialogTitle>
          </DialogHeader>
          <DialogContainer
            fixedContent={
              <div className="flex flex-col gap-4">
                <Page.Vertical gap="xs">
                  <Label>Group name</Label>
                  <Input
                    name="group-name"
                    placeholder="e.g. Engineering Team"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    containerClassName="w-full"
                  />
                </Page.Vertical>
                <SearchInput
                  name="group-member-search"
                  placeholder="Search users..."
                  value={search}
                  onChange={setSearch}
                />
              </div>
            }
          >
            <table className="w-full">
              <thead>
                <tr className="border-b border-border dark:border-border-night">
                  <th className="py-2 pr-4 text-left w-8">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={toggleAll}
                    />
                  </th>
                  <th className="py-2 text-left text-xs font-semibold text-foreground dark:text-foreground-night w-full">
                    Name
                  </th>
                  <th className="py-2 w-24" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-border dark:border-border-night last:border-0 cursor-pointer hover:bg-muted-background dark:hover:bg-muted-background-night"
                    onClick={() => toggle(m.id)}
                  >
                    <td
                      className="py-3 pr-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={selected.includes(m.id)}
                        onCheckedChange={() => toggle(m.id)}
                      />
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <Avatar size="sm" name={m.name} />
                        <span className="text-sm font-medium text-foreground dark:text-foreground-night">
                          {m.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 text-right">
                      <Chip
                        color={ROLE_DISPLAY[m.role ?? "member"].color}
                        label={ROLE_DISPLAY[m.role ?? "member"].label}
                        size="sm"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Delete group",
              icon: Trash01,
              variant: "warning",
              onClick: () => setConfirmDelete(true),
            }}
            rightButtonProps={{
              label: "Save",
              variant: "primary",
              onClick: () => onSave(groupName, selected),
              disabled: !groupName.trim(),
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(false)}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Delete {group.name}?</DialogTitle>
          </DialogHeader>
          <DialogContainer>
            <Page.P variant="secondary" size="sm">
              This group will be permanently deleted. Members won't be affected.
            </Page.P>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => setConfirmDelete(false),
            }}
            rightButtonProps={{
              label: "Delete",
              variant: "warning",
              onClick: onDelete,
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── People Page ──────────────────────────────────────────────────────────────

function PeoplePage({
  role,
  members,
  setMembers,
  groups,
  setGroups,
  onNavigate,
  defaultTab,
  onTabChange,
  onCreateGroup,
}: {
  role: Role;
  members: MemberRow[];
  setMembers: (m: MemberRow[]) => void;
  groups: GroupRow[];
  setGroups: (g: GroupRow[]) => void;
  onNavigate: (page: AdminPage) => void;
  defaultTab?: "members" | "groups";
  onTabChange?: (tab: "members" | "groups") => void;
  onCreateGroup: (onCreated?: (group: GroupRow) => void) => void;
}) {
  const [sub, setSub] = useState<"members" | "groups">(defaultTab ?? "members");
  const [memberSubTab, setMemberSubTab] = useState<"members" | "invitations">(
    "members"
  );
  const [invitations, setInvitations] =
    useState<InvitationRow[]>(INITIAL_INVITATIONS);
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmails, setInviteEmails] = useState("");
  const [inviteRole, setInviteRole] = useState("Select role");
  const [inviteBilling, setInviteBilling] = useState<"monthly" | "yearly">(
    "monthly"
  );
  const [invitePlan, setInvitePlan] = useState<"free" | "pro" | "max">("pro");
  const [selectedGroup, setSelectedGroup] = useState<GroupRow | null>(null);
  const [selectedMember, setSelectedMember] = useState<MemberRow | null>(null);
  const [memberPlan, setMemberPlan] = useState<MemberRole>("member");
  const [editSeat, setEditSeat] = useState<"free" | "pro" | "max">("free");
  const [confirmSuperAdmin, setConfirmSuperAdmin] = useState(false);
  const [confirmSeatUpgrade, setConfirmSeatUpgrade] = useState<
    "pro" | "max" | null
  >(null);
  const canEdit = role === "super_admin" || role === "admin";

  const memberColumns = useMemo<ColumnDef<MemberRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        meta: { className: "w-full" },
        cell: (info) => {
          const row = info.row.original;
          return (
            <DataTable.CellContent>
              <div className="flex items-center gap-3">
                <Avatar
                  size="sm"
                  name={row.name}
                  visual={row.visual}
                  isRounded
                />
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-foreground dark:text-foreground-night leading-snug">
                    {row.name}
                  </span>
                  <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                    {row.email}
                  </span>
                </div>
              </div>
            </DataTable.CellContent>
          );
        },
      },
      {
        accessorKey: "role",
        header: "Role",
        meta: { className: "w-32" },
        cell: (info) => {
          const role = info.getValue() as MemberRole;
          return (
            <DataTable.CellContent>
              <Chip
                color={ROLE_DISPLAY[role].color}
                label={ROLE_DISPLAY[role].label}
                size="xs"
              />
            </DataTable.CellContent>
          );
        },
      },
      {
        accessorKey: "seat",
        header: "Seat",
        meta: { className: "w-20" },
        cell: (info) => {
          const seat = info.getValue() as MemberRow["seat"];
          const seatColors: Record<MemberRow["seat"], string> = {
            max: "text-amber-500",
            pro: "text-blue-500",
            free: "text-slate-400",
          };
          return (
            <DataTable.CellContent>
              <span className={`text-sm font-semibold ${seatColors[seat]}`}>
                {seat.charAt(0).toUpperCase() + seat.slice(1)}
              </span>
            </DataTable.CellContent>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        meta: { className: "w-40" },
        cell: (info) => (
          <DataTable.CellContent>
            <span className="text-sm text-foreground dark:text-foreground-night">
              {STATUS_LABELS[info.getValue() as MemberRow["status"]]}
            </span>
          </DataTable.CellContent>
        ),
      },
      {
        accessorKey: "groupCount",
        header: "Groups",
        meta: { className: "w-24" },
        cell: (info) => {
          const count = info.getValue() as number;
          return (
            <DataTable.CellContent>
              <span className="text-sm text-foreground dark:text-foreground-night">
                {count > 0 ? `${count} group${count > 1 ? "s" : ""}` : "—"}
              </span>
            </DataTable.CellContent>
          );
        },
      },
      {
        id: "actions",
        header: "",
        meta: { className: "w-10" },
        cell: () => (
          <DataTable.CellContent>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button icon={DotsHorizontal} variant="ghost" size="xs" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem label="Change seat type" />
                <DropdownMenuItem label="Edit spend limit" />
                <DropdownMenuItem label="Remove seat" variant="warning" />
              </DropdownMenuContent>
            </DropdownMenu>
          </DataTable.CellContent>
        ),
      },
    ],
    []
  );

  const ROLE_LABELS: Record<MemberRole, string> = {
    super_admin: "Super Admin",
    admin: "Manager",
    security_admin: "Security Admin",
    billing_admin: "Billing Admin",
    member: "Member",
  };

  const invitationColumns = useMemo<ColumnDef<InvitationRow>[]>(
    () => [
      {
        accessorKey: "email",
        header: "Email",
        meta: { className: "w-full" },
        cell: (info) => (
          <DataTable.CellContent>
            <span className="text-sm text-foreground dark:text-foreground-night">
              {info.getValue() as string}
            </span>
          </DataTable.CellContent>
        ),
      },
      {
        accessorKey: "role",
        header: "Role",
        meta: { className: "w-40" },
        cell: (info) => (
          <DataTable.CellContent>
            <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              {ROLE_LABELS[info.getValue() as MemberRole]}
            </span>
          </DataTable.CellContent>
        ),
      },
      {
        accessorKey: "invitedAt",
        header: "Invited",
        meta: { className: "w-36" },
        cell: (info) => (
          <DataTable.CellContent>
            <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              {new Date(info.getValue() as string).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </DataTable.CellContent>
        ),
      },
      {
        id: "actions",
        header: "",
        meta: { className: "w-10" },
        cell: (info) => {
          const row = info.row.original;
          return (
            <DataTable.CellContent>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button icon={DotsHorizontal} variant="ghost" size="xs" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem label="Resend invitation" />
                  <DropdownMenuItem
                    label="Revoke invitation"
                    variant="warning"
                    onClick={() =>
                      setInvitations((prev) =>
                        prev.filter((i) => i.id !== row.id)
                      )
                    }
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </DataTable.CellContent>
          );
        },
      },
    ],
    []
  );

  const groupColumns = useMemo<ColumnDef<GroupRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        meta: { className: "w-full" },
        cell: (info) => {
          const row = info.row.original;
          return (
            <DataTable.CellContent>
              <div className="flex items-center gap-3">
                <Users01 className="h-5 w-5 shrink-0 text-muted-foreground dark:text-muted-foreground-night" />
                <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
                  {row.name}
                </span>
                <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  {row.memberCount} members
                </span>
              </div>
            </DataTable.CellContent>
          );
        },
      },
      {
        accessorKey: "type",
        header: "Type",
        meta: { className: "w-32" },
        cell: (info) => {
          const type = info.getValue() as GroupRow["type"];
          return (
            <DataTable.CellContent>
              <Chip
                color={type === "provisioned" ? "success" : "info"}
                label={type === "provisioned" ? "Provisioned" : "Manual"}
                size="sm"
              />
            </DataTable.CellContent>
          );
        },
      },
    ],
    []
  );

  const filteredMembers = useMemo(
    () =>
      members
        .filter(
          (m) =>
            !search ||
            m.name.toLowerCase().includes(search.toLowerCase()) ||
            m.email.toLowerCase().includes(search.toLowerCase())
        )
        .map((m) => ({
          ...m,
          onClick: canEdit
            ? () => {
                setSelectedMember(m);
                setMemberPlan(m.role);
                setEditSeat(m.seat);
              }
            : undefined,
        })),
    [search, members, canEdit]
  );

  const filteredGroups = useMemo(
    () =>
      groups.filter(
        (g) => !search || g.name.toLowerCase().includes(search.toLowerCase())
      ),
    [search, groups]
  );

  const groupsWithClick = filteredGroups.map((g) => ({
    ...g,
    onClick: g.type === "manual" ? () => setSelectedGroup(g) : undefined,
  }));

  const handleInvite = () => {
    const emails = inviteEmails
      .split(/[\n,]+/)
      .map((e) => e.trim())
      .filter((e) => e.includes("@"));
    if (emails.length === 0) {
      setInviteOpen(false);
      return;
    }
    const invitedRole: MemberRole =
      inviteRole === "Super Admin"
        ? "super_admin"
        : inviteRole === "Manager"
          ? "admin"
          : inviteRole === "Security Admin"
            ? "security_admin"
            : inviteRole === "Billing Admin"
              ? "billing_admin"
              : "member";
    const newMembers: MemberRow[] = emails.map((email, i) => ({
      id: `invited-${Date.now()}-${i}`,
      name: email.split("@")[0],
      email,
      role: invitedRole,
      seat: invitePlan,
      status: "invited" as const,
      groupCount: 0,
      groupIds: [],
    }));
    setMembers([...members, ...newMembers]);
    setInviteEmails("");
    setInviteOpen(false);
  };

  const handleSaveGroup = (name: string, selected: string[]) => {
    if (!selectedGroup) return;
    setGroups(
      groups.map((g) =>
        g.id === selectedGroup.id
          ? { ...g, name: name.trim(), memberCount: selected.length }
          : g
      )
    );
    setSelectedGroup(null);
  };

  const handleDeleteGroup = () => {
    if (!selectedGroup) return;
    setGroups(groups.filter((g) => g.id !== selectedGroup.id));
    setSelectedGroup(null);
  };

  return (
    <Page>
      <Page.Header
        title="People"
        description="Manage team members and workspace roles."
        icon={Users01}
      />
      <Tabs
        value={sub}
        onValueChange={(v) => {
          setSub(v as "members" | "groups");
          onTabChange?.(v as "members" | "groups");
        }}
      >
        <TabsList>
          <TabsTrigger value="members" label="Members" />
          <TabsTrigger value="groups" label="Groups" />
        </TabsList>

        <TabsContent value="members">
          <div className="mt-4">
            <Page.Vertical gap="md">
              {/* Search + invite row */}
              <div className="flex w-full items-center gap-2">
                <SearchInput
                  name="member-search"
                  placeholder="Search"
                  value={search}
                  onChange={setSearch}
                  className="flex-1"
                />
                {canEdit && (
                  <span className="ag-btn-press">
                    <Button
                      icon={Plus}
                      label="Invite members"
                      variant="primary"
                      size="sm"
                      onClick={() => setInviteOpen(true)}
                    />
                  </span>
                )}
              </div>
              {/* Sub-filter row */}
              <div className="flex w-full items-center justify-between gap-4">
                <ButtonsSwitchList
                  size="sm"
                  defaultValue="members"
                  onValueChange={(v) =>
                    setMemberSubTab(v as "members" | "invitations")
                  }
                >
                  <ButtonsSwitch value="members" label="Members" />
                  <ButtonsSwitch value="invitations" label="Invitations" />
                </ButtonsSwitchList>
                {memberSubTab === "members" && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                      Filter by
                    </span>
                    <Button
                      variant="outline"
                      size="xs"
                      label="Any role"
                      isSelect
                    />
                    <Button
                      variant="outline"
                      size="xs"
                      label="Any group"
                      isSelect
                    />
                  </div>
                )}
              </div>
              {memberSubTab === "members" ? (
                <DataTable data={filteredMembers} columns={memberColumns} />
              ) : (
                <DataTable data={invitations} columns={invitationColumns} />
              )}
            </Page.Vertical>
          </div>
        </TabsContent>

        <TabsContent value="groups">
          <div className="mt-4">
            <Page.Vertical gap="md">
              <div className="w-full rounded-xl bg-muted-background dark:bg-muted-background-night px-4 py-3">
                <Page.P variant="secondary" size="sm">
                  User provisioning is configured in{" "}
                  <button
                    type="button"
                    className="underline font-medium text-foreground dark:text-foreground-night"
                    onClick={() => onNavigate("identity" as AdminPage)}
                  >
                    Identity &amp; Provisioning → User provisioning
                  </button>
                </Page.P>
              </div>
              <div className="flex w-full items-center gap-2">
                <SearchInput
                  name="group-search"
                  placeholder="Search"
                  value={search}
                  onChange={setSearch}
                  className="flex-1"
                />
                {canEdit && (
                  <span className="ag-btn-press">
                    <Button
                      icon={Plus}
                      label="Create group"
                      variant="primary"
                      size="sm"
                      onClick={onCreateGroup}
                    />
                  </span>
                )}
              </div>
              <DataTable data={groupsWithClick} columns={groupColumns} />
            </Page.Vertical>
          </div>
        </TabsContent>
      </Tabs>

      {/* Invite members modal */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Invite new users</DialogTitle>
          </DialogHeader>
          <DialogContainer>
            {/* Email input */}
            <Page.Vertical gap="xs">
              <Label>Email addresses</Label>
              <div className="w-full">
                <Input
                  placeholder="Email addresses, comma separated"
                  value={inviteEmails}
                  onChange={(e) => setInviteEmails(e.target.value)}
                  name="invite-emails"
                  className="w-full"
                />
              </div>
            </Page.Vertical>

            {/* Role picker */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  label={inviteRole}
                  icon={Users01}
                  isSelect
                  size="sm"
                  className="self-start"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {(
                  [
                    "Super Admin",
                    "Manager",
                    "Security Admin",
                    "Billing Admin",
                    "Member",
                  ] as const
                )
                  .filter(
                    (r) => !(role !== "super_admin" && r === "Super Admin")
                  )
                  .map((r) => (
                    <DropdownMenuItem
                      key={r}
                      label={r}
                      onClick={() => setInviteRole(r)}
                    />
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Billing toggle */}
            <ButtonsSwitchList
              size="sm"
              defaultValue="monthly"
              onValueChange={(v) => setInviteBilling(v as "monthly" | "yearly")}
              className="self-start"
            >
              <ButtonsSwitch value="monthly" label="Monthly" />
              <ButtonsSwitch value="yearly" label="Yearly" />
            </ButtonsSwitchList>

            {/* Plan cards */}
            <div className="flex flex-col gap-2">
              {(
                [
                  {
                    id: "free",
                    label: "Free",
                    credits: "300 credits lifetime",
                    price: null,
                    available: 10,
                    Icon: LayerSingle,
                  },
                  {
                    id: "pro",
                    label: "Pro",
                    credits: "7,000 credits per month",
                    price:
                      inviteBilling === "monthly" ? "$24.99/mo" : "$17.49/mo",
                    available: null,
                    Icon: LayersTwo01,
                  },
                  {
                    id: "max",
                    label: "Max",
                    credits: "28,000 credits per month",
                    price:
                      inviteBilling === "monthly" ? "$119.99/mo" : "$83.99/mo",
                    available: null,
                    Icon: LayersThree01,
                  },
                ] as const
              ).map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setInvitePlan(plan.id)}
                  className={`w-full flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                    invitePlan === plan.id
                      ? "border-highlight-500 bg-highlight-50 dark:bg-highlight-900/20"
                      : "border-border dark:border-border-night hover:bg-muted-background dark:hover:bg-muted-background-night"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <plan.Icon className="h-5 w-5 shrink-0 text-muted-foreground dark:text-muted-foreground-night" />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
                        {plan.label}
                      </span>
                      <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                        {plan.credits}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {plan.available !== null && (
                      <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                        {plan.available} Available
                      </span>
                    )}
                    {plan.price && (
                      <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
                        {plan.price}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              onClick: () => setInviteOpen(false),
              variant: "outline",
            }}
            rightButtonProps={{
              label: "Validate",
              onClick: handleInvite,
              variant: "primary",
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Edit group modal (manual groups only) */}
      {selectedGroup && (
        <GroupEditDialog
          group={selectedGroup}
          members={members}
          onSave={handleSaveGroup}
          onDelete={handleDeleteGroup}
          onClose={() => setSelectedGroup(null)}
        />
      )}

      {/* Super Admin confirmation dialog */}
      <Dialog
        open={confirmSuperAdmin}
        onOpenChange={(open) => {
          if (!open) setConfirmSuperAdmin(false);
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Assign Super Admin role?</DialogTitle>
          </DialogHeader>
          <DialogContainer>
            <Page.P variant="secondary" size="sm">
              Super Admin grants full access to all workspace settings including
              SSO, billing, and audit logs. This is a sensitive action — are you
              sure you want to grant this role?
            </Page.P>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => setConfirmSuperAdmin(false),
            }}
            rightButtonProps={{
              label: "Grant Super Admin",
              variant: "warning",
              onClick: () => {
                setMemberPlan("super_admin");
                setConfirmSuperAdmin(false);
              },
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Member detail modal */}
      {selectedMember && (
        <Dialog
          open={!!selectedMember}
          onOpenChange={() => setSelectedMember(null)}
        >
          <DialogContent size="md">
            <DialogHeader>
              <DialogTitle>Edit member</DialogTitle>
            </DialogHeader>
            <DialogContainer>
              {/* Member identity */}
              <div className="flex items-center gap-3">
                <Avatar
                  size="lg"
                  name={selectedMember.name}
                  visual={selectedMember.visual}
                  isRounded
                />
                <div>
                  <div className="text-base font-semibold text-foreground dark:text-foreground-night">
                    {selectedMember.name}
                  </div>
                  <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                    {selectedMember.email}
                  </div>
                </div>
              </div>

              {/* Role picker */}
              <div className="flex flex-col gap-2">
                <Label>Role</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      label={ROLE_DISPLAY[memberPlan].label}
                      isSelect
                      size="sm"
                      className="self-start"
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {(["super_admin", "admin", "member"] as MemberRole[]).map(
                      (p) => (
                        <DropdownMenuItem
                          key={p}
                          label={ROLE_DISPLAY[p].label}
                          onClick={() =>
                            p === "super_admin"
                              ? setConfirmSuperAdmin(true)
                              : setMemberPlan(p)
                          }
                        />
                      )
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Page.P variant="secondary" size="sm">
                  {ROLE_DESCRIPTIONS[memberPlan]}
                </Page.P>
              </div>

              {/* Seat type */}
              <div className="flex flex-col gap-2">
                <Label>Seat type</Label>
                <div className="flex flex-col gap-2">
                  {(
                    [
                      {
                        id: "free",
                        label: "Free",
                        credits: "300 credits lifetime",
                        price: null,
                        Icon: LayerSingle,
                      },
                      {
                        id: "pro",
                        label: "Pro",
                        credits: "7,000 credits per month",
                        price: "$24.99/mo",
                        Icon: LayersTwo01,
                      },
                      {
                        id: "max",
                        label: "Max",
                        credits: "28,000 credits per month",
                        price: "$119.99/mo",
                        Icon: LayersThree01,
                      },
                    ] as const
                  ).map((plan) => {
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setEditSeat(plan.id)}
                        className={`w-full flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                          editSeat === plan.id
                            ? "border-highlight-500 bg-highlight-50 dark:bg-highlight-900/20"
                            : "border-border dark:border-border-night hover:bg-muted-background dark:hover:bg-muted-background-night"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <plan.Icon className="h-5 w-5 shrink-0 text-muted-foreground dark:text-muted-foreground-night" />
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
                              {plan.label}
                            </span>
                            <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                              {plan.credits}
                            </span>
                          </div>
                        </div>
                        {plan.price && (
                          <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
                            {plan.price}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Danger zone */}
              <div className="flex flex-col gap-2">
                <Button
                  variant="warning"
                  label="Remove member access"
                  size="sm"
                  className="self-start"
                />
                <Page.P variant="secondary" size="sm">
                  This will permanently remove {selectedMember.name}'s access to
                  the company workspace.
                </Page.P>
              </div>
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{
                label: "Cancel",
                onClick: () => setSelectedMember(null),
                variant: "outline",
              }}
              rightButtonProps={{
                label: "Update",
                variant: "primary",
                onClick: () => {
                  const SEAT_RANK = { free: 0, pro: 1, max: 2 };
                  const isUpgrade =
                    SEAT_RANK[editSeat] > SEAT_RANK[selectedMember.seat];
                  if (
                    role === "admin" &&
                    isUpgrade &&
                    (editSeat === "pro" || editSeat === "max")
                  ) {
                    setConfirmSeatUpgrade(editSeat);
                  } else {
                    setMembers(
                      members.map((m) =>
                        m.id === selectedMember.id
                          ? { ...m, plan: memberPlan, seat: editSeat }
                          : m
                      )
                    );
                    setSelectedMember(null);
                  }
                },
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Seat upgrade confirmation (Manager only) */}
      <Dialog
        open={!!confirmSeatUpgrade}
        onOpenChange={(open) => {
          if (!open) setConfirmSeatUpgrade(null);
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Confirm seat upgrade</DialogTitle>
          </DialogHeader>
          <DialogContainer>
            <Page.P variant="secondary">
              Upgrading{" "}
              <span className="font-semibold text-foreground dark:text-foreground-night">
                {selectedMember?.name}
              </span>{" "}
              to a{" "}
              <span className="font-semibold text-foreground dark:text-foreground-night">
                {confirmSeatUpgrade === "pro" ? "Pro" : "Max"}
              </span>{" "}
              seat will add a recurring charge to your company's subscription.
              Are you sure you want to proceed?
            </Page.P>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              onClick: () => setConfirmSeatUpgrade(null),
              variant: "outline",
            }}
            rightButtonProps={{
              label: "Confirm upgrade",
              variant: "primary",
              onClick: () => {
                if (confirmSeatUpgrade && selectedMember) {
                  setMembers(
                    members.map((m) =>
                      m.id === selectedMember.id
                        ? { ...m, plan: memberPlan, seat: confirmSeatUpgrade }
                        : m
                    )
                  );
                }
                setConfirmSeatUpgrade(null);
                setSelectedMember(null);
              },
            }}
          />
        </DialogContent>
      </Dialog>
    </Page>
  );
}

// ─── Identity & Provisioning Page ─────────────────────────────────────────────

function IdentityPage({
  role,
  auditLogsEnabled,
}: {
  role: Role;
  auditLogsEnabled: boolean;
}) {
  const canEdit = role === "super_admin";
  const showAuditLogs =
    (role === "security_admin" || role === "super_admin") && auditLogsEnabled;

  const domainColumns = useMemo<ColumnDef<DomainRow>[]>(
    () => [
      {
        accessorKey: "domain",
        header: "Domain",
        meta: { className: "w-full" },
        cell: (info) => (
          <DataTable.BasicCellContent label={info.getValue() as string} />
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        meta: { className: "w-40" },
        cell: (info) => {
          const status = info.getValue() as DomainRow["status"];
          return (
            <DataTable.CellContent>
              <Page.Horizontal gap="sm">
                <Chip
                  color={DOMAIN_STATUS_COLOR[status]}
                  label={status.charAt(0).toUpperCase() + status.slice(1)}
                  size="sm"
                />
                {canEdit && <Button icon={XClose} variant="ghost" size="xs" />}
              </Page.Horizontal>
            </DataTable.CellContent>
          );
        },
      },
    ],
    [canEdit]
  );

  return (
    <Page>
      <Page.Header
        title="IT & Security"
        description="Verify your domain, manage team members and their permissions."
        icon={Fingerprint04}
      />

      <Page.Vertical gap="sm">
        <Page.SectionHeader
          title="Domain verification"
          description="Verify your company domains to enable Single Sign-On (SSO), automatic workspace enrollment for team members, and secure connections to your internal MCP servers."
        />
        <DataTable data={DOMAINS} columns={domainColumns} />
        {canEdit && (
          <Button icon={Plus} label="Add domain" variant="primary" size="sm" />
        )}
      </Page.Vertical>

      <Page.Separator />

      <Page.Vertical gap="sm">
        <Page.SectionHeader title="Authentication and access" />
        <div className="flex flex-col items-start  rounded-xl border border-border dark:border-border-night divide-y divide-border dark:divide-border-night">
          <div className="flex items-start gap-4 p-4">
            <Page.Vertical gap="xs" sizing="grow">
              <Page.Horizontal gap="sm">
                <Page.H variant="h6">Single Sign-On (SSO)</Page.H>
                <Chip color="green" label="Enabled" size="sm" />
                <Page.P variant="secondary" size="sm">
                  Okta
                </Page.P>
              </Page.Horizontal>
              <Page.P variant="secondary" size="sm">
                Manage your enterprise Identity Provider (IdP) settings and user
                provisioning. When SSO is enforced, users will no longer be able
                to use social logins.
              </Page.P>
            </Page.Vertical>
            {canEdit && (
              <Button variant="outline" label="Deactivate SSO" size="sm" />
            )}
          </div>
          <div className="flex items-start gap-4 p-4">
            <Page.Vertical gap="xs" sizing="grow">
              <Page.H variant="h6">Auto-join Workspace</Page.H>
              <Page.P variant="secondary" size="sm">
                Allow your team members to access your Dust workspace when they
                authenticate with a "@dust.tt", "@dust.us", "@dust.com" account.
              </Page.P>
            </Page.Vertical>
            {canEdit && (
              <Button variant="primary" label="Activate Auto-join" size="sm" />
            )}
          </div>
        </div>
      </Page.Vertical>

      <Page.Separator />

      <Page.Vertical gap="sm">
        <Page.SectionHeader title="User provisioning" />
        <div className="flex w-full items-start gap-4 rounded-xl border border-border dark:border-border-night p-4">
          <Page.Vertical gap="xs" sizing="grow">
            <Page.Horizontal gap="sm">
              <Page.H variant="h6">Directory sync</Page.H>
              <Chip color="green" label="Enabled" size="sm" />
            </Page.Horizontal>
            <Page.P variant="secondary" size="sm">
              Automatically syncing users and groups from Okta SCIM v2.0
            </Page.P>
          </Page.Vertical>
          {canEdit && (
            <Button
              variant="outline"
              label="Deactivate directory sync"
              size="sm"
            />
          )}
        </div>
      </Page.Vertical>

      {showAuditLogs && (
        <>
          <Page.Separator />
          <Page.Vertical gap="sm">
            <Page.SectionHeader
              title="Audit Logs"
              description="View workspace activity logs or configure export to your security information and event management (SIEM) system."
            />
            <Page.Horizontal gap="sm">
              <Button variant="outline" label="View Logs" size="sm" />
              <Button variant="outline" label="Configure Export" size="sm" />
            </Page.Horizontal>
          </Page.Vertical>
        </>
      )}
    </Page>
  );
}

// ─── Governance Page ──────────────────────────────────────────────────────────

function GovernanceRow({
  setting,
  canEdit,
  onChange,
  groups,
  onCreateGroup,
  groupsOnly = false,
  disabledLabel = "Disabled",
}: {
  setting: GovernanceSetting;
  canEdit: boolean;
  onChange: (s: GovernanceSetting) => void;
  groups: GroupRow[];
  onCreateGroup: (onCreated?: (group: GroupRow) => void) => void;
  groupsOnly?: boolean;
  disabledLabel?: string;
}) {
  const [groupSearch, setGroupSearch] = useState("");
  const filteredGroups = groups.filter(
    (g) =>
      !setting.groups.includes(g.name) &&
      g.name.toLowerCase().includes(groupSearch.toLowerCase())
  );

  return (
    <div className="ag-governance-row w-full flex flex-col gap-3 p-4">
      <div className="flex w-full items-center justify-between gap-4">
        <Page.Vertical gap="xs" sizing="grow">
          <Page.H variant="h6">{setting.label}</Page.H>
          <Page.P variant="secondary" size="sm">
            {setting.description}
          </Page.P>
        </Page.Vertical>
        {!groupsOnly && (
          <ButtonsSwitchList
            key={setting.scope}
            size="xs"
            defaultValue={setting.scope}
            onValueChange={(v) =>
              canEdit && onChange({ ...setting, scope: v as GovernanceScope })
            }
            disabled={!canEdit}
          >
            <ButtonsSwitch value="everyone" label="Everyone" />
            <ButtonsSwitch value="groups" label="Groups" />
            <ButtonsSwitch value="disabled" label={disabledLabel} />
          </ButtonsSwitchList>
        )}
      </div>
      {(groupsOnly || setting.scope === "groups") && (
        <div className="ag-section-in flex items-center gap-2 flex-wrap">
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="xs"
                  icon={Plus}
                  label="Add a group"
                  isSelect
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuSearchbar
                  name="group-search"
                  placeholder="Search groups"
                  value={groupSearch}
                  onChange={setGroupSearch}
                  autoFocus
                />
                {filteredGroups.map((g) => (
                  <DropdownMenuItem
                    key={g.id}
                    label={g.name}
                    endComponent={
                      <Chip
                        label={
                          g.type === "provisioned" ? "Provisioned" : "Manual"
                        }
                        color={g.type === "provisioned" ? "success" : "info"}
                        size="xs"
                      />
                    }
                    onClick={() =>
                      onChange({
                        ...setting,
                        groups: [...setting.groups, g.name],
                      })
                    }
                  />
                ))}
                {filteredGroups.length === 0 && (
                  <DropdownMenuItem
                    label={groupSearch ? "No groups found" : "All groups added"}
                    disabled
                  />
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  label="Create a group"
                  icon={Plus}
                  onClick={() =>
                    onCreateGroup((newGroup) =>
                      onChange({
                        ...setting,
                        groups: [...setting.groups, newGroup.name],
                      })
                    )
                  }
                />
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {setting.groups.map((g) => (
            <span key={g} className="ag-chip-in">
              <Chip
                label={g}
                size="xs"
                color="highlight"
                onRemove={
                  canEdit
                    ? () =>
                        onChange({
                          ...setting,
                          groups: setting.groups.filter((x) => x !== g),
                        })
                    : undefined
                }
              />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ModelGovernanceRow({
  provider,
  model,
  canEdit,
  groups,
  onChange,
}: {
  provider: ProviderDef;
  model: ModelDef;
  canEdit: boolean;
  groups: GroupRow[];
  onChange: (access: ModelDef["access"], modelGroups: string[]) => void;
}) {
  const [groupSearch, setGroupSearch] = useState("");
  const filteredGroups = groups.filter(
    (g) =>
      !model.groups.includes(g.name) &&
      g.name.toLowerCase().includes(groupSearch.toLowerCase())
  );

  return (
    <div className="flex w-full flex-col gap-3 px-5 py-4">
      <div className="flex w-full items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <provider.Logo className="h-5 w-5 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
                {model.name}
              </span>
            </div>
            <Page.P variant="secondary" size="sm">
              {model.description}
            </Page.P>
          </div>
        </div>
        <ButtonsSwitchList
          key={model.access}
          size="xs"
          defaultValue={model.access}
          onValueChange={(v) =>
            canEdit && onChange(v as ModelDef["access"], model.groups)
          }
          disabled={!canEdit}
        >
          <ButtonsSwitch value="everyone" label="Everyone" />
          <ButtonsSwitch value="groups" label="Groups" />
          <ButtonsSwitch value="disabled" label="Disabled" />
        </ButtonsSwitchList>
      </div>
      {model.access === "groups" && (
        <div className="ag-section-in flex items-center gap-2 flex-wrap pl-7">
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="xs"
                  icon={Plus}
                  label="Add a group"
                  isSelect
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuSearchbar
                  name="group-search"
                  placeholder="Search groups"
                  value={groupSearch}
                  onChange={setGroupSearch}
                  autoFocus
                />
                {filteredGroups.map((g) => (
                  <DropdownMenuItem
                    key={g.id}
                    label={g.name}
                    onClick={() =>
                      onChange("groups", [...model.groups, g.name])
                    }
                  />
                ))}
                {filteredGroups.length === 0 && (
                  <DropdownMenuItem
                    label={groupSearch ? "No groups found" : "All groups added"}
                    disabled
                  />
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {model.groups.map((g) => (
            <span key={g} className="ag-chip-in">
              <Chip
                label={g}
                size="xs"
                color="highlight"
                onRemove={
                  canEdit
                    ? () =>
                        onChange(
                          "groups",
                          model.groups.filter((x) => x !== g)
                        )
                    : undefined
                }
              />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

type FrameVisibilityLevel = "workspace_only" | "email_invite";

interface FrameVisibilitySetting {
  level: FrameVisibilityLevel;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  scope: GovernanceScope;
  groups: string[];
}

const FRAME_VISIBILITY_OPTIONS: Omit<
  FrameVisibilitySetting,
  "scope" | "groups"
>[] = [
  {
    level: "workspace_only",
    label: "Share by public link",
    description: "Control who can create public links to Frames.",
    icon: Globe01,
  },
  {
    level: "email_invite",
    label: "Invite people by email",
    description:
      "Control who can share Frames by email with people outside your organization.",
    icon: Mail01,
  },
];

type FrameSharingAccess = "no_restrictions" | "members_email" | "members_only";

function FrameSharingGovernanceRow({
  settings,
  canEdit,
  onChange,
  groups,
  onCreateGroup,
  disabledLabel = "Disabled",
  access,
  onAccessChange,
  accessOptions,
  showSelector = true,
}: {
  settings: FrameVisibilitySetting[];
  canEdit: boolean;
  onChange: (updated: FrameVisibilitySetting[]) => void;
  groups: GroupRow[];
  onCreateGroup: (onCreated?: (group: GroupRow) => void) => void;
  disabledLabel?: string;
  access: FrameSharingAccess;
  onAccessChange: (v: FrameSharingAccess) => void;
  accessOptions: {
    value: FrameSharingAccess;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
  }[];
  showSelector?: boolean;
}) {
  const [searchByLevel, setSearchByLevel] = useState<
    Partial<Record<FrameVisibilityLevel, string>>
  >({});

  const update = (updated: FrameVisibilitySetting) =>
    onChange(settings.map((s) => (s.level === updated.level ? updated : s)));

  const visibleSettings = settings.filter((s) => {
    if (access === "members_only") return false;
    if (access === "members_email") return s.level === "email_invite";
    return true;
  });

  return (
    <div className="w-full rounded-xl border border-border dark:border-border-night divide-y divide-border dark:divide-border-night">
      {showSelector && (
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="heading-base text-foreground dark:text-foreground-night">
              Frame access
            </span>
            <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Control who can access Frames in this workspace.
            </span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                icon={accessOptions.find((o) => o.value === access)!.icon}
                label={accessOptions.find((o) => o.value === access)!.label}
                isSelect
                disabled={!canEdit}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuRadioGroup
                value={access}
                onValueChange={(v) => onAccessChange(v as FrameSharingAccess)}
              >
                {accessOptions.map((o) => (
                  <DropdownMenuRadioItem
                    key={o.value}
                    value={o.value}
                    label={o.label}
                    description={o.description}
                    icon={o.icon}
                  />
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      {visibleSettings.map((s) => {
        const Icon = s.icon;
        const search = searchByLevel[s.level] ?? "";
        const filteredGroups = groups.filter(
          (g) =>
            !s.groups.includes(g.name) &&
            g.name.toLowerCase().includes(search.toLowerCase())
        );
        return (
          <div
            key={s.level}
            className="ag-governance-row w-full flex flex-col gap-3 p-4"
          >
            <div className="flex w-full items-center justify-between gap-4">
              <Page.Vertical gap="xs" sizing="grow">
                <Page.H variant="h6">{s.label}</Page.H>
                <Page.P variant="secondary" size="sm">
                  {s.description}
                </Page.P>
              </Page.Vertical>
              <ButtonsSwitchList
                key={s.scope}
                size="xs"
                defaultValue={s.scope}
                onValueChange={(v) =>
                  canEdit && update({ ...s, scope: v as GovernanceScope })
                }
                disabled={!canEdit}
              >
                <ButtonsSwitch value="everyone" label="Everyone" />
                <ButtonsSwitch value="groups" label="Groups" />
                <ButtonsSwitch value="disabled" label={disabledLabel} />
              </ButtonsSwitchList>
            </div>
            {s.scope === "groups" && (
              <div className="ag-section-in flex items-center gap-2 flex-wrap">
                {canEdit && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="xs"
                        icon={Plus}
                        label="Add a group"
                        isSelect
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuSearchbar
                        name={`frame-group-search-${s.level}`}
                        placeholder="Search groups"
                        value={search}
                        onChange={(v) =>
                          setSearchByLevel((prev) => ({
                            ...prev,
                            [s.level]: v,
                          }))
                        }
                        autoFocus
                      />
                      {filteredGroups.map((g) => (
                        <DropdownMenuItem
                          key={g.id}
                          label={g.name}
                          endComponent={
                            <Chip
                              label={
                                g.type === "provisioned"
                                  ? "Provisioned"
                                  : "Manual"
                              }
                              color={
                                g.type === "provisioned" ? "success" : "info"
                              }
                              size="xs"
                            />
                          }
                          onClick={() =>
                            update({ ...s, groups: [...s.groups, g.name] })
                          }
                        />
                      ))}
                      {filteredGroups.length === 0 && (
                        <DropdownMenuItem
                          label={
                            search ? "No groups found" : "All groups added"
                          }
                          disabled
                        />
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        label="Create a group"
                        icon={Plus}
                        onClick={() =>
                          onCreateGroup((newGroup) =>
                            update({
                              ...s,
                              groups: [...s.groups, newGroup.name],
                            })
                          )
                        }
                      />
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {s.groups.map((g) => (
                  <span key={g} className="ag-chip-in">
                    <Chip
                      label={g}
                      size="xs"
                      color="highlight"
                      onRemove={
                        canEdit
                          ? () =>
                              update({
                                ...s,
                                groups: s.groups.filter((x) => x !== g),
                              })
                          : undefined
                      }
                    />
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function GovernancePage({
  role,
  settings,
  setSettings,
  groups,
  onNavigateToGroups,
  onCreateGroup,
  frameSharing,
  setFrameSharing,
  auditLogsEnabled,
  setAuditLogsEnabled,
}: {
  role: Role;
  settings: GovernanceSetting[];
  setSettings: (s: GovernanceSetting[]) => void;
  groups: GroupRow[];
  onNavigateToGroups: () => void;
  onCreateGroup: (onCreated?: (group: GroupRow) => void) => void;
  frameSharing: FrameVisibilitySetting[];
  setFrameSharing: (s: FrameVisibilitySetting[]) => void;
  auditLogsEnabled: boolean;
  setAuditLogsEnabled: (v: boolean) => void;
}) {
  const canEdit = role === "super_admin" || role === "admin";
  const canEditAudit = role === "super_admin";
  const [workspaceName, setWorkspaceName] = useState("Dust");
  const [editingName, setEditingName] = useState(false);
  const update = (updated: GovernanceSetting) =>
    setSettings(settings.map((s) => (s.id === updated.id ? updated : s)));
  const [podAccess, setPodAccess] = useState<
    "restricted_only" | "restricted_and_open"
  >("restricted_and_open");
  const [podFiles, setPodFiles] = useState<
    "manual_allowed" | "manual_disabled"
  >("manual_allowed");
  const [privateUrls, setPrivateUrls] = useState(true);
  const [mcpServer, setMcpServer] = useState(false);
  const [workspaceCapabilities, setWorkspaceCapabilities] = useState<
    Record<string, boolean>
  >(Object.fromEntries(WORKSPACE_CAPABILITIES.map((c) => [c.id, true])));
  const [integrations, setIntegrations] =
    useState<IntegrationRow[]>(INITIAL_INTEGRATIONS);
  const [subSettings, setSubSettings] = useState<Record<string, boolean>>({
    slack_footer: true,
  });
  const podAccessOptions = [
    { value: "restricted_only" as const, label: "Restricted Pods only" },
    {
      value: "restricted_and_open" as const,
      label: "Restricted and open Pods",
    },
  ];
  const podFilesOptions = [
    { value: "manual_allowed" as const, label: "Manual updates allowed" },
    { value: "manual_disabled" as const, label: "Manual updates disabled" },
  ];
  const [frameSharingAccess, setFrameSharingAccess] = useState<
    "no_restrictions" | "members_email" | "members_only"
  >("no_restrictions");
  const frameSharingAccessOptions = [
    {
      value: "members_only" as const,
      label: "Workspace members only",
      description: "Frames can only be viewed by workspace members",
      icon: Lock01,
    },
    {
      value: "members_email" as const,
      label: "Members + email invites",
      description:
        "Frames can be shared with workspace members or via email invite",
      icon: Users01,
    },
    {
      value: "no_restrictions" as const,
      label: "No restrictions",
      description:
        "Members can share Frames publicly, with the workspace, or via email invite",
      icon: Globe01,
    },
  ];
  return (
    <Page>
      <Page.Header
        title="Workspace & Governance"
        description="Configure access, policies, and integrations for your workspace."
        icon={Toggle01Left}
      />
      {/* Workspace Name */}
      <div className="flex w-full flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <Page.H variant="h5">Workspace Name</Page.H>
            {!editingName && (
              <Page.P variant="secondary" size="sm">
                {workspaceName}
              </Page.P>
            )}
          </div>
          {canEditAudit && !editingName && (
            <Button
              variant="outline"
              size="sm"
              icon={Pencil01}
              label="Edit"
              onClick={() => setEditingName(true)}
            />
          )}
        </div>
        {editingName && (
          <div className="flex items-center gap-2">
            <Input
              name="workspace-name"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="Workspace name"
            />
            <Button
              variant="primary"
              size="sm"
              label="Save"
              onClick={() => setEditingName(false)}
            />
            <Button
              variant="outline"
              size="sm"
              label="Cancel"
              onClick={() => setEditingName(false)}
            />
          </div>
        )}
      </div>
      <div className="w-full rounded-xl bg-muted-background dark:bg-muted-background-night px-4 py-3">
        <Page.P variant="secondary" size="sm">
          Groups assigned here are managed in{" "}
          <button
            type="button"
            className="underline font-medium text-foreground dark:text-foreground-night"
            onClick={onNavigateToGroups}
          >
            People → Groups
          </button>
        </Page.P>
      </div>
      <div className="flex w-full flex-col gap-8">
        <div className="flex w-full flex-col gap-4">
          <div className="flex items-center gap-2">
            <Robot className="h-5 w-5 shrink-0 text-muted-foreground dark:text-muted-foreground-night" />
            <Page.H variant="h5">Agents</Page.H>
          </div>
          <div className="w-full rounded-xl border border-border dark:border-border-night divide-y divide-border dark:divide-border-night">
            {settings
              .filter((s) => s.id.includes("agent"))
              .map((s) => (
                <GovernanceRow
                  key={s.id}
                  setting={s}
                  canEdit={canEdit}
                  onChange={update}
                  groups={groups}
                  onCreateGroup={onCreateGroup}
                  disabledLabel="Admins only"
                />
              ))}
          </div>
        </div>
        <div className="flex w-full flex-col gap-4">
          <div className="flex items-center gap-2">
            <PuzzlePiece01 className="h-5 w-5 shrink-0 text-muted-foreground dark:text-muted-foreground-night" />
            <Page.H variant="h5">Skills</Page.H>
          </div>
          <div className="w-full rounded-xl border border-border dark:border-border-night divide-y divide-border dark:divide-border-night">
            {settings
              .filter((s) => s.id.includes("skill"))
              .map((s) => (
                <GovernanceRow
                  key={s.id}
                  setting={s}
                  canEdit={canEdit}
                  onChange={update}
                  groups={groups}
                  onCreateGroup={onCreateGroup}
                  disabledLabel="Admins only"
                />
              ))}
          </div>
        </div>
        {!(role === "admin" && frameSharingAccess === "members_only") && (
          <div className="flex w-full flex-col gap-4">
            <div className="flex items-center gap-2">
              <ActionFrame className="h-5 w-5 shrink-0 text-muted-foreground dark:text-muted-foreground-night" />
              <Page.H variant="h5">Frames</Page.H>
            </div>
            <FrameSharingGovernanceRow
              settings={frameSharing}
              canEdit={canEdit}
              onChange={setFrameSharing}
              groups={groups}
              onCreateGroup={onCreateGroup}
              disabledLabel="Admins only"
              access={frameSharingAccess}
              onAccessChange={setFrameSharingAccess}
              accessOptions={frameSharingAccessOptions}
              showSelector={role === "super_admin"}
            />
          </div>
        )}
        {role === "super_admin" && (
          <div className="flex w-full flex-col gap-4">
            <div className="flex items-center gap-2">
              <Lock01 className="h-5 w-5 shrink-0 text-muted-foreground dark:text-muted-foreground-night" />
              <Page.H variant="h5">Billing and security</Page.H>
            </div>
            <div className="w-full rounded-xl border border-border dark:border-border-night divide-y divide-border dark:divide-border-night">
              {settings
                .filter(
                  (s) => s.id === "billing_access" || s.id === "security_access"
                )
                .map((s) => (
                  <GovernanceRow
                    key={s.id}
                    setting={s}
                    canEdit={canEdit}
                    onChange={update}
                    groups={groups}
                    onCreateGroup={onCreateGroup}
                    groupsOnly
                  />
                ))}
            </div>
          </div>
        )}
        {/* Pods */}
        <div className="flex w-full flex-col gap-4">
          <div className="flex items-center gap-2">
            <IntersectDust className="h-5 w-5 shrink-0 text-muted-foreground dark:text-muted-foreground-night" />
            <Page.H variant="h5">Pods</Page.H>
          </div>
          <div className="w-full rounded-xl border border-border dark:border-border-night divide-y divide-border dark:divide-border-night">
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <Page.Vertical gap="xs" sizing="grow">
                <Page.H variant="h6">Pod access</Page.H>
                <Page.P variant="secondary" size="sm">
                  Control whether the workspace allows restricted Pods only, or
                  both restricted and open Pods.
                </Page.P>
              </Page.Vertical>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    label={
                      podAccessOptions.find((o) => o.value === podAccess)!.label
                    }
                    isSelect
                    disabled={!canEdit}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {podAccessOptions.map((o) => (
                    <DropdownMenuItem
                      key={o.value}
                      label={o.label}
                      onClick={() => setPodAccess(o.value)}
                    />
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <Page.Vertical gap="xs" sizing="grow">
                <Page.H variant="h6">Pod files</Page.H>
                <Page.P variant="secondary" size="sm">
                  Control whether members can manually add files to Pods.
                </Page.P>
              </Page.Vertical>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    label={
                      podFilesOptions.find((o) => o.value === podFiles)!.label
                    }
                    isSelect
                    disabled={!canEdit}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {podFilesOptions.map((o) => (
                    <DropdownMenuItem
                      key={o.value}
                      label={o.label}
                      onClick={() => setPodFiles(o.value)}
                    />
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
        {/* Capabilities */}
        <div className="flex w-full flex-col gap-4">
          <div className="flex items-center gap-2">
            <ShapesPlus className="h-5 w-5 shrink-0 text-muted-foreground dark:text-muted-foreground-night" />
            <Page.H variant="h5">Features</Page.H>
          </div>
          <div className="w-full rounded-xl border border-border dark:border-border-night divide-y divide-border dark:divide-border-night">
            {WORKSPACE_CAPABILITIES.filter(
              (cap) => cap.id !== "audit_logs"
            ).map((cap) => {
              const Icon = cap.icon;
              return (
                <div
                  key={cap.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <Page.Vertical gap="xs" sizing="grow">
                    <div className="flex items-center gap-2">
                      <Page.H variant="h6">{cap.label}</Page.H>
                      {"beta" in cap && cap.beta && (
                        <Chip label="Beta" size="xs" color="warning" />
                      )}
                    </div>
                    <Page.P variant="secondary" size="sm">
                      {cap.description}
                    </Page.P>
                  </Page.Vertical>
                  <SliderToggle
                    selected={workspaceCapabilities[cap.id]}
                    onClick={() =>
                      canEdit &&
                      setWorkspaceCapabilities((prev) => ({
                        ...prev,
                        [cap.id]: !prev[cap.id],
                      }))
                    }
                  />
                </div>
              );
            })}
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <Page.Vertical gap="xs" sizing="grow">
                <Page.H variant="h6">
                  Private conversation URLs by default
                </Page.H>
                <Page.P variant="secondary" size="sm">
                  Control whether conversation URLs are private by default,
                  limiting access to participants.
                </Page.P>
              </Page.Vertical>
              <SliderToggle
                selected={privateUrls}
                onClick={() => canEdit && setPrivateUrls(!privateUrls)}
              />
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <Page.Vertical gap="xs" sizing="grow">
                <Page.H variant="h6">MCP server</Page.H>
                <Page.P variant="secondary" size="sm">
                  Control whether external MCP clients can connect to this
                  workspace.
                </Page.P>
              </Page.Vertical>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  icon={Settings01}
                  label="Manage"
                  disabled={!canEdit}
                />
                <SliderToggle
                  selected={mcpServer}
                  onClick={() => canEdit && setMcpServer(!mcpServer)}
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <Page.Vertical gap="xs" sizing="grow">
                <Page.H variant="h6">"Sent via Agent" Slack footer</Page.H>
                <Page.P variant="secondary" size="sm">
                  Control whether Slack messages posted with user credentials
                  show the "Sent via Agent" footer.
                </Page.P>
              </Page.Vertical>
              <SliderToggle
                selected={subSettings["slack_footer"]}
                onClick={() =>
                  canEdit &&
                  setSubSettings((prev) => ({
                    ...prev,
                    slack_footer: !prev["slack_footer"],
                  }))
                }
              />
            </div>
          </div>
        </div>
        {/* Integrations */}
        <div className="flex w-full flex-col gap-4">
          <div className="flex items-center gap-2">
            <CloudArrowLeftRight className="h-5 w-5 shrink-0 text-muted-foreground dark:text-muted-foreground-night" />
            <Page.H variant="h5">Messaging apps</Page.H>
          </div>
          <div className="w-full rounded-xl border border-border dark:border-border-night divide-y divide-border dark:divide-border-night">
            {integrations.map((integration) => (
              <div
                key={integration.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <Page.Vertical gap="xs" sizing="grow">
                  <Page.H variant="h6">{integration.label}</Page.H>
                  <Page.P variant="secondary" size="sm">
                    {integration.description}
                  </Page.P>
                </Page.Vertical>
                <div className="flex shrink-0 items-center gap-2">
                  {integration.connected && (
                    <Button
                      variant="outline"
                      size="sm"
                      label="Reconnect"
                      disabled={!canEdit}
                    />
                  )}
                  <SliderToggle
                    selected={integration.enabled}
                    onClick={() =>
                      canEdit &&
                      setIntegrations((prev) =>
                        prev.map((i) =>
                          i.id === integration.id
                            ? { ...i, enabled: !i.enabled }
                            : i
                        )
                      )
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Audit — super_admin only */}
        {canEditAudit && (
          <div className="flex w-full flex-col gap-4">
            <div className="flex items-center gap-2">
              <LayerSingle className="h-5 w-5 shrink-0 text-muted-foreground dark:text-muted-foreground-night" />
              <Page.H variant="h5">Audit</Page.H>
            </div>
            <div className="w-full rounded-xl border border-border dark:border-border-night">
              <div className="flex items-start justify-between gap-4 px-4 py-3">
                <Page.Vertical gap="xs" sizing="grow">
                  <Page.H variant="h6">Audit Logs</Page.H>
                  <Page.P variant="secondary" size="sm">
                    Emit audit events and expose the audit logs section in IT &
                    Security.
                  </Page.P>
                </Page.Vertical>
                <SliderToggle
                  selected={auditLogsEnabled}
                  onClick={() =>
                    canEditAudit && setAuditLogsEnabled(!auditLogsEnabled)
                  }
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </Page>
  );
}

// ─── Model Providers Page ─────────────────────────────────────────────────────

function ModelProvidersPage({
  role,
  providers,
  setProviders,
  groups,
}: {
  role: Role;
  providers: ProviderDef[];
  setProviders: (p: ProviderDef[]) => void;
  groups: GroupRow[];
}) {
  const canEdit = role === "super_admin" || role === "admin";
  return (
    <Page>
      <Page.Header
        title="Model Providers"
        description="Control which AI models are available to your workspace members."
        icon={Brain}
      />
      {providers.map((provider) => (
        <div key={provider.id} className="flex w-full flex-col gap-3">
          <div className="flex items-center gap-2">
            <provider.Logo className="h-5 w-5 shrink-0" />
            <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
              {provider.name}
            </span>
          </div>
          <div className="w-full rounded-xl border border-border dark:border-border-night divide-y divide-border dark:divide-border-night">
            {provider.models.map((model) => (
              <ModelGovernanceRow
                key={`${provider.id}:${model.name}`}
                provider={provider}
                model={model}
                canEdit={canEdit}
                groups={groups}
                onChange={(access, modelGroups) => {
                  setProviders(
                    providers.map((p) =>
                      p.id === provider.id
                        ? {
                            ...p,
                            models: p.models.map((m) =>
                              m.name === model.name
                                ? { ...m, access, groups: modelGroups }
                                : m
                            ),
                          }
                        : p
                    )
                  );
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </Page>
  );
}

// ─── Billing Page (Billing Admin) ─────────────────────────────────────────────

function BillingPage() {
  return (
    <Page>
      <Page.Header
        title="Billing"
        description="Change your subscription and edit your billing information."
        icon={CreditCard01}
      />

      {/* Current plan card */}
      <div className="flex flex-col gap-4 rounded-[20px] border border-border dark:border-border-night p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Page.H variant="h4">Business</Page.H>
            <Chip color="blue" label="Current" size="xs" />
          </div>
          <Button variant="outline" label="Cancel subscription" size="sm" />
        </div>
        <div className="flex flex-col gap-1">
          <Page.P variant="secondary" size="sm">
            Frequency: Monthly
          </Page.P>
          <Page.P variant="secondary" size="sm">
            Next billing date: October, 14, 2026
          </Page.P>
          <Page.P size="sm">
            Amount: <span className="font-semibold">$15,000</span>
          </Page.P>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border dark:border-border-night px-4 py-3">
          <Page.P variant="secondary" size="sm">
            Switch to yearly to save $XXX per year
          </Page.P>
          <Button variant="primary" label="Upgrade" size="sm" />
        </div>
      </div>

      {/* Plan breakdown */}
      <div className="grid grid-cols-2 gap-4">
        {[
          {
            name: "Pro plan",
            price: "$24.99",
            unit: "per user",
            seats: "32 seats assigned",
            credits: "7,000 credits / month",
          },
          {
            name: "Max plan",
            price: "$119.99",
            unit: "per user",
            seats: "12 seats assigned · 1 available",
            credits: "28,000 credits / month",
          },
        ].map((plan) => (
          <div
            key={plan.name}
            className="flex flex-col gap-3 rounded-[20px] border border-border dark:border-border-night p-5"
          >
            <div>
              <Page.H variant="h5">{plan.name}</Page.H>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-bold text-foreground dark:text-foreground-night tabular-nums">
                  {plan.price}
                </span>
                <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  {plan.unit}
                </span>
              </div>
            </div>
            <div className="border-t border-border dark:border-border-night" />
            <Page.Vertical gap="xs">
              <Page.P variant="secondary" size="sm">
                {plan.seats}
              </Page.P>
              <Page.P variant="secondary" size="sm">
                {plan.credits}
              </Page.P>
            </Page.Vertical>
          </div>
        ))}
      </div>

      <Page.Separator />

      {/* Billing information */}
      <Page.Vertical gap="sm">
        <Page.SectionHeader title="Billing information" />
        <div className="rounded-[20px] border border-border dark:border-border-night divide-y divide-border dark:divide-border-night">
          <div className="flex items-start justify-between gap-4 p-5">
            <Page.Vertical gap="xs">
              <Page.H variant="h6">Billing address</Page.H>
              <Page.P variant="secondary" size="sm">
                John Smith
              </Page.P>
              <Page.P variant="secondary" size="sm">
                123-234-345-678
              </Page.P>
              <Page.P variant="secondary" size="sm">
                Park Way Cupertino, CA 95014
              </Page.P>
            </Page.Vertical>
            <Button variant="outline" label="Change" size="sm" />
          </div>
          <div className="flex items-center justify-between gap-4 p-5">
            <div className="flex items-center gap-3">
              <div className="rounded border border-border dark:border-border-night px-2 py-0.5 text-xs font-bold text-blue-700">
                VISA
              </div>
              <Page.P size="sm">•••• •••• •••• 1234</Page.P>
            </div>
            <Button variant="outline" label="Change" size="sm" />
          </div>
        </div>
      </Page.Vertical>

      <Page.Separator />

      {/* Invoices */}
      <Page.Vertical gap="sm">
        <Page.SectionHeader title="Invoices" />
        <div className="rounded-[20px] border border-border dark:border-border-night divide-y divide-border dark:divide-border-night">
          {[
            {
              label: "Monthly payment",
              date: "July 14, 2023",
              amount: "$4,300",
            },
            {
              label: "Monthly payment",
              date: "May 14, 2023",
              amount: "$4,300",
            },
            {
              label: "Monthly payment",
              date: "July 14, 2023",
              amount: "$4,300",
            },
          ].map((inv, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3">
              <span className="flex-1 text-sm text-foreground dark:text-foreground-night">
                {inv.label}
              </span>
              <span className="w-32 text-sm text-muted-foreground dark:text-muted-foreground-night">
                {inv.date}
              </span>
              <span className="w-16 text-right text-sm font-medium text-foreground dark:text-foreground-night">
                {inv.amount}
              </span>
              <Button variant="ghost" label="See invoice" size="sm" />
            </div>
          ))}
        </div>
      </Page.Vertical>
    </Page>
  );
}

// ─── Usage Page (Billing Admin) ───────────────────────────────────────────────

function UsagePage({
  role,
  members,
  setMembers,
}: {
  role: Role;
  members: MemberRow[];
  setMembers: (m: MemberRow[]) => void;
}) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmails, setInviteEmails] = useState("");
  const [inviteRole, setInviteRole] = useState("Select role");
  const [inviteBilling, setInviteBilling] = useState<"monthly" | "yearly">(
    "monthly"
  );
  const [invitePlan, setInvitePlan] = useState<"free" | "pro" | "max">("pro");

  const handleInvite = () => {
    const emails = inviteEmails
      .split(/[\n,]+/)
      .map((e) => e.trim())
      .filter((e) => e.includes("@"));
    if (emails.length === 0) {
      setInviteOpen(false);
      return;
    }
    const invitedRole: MemberRole =
      inviteRole === "Super Admin"
        ? "super_admin"
        : inviteRole === "Manager"
          ? "admin"
          : inviteRole === "Security Admin"
            ? "security_admin"
            : inviteRole === "Billing Admin"
              ? "billing_admin"
              : "member";
    const newMembers: MemberRow[] = emails.map((email, i) => ({
      id: `invited-${Date.now()}-${i}`,
      name: email.split("@")[0],
      email,
      role: invitedRole,
      seat: invitePlan,
      status: "invited" as const,
      groupCount: 0,
      groupIds: [],
    }));
    setMembers([...members, ...newMembers]);
    setInviteEmails("");
    setInviteOpen(false);
  };

  const seatColors: Record<MemberRow["seat"], string> = {
    max: "text-amber-500",
    pro: "text-blue-500",
    free: "text-slate-400",
  };

  const usageColumns = useMemo<ColumnDef<MemberRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        meta: { className: "w-full" },
        cell: (info) => {
          const row = info.row.original;
          return (
            <DataTable.CellContent>
              <div className="flex items-center gap-3">
                <Avatar size="sm" name={row.name} />
                <div>
                  <div className="text-sm font-semibold text-foreground dark:text-foreground-night">
                    {row.name}
                  </div>
                  <div className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                    {row.email}
                  </div>
                </div>
              </div>
            </DataTable.CellContent>
          );
        },
      },
      {
        accessorKey: "seat",
        header: "Seat",
        meta: { className: "w-20" },
        cell: (info) => {
          const seat = info.getValue() as MemberRow["seat"];
          return (
            <DataTable.CellContent>
              <span className={`text-sm font-semibold ${seatColors[seat]}`}>
                {seat.charAt(0).toUpperCase() + seat.slice(1)}
              </span>
            </DataTable.CellContent>
          );
        },
      },
      {
        accessorKey: "role",
        header: "Role",
        meta: { className: "w-32" },
        cell: (info) => {
          const r = info.getValue() as MemberRole;
          return (
            <DataTable.CellContent>
              <Chip
                color={ROLE_DISPLAY[r].color}
                label={ROLE_DISPLAY[r].label}
                size="xs"
              />
            </DataTable.CellContent>
          );
        },
      },
      {
        id: "creditsUsage",
        header: "Credits Usage",
        meta: { className: "w-56" },
        cell: (info) => {
          const row = info.row.original;
          const usage = row.usage ?? 0;
          const limit = row.limit;
          const pct = limit ? Math.min(100, (usage / limit) * 100) : 0;
          return (
            <DataTable.CellContent>
              <div className="flex items-center gap-2">
                <span className="text-sm tabular-nums text-foreground dark:text-foreground-night w-14 text-right">
                  {usage.toLocaleString()}
                </span>
                {limit ? (
                  <div className="flex flex-1 flex-col gap-0.5">
                    <div className="h-1 w-full rounded-full bg-muted-background dark:bg-muted-background-night">
                      <div
                        className="h-full rounded-full bg-primary-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground dark:text-muted-foreground-night text-right">
                      {limit.toLocaleString()}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                    —
                  </span>
                )}
              </div>
            </DataTable.CellContent>
          );
        },
      },
      {
        id: "actions",
        header: "",
        meta: { className: "w-10" },
        cell: () => (
          <DataTable.CellContent>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button icon={DotsHorizontal} variant="ghost" size="xs" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem label="Change seat type" />
                <DropdownMenuItem label="Edit spend limit" />
                <DropdownMenuItem label="Remove seat" variant="warning" />
              </DropdownMenuContent>
            </DropdownMenu>
          </DataTable.CellContent>
        ),
      },
    ],
    []
  );

  return (
    <Page>
      <Page.Header
        title="Usage"
        description="Manage the usage of your Dust workspace."
        icon={PieChart01}
      />

      <div className="flex flex-col items-start gap-3 rounded-xl border border-border dark:border-border-night p-4">
        <Page.Horizontal gap="md">
          <Page.Vertical gap="xs" sizing="grow">
            <Page.H variant="h5">Credit pool</Page.H>
            <Page.P variant="secondary" size="sm">
              Monthly resets on the 17th, March
            </Page.P>
          </Page.Vertical>
          <Page.Horizontal gap="sm">
            <Page.H variant="h5">54,708 / 100,000</Page.H>
            <Button variant="ghost" label="Top up" size="sm" />
          </Page.Horizontal>
        </Page.Horizontal>
        <div className="h-2 rounded-full overflow-hidden flex gap-px">
          <div className="h-full bg-amber-400" style={{ width: "30%" }} />
          <div className="h-full bg-purple-400" style={{ width: "20%" }} />
          <div className="h-full bg-pink-400" style={{ width: "5%" }} />
          <div className="h-full flex-1 bg-muted-background dark:bg-muted-background-night" />
        </div>
        <Page.Horizontal gap="md">
          <span className="flex items-center gap-1 text-sm text-foreground dark:text-foreground-night">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />{" "}
            Users
          </span>
          <span className="flex items-center gap-1 text-sm text-foreground dark:text-foreground-night">
            <span className="inline-block h-2 w-2 rounded-full bg-purple-400" />{" "}
            Programmatic Usage
          </span>
          <span className="flex items-center gap-1 text-sm text-foreground dark:text-foreground-night">
            <span className="inline-block h-2 w-2 rounded-full bg-pink-400" />{" "}
            Advanced features
          </span>
        </Page.Horizontal>
      </div>

      <Page.Separator />

      <Page.Vertical gap="sm">
        <Page.SectionHeader
          title="Members"
          action={{
            label: "Invite members",
            icon: Plus,
            variant: "primary",
            size: "sm",
            onClick: () => setInviteOpen(true),
          }}
        />
        <DataTable data={members} columns={usageColumns} />
      </Page.Vertical>

      {/* Invite modal */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Invite new users</DialogTitle>
          </DialogHeader>
          <DialogContainer>
            <Page.Vertical gap="xs">
              <Label>Email addresses</Label>
              <div className="w-full">
                <Input
                  placeholder="Email addresses, comma separated"
                  value={inviteEmails}
                  onChange={(e) => setInviteEmails(e.target.value)}
                  name="invite-emails-usage"
                  className="w-full"
                />
              </div>
            </Page.Vertical>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  label={inviteRole}
                  icon={Users01}
                  isSelect
                  size="sm"
                  className="self-start"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {(
                  [
                    "Super Admin",
                    "Manager",
                    "Security Admin",
                    "Billing Admin",
                    "Member",
                  ] as const
                )
                  .filter(
                    (r) => !(role !== "super_admin" && r === "Super Admin")
                  )
                  .map((r) => (
                    <DropdownMenuItem
                      key={r}
                      label={r}
                      onClick={() => setInviteRole(r)}
                    />
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <ButtonsSwitchList
              size="sm"
              defaultValue="monthly"
              onValueChange={(v) => setInviteBilling(v as "monthly" | "yearly")}
              className="self-start"
            >
              <ButtonsSwitch value="monthly" label="Monthly" />
              <ButtonsSwitch value="yearly" label="Yearly" />
            </ButtonsSwitchList>
            <div className="flex flex-col gap-2">
              {(
                [
                  {
                    id: "free",
                    label: "Free",
                    credits: "300 credits lifetime",
                    price: null,
                    available: 10,
                    Icon: LayerSingle,
                  },
                  {
                    id: "pro",
                    label: "Pro",
                    credits: "7,000 credits per month",
                    price:
                      inviteBilling === "monthly" ? "$24.99/mo" : "$17.49/mo",
                    available: null,
                    Icon: LayersTwo01,
                  },
                  {
                    id: "max",
                    label: "Max",
                    credits: "28,000 credits per month",
                    price:
                      inviteBilling === "monthly" ? "$119.99/mo" : "$83.99/mo",
                    available: null,
                    Icon: LayersThree01,
                  },
                ] as const
              ).map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setInvitePlan(plan.id)}
                  className={`w-full flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                    invitePlan === plan.id
                      ? "border-highlight-500 bg-highlight-50 dark:bg-highlight-900/20"
                      : "border-border dark:border-border-night hover:bg-muted-background dark:hover:bg-muted-background-night"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <plan.Icon className="h-5 w-5 shrink-0 text-muted-foreground dark:text-muted-foreground-night" />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
                        {plan.label}
                      </span>
                      <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                        {plan.credits}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {plan.available !== null && (
                      <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                        {plan.available} Available
                      </span>
                    )}
                    {plan.price && (
                      <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
                        {plan.price}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              onClick: () => setInviteOpen(false),
              variant: "outline",
            }}
            rightButtonProps={{
              label: "Validate",
              onClick: handleInvite,
              variant: "primary",
            }}
          />
        </DialogContent>
      </Dialog>
    </Page>
  );
}

// ─── Space Page ───────────────────────────────────────────────────────────────

interface SpaceCategoryRow {
  id: string;
  name: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  usedBy: number;
  onClick?: () => void;
}

const SPACE_MOCK_DATA: Record<string, SpaceCategoryRow[]> = {
  default: [
    {
      id: "connected",
      name: "Connected Data",
      count: 12,
      icon: CloudArrowLeftRight,
      usedBy: 24,
    },
    { id: "folders", name: "Folders", count: 155, icon: Folder, usedBy: 18 },
    { id: "websites", name: "Websites", count: 258, icon: Globe01, usedBy: 31 },
    { id: "apps", name: "Apps", count: 135, icon: Code01, usedBy: 12 },
    { id: "tools", name: "Tools", count: 164, icon: PuzzlePiece01, usedBy: 9 },
  ],
  GTM: [
    {
      id: "connected",
      name: "Connected Data",
      count: 4,
      icon: CloudArrowLeftRight,
      usedBy: 8,
    },
    { id: "folders", name: "Folders", count: 47, icon: Folder, usedBy: 6 },
    { id: "websites", name: "Websites", count: 12, icon: Globe01, usedBy: 5 },
    { id: "apps", name: "Apps", count: 8, icon: Code01, usedBy: 3 },
    { id: "tools", name: "Tools", count: 21, icon: PuzzlePiece01, usedBy: 4 },
  ],
  ProjectManagement: [
    {
      id: "connected",
      name: "Connected Data",
      count: 3,
      icon: CloudArrowLeftRight,
      usedBy: 15,
    },
    { id: "folders", name: "Folders", count: 92, icon: Folder, usedBy: 11 },
    { id: "websites", name: "Websites", count: 5, icon: Globe01, usedBy: 2 },
    { id: "apps", name: "Apps", count: 17, icon: Code01, usedBy: 7 },
    { id: "tools", name: "Tools", count: 43, icon: PuzzlePiece01, usedBy: 5 },
  ],
};

// ─── Space Settings Sheet ─────────────────────────────────────────────────────

type SpaceAccessMode = "manual" | "group";

function SpaceSettingsSheet({
  name,
  open,
  onClose,
  onSave,
  members,
  groups,
  initialSelectedMembers,
  initialSelectedGroupIds,
}: {
  name: string;
  open: boolean;
  onClose: () => void;
  onSave: (memberIds: string[], groupIds: string[]) => void;
  members: MemberRow[];
  groups: GroupRow[];
  initialSelectedMembers: string[];
  initialSelectedGroupIds: string[];
}) {
  const [spaceName, setSpaceName] = useState(name);
  const [restrictedAccess, setRestrictedAccess] = useState(true);
  const [accessMode, setAccessMode] = useState<SpaceAccessMode>("manual");
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>(
    initialSelectedMembers
  );
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(
    initialSelectedGroupIds
  );
  const [groupSearch, setGroupSearch] = useState("");

  useEffect(() => {
    if (open) {
      setSelectedMembers(initialSelectedMembers);
      setSelectedGroupIds(initialSelectedGroupIds);
    }
  }, [open]);

  const filteredMembers = members.filter(
    (m) =>
      !memberSearch ||
      m.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
      m.email.toLowerCase().includes(memberSearch.toLowerCase())
  );
  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(groupSearch.toLowerCase())
  );
  const allGroupsChecked =
    filteredGroups.length > 0 &&
    filteredGroups.every((g) => selectedGroupIds.includes(g.id));
  const toggleAllGroups = () =>
    setSelectedGroupIds(
      allGroupsChecked
        ? selectedGroupIds.filter(
            (id) => !filteredGroups.some((g) => g.id === id)
          )
        : [
            ...new Set([
              ...selectedGroupIds,
              ...filteredGroups.map((g) => g.id),
            ]),
          ]
    );
  const toggleGroup = (id: string) =>
    setSelectedGroupIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const allChecked =
    filteredMembers.length > 0 &&
    filteredMembers.every((m) => selectedMembers.includes(m.id));
  const toggleAll = () =>
    setSelectedMembers(
      allChecked
        ? selectedMembers.filter(
            (id) => !filteredMembers.some((m) => m.id === id)
          )
        : [
            ...new Set([
              ...selectedMembers,
              ...filteredMembers.map((m) => m.id),
            ]),
          ]
    );
  const toggle = (id: string) =>
    setSelectedMembers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" size="lg">
        <SheetHeader>
          <SheetTitle>Space Settings - {name}</SheetTitle>
        </SheetHeader>
        <div className="flex w-full flex-1 flex-col gap-5 overflow-hidden px-6 py-4">
          {/* Name */}
          <div className="flex w-full flex-col gap-2">
            <Label>Name</Label>
            <Input
              value={spaceName}
              onChange={(e) => setSpaceName(e.target.value)}
            />
            <Page.P variant="secondary" size="sm">
              Space name must be unique
            </Page.P>
            <div className="flex justify-end">
              <Button
                variant="warning"
                icon={Trash01}
                label="Delete space"
                size="sm"
              />
            </div>
          </div>
          <Page.Separator />
          {/* Restricted Access */}
          <div className="flex w-full flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold text-foreground dark:text-foreground-night">
                Restricted Access
              </span>
              <SliderToggle
                selected={restrictedAccess}
                onClick={() => setRestrictedAccess(!restrictedAccess)}
              />
            </div>
            {restrictedAccess && (
              <>
                <Page.P variant="secondary" size="sm">
                  Restricted access is active.
                </Page.P>
                <div className="w-fit">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        label={
                          accessMode === "manual"
                            ? "Manual access"
                            : "Group access"
                        }
                        isSelect
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        label="Manual access"
                        onClick={() => setAccessMode("manual")}
                      />
                      <DropdownMenuItem
                        label="Group access"
                        onClick={() => setAccessMode("group")}
                      />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {accessMode === "manual" && (
                  <div className="flex w-full flex-1 flex-col gap-2 overflow-hidden">
                    <SearchInput
                      name="space-member-search"
                      placeholder="Search users..."
                      value={memberSearch}
                      onChange={setMemberSearch}
                    />
                    <div className="flex-1 overflow-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border dark:border-border-night">
                            <th className="w-8 py-2 pr-4">
                              <Checkbox
                                checked={allChecked}
                                onCheckedChange={toggleAll}
                              />
                            </th>
                            <th className="w-full py-2 text-left text-xs font-semibold text-foreground dark:text-foreground-night">
                              Name
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredMembers.map((m) => (
                            <tr
                              key={m.id}
                              className="cursor-pointer border-b border-border dark:border-border-night last:border-0 hover:bg-muted-background dark:hover:bg-muted-background-night"
                              onClick={() => toggle(m.id)}
                            >
                              <td
                                className="py-3 pr-4"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Checkbox
                                  checked={selectedMembers.includes(m.id)}
                                  onCheckedChange={() => toggle(m.id)}
                                />
                              </td>
                              <td className="py-3">
                                <div className="flex items-center gap-2">
                                  <Avatar
                                    size="sm"
                                    name={m.name}
                                    visual={m.visual}
                                  />
                                  <div className="flex flex-col">
                                    <span className="text-sm font-medium text-foreground dark:text-foreground-night">
                                      {m.name}
                                    </span>
                                    <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                                      {m.email}
                                    </span>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {accessMode === "group" && (
                  <div className="flex w-full flex-1 flex-col gap-2 overflow-hidden">
                    <SearchInput
                      name="space-group-search"
                      placeholder="Search groups..."
                      value={groupSearch}
                      onChange={setGroupSearch}
                    />
                    <div className="flex-1 overflow-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border dark:border-border-night">
                            <th className="w-8 py-2 pr-4">
                              <Checkbox
                                checked={allGroupsChecked}
                                onCheckedChange={toggleAllGroups}
                              />
                            </th>
                            <th className="w-full py-2 text-left text-xs font-semibold text-foreground dark:text-foreground-night">
                              Name
                            </th>
                            <th className="w-28 py-2 text-left text-xs font-semibold text-foreground dark:text-foreground-night">
                              Type
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredGroups.map((g) => (
                            <tr
                              key={g.id}
                              className="cursor-pointer border-b border-border dark:border-border-night last:border-0 hover:bg-muted-background dark:hover:bg-muted-background-night"
                              onClick={() => toggleGroup(g.id)}
                            >
                              <td
                                className="py-3 pr-4"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Checkbox
                                  checked={selectedGroupIds.includes(g.id)}
                                  onCheckedChange={() => toggleGroup(g.id)}
                                />
                              </td>
                              <td className="py-3">
                                <div className="flex items-center gap-2">
                                  <Users01 className="h-4 w-4 shrink-0 text-muted-foreground dark:text-muted-foreground-night" />
                                  <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
                                    {g.name}
                                  </span>
                                  <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                                    {g.memberCount} members
                                  </span>
                                </div>
                              </td>
                              <td className="py-3">
                                <Chip
                                  size="xs"
                                  color={
                                    g.type === "provisioned"
                                      ? "success"
                                      : "info"
                                  }
                                  label={
                                    g.type === "provisioned"
                                      ? "Provisioned"
                                      : "Manual"
                                  }
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            onClick: onClose,
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Save",
            variant: "primary",
            onClick: () => onSave(selectedMembers, selectedGroupIds),
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

function SpacePage({
  name,
  isRestricted,
  role,
  members,
  groups,
}: {
  name: string;
  isRestricted: boolean;
  role: Role;
  members: MemberRow[];
  groups: GroupRow[];
}) {
  const [search, setSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savedMembers, setSavedMembers] = useState<string[]>(
    members.slice(0, 8).map((m) => m.id)
  );
  const [savedGroupIds, setSavedGroupIds] = useState<string[]>([]);
  const rows = SPACE_MOCK_DATA[name] ?? SPACE_MOCK_DATA.default;
  const filtered = rows.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  const columns = useMemo<ColumnDef<SpaceCategoryRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        meta: { className: "w-full" },
        cell: (info) => {
          const row = info.row.original;
          const Icon = row.icon;
          return (
            <DataTable.CellContent>
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground dark:text-muted-foreground-night" />
                <span className="font-medium text-foreground dark:text-foreground-night">
                  {row.name}
                </span>
                <span className="text-muted-foreground dark:text-muted-foreground-night">
                  ({row.count})
                </span>
              </div>
            </DataTable.CellContent>
          );
        },
      },
      {
        accessorKey: "usedBy",
        header: "Used By",
        meta: { className: "w-40" },
        cell: (info) => {
          const row = info.row.original;
          return (
            <DataTable.CellContent>
              <div className="flex items-center gap-1.5 text-muted-foreground dark:text-muted-foreground-night">
                <Users01 className="h-3.5 w-3.5 shrink-0" />
                <span className="text-sm">{row.usedBy}</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              </div>
            </DataTable.CellContent>
          );
        },
      },
    ],
    []
  );

  const SpaceIcon = isRestricted ? Lock01 : Globe01;
  const canEdit = role === "super_admin";

  return (
    <Page>
      <SearchInput
        name="search-space"
        placeholder={`Search in ${name}`}
        value={search}
        onChange={setSearch}
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SpaceIcon className="h-5 w-5 text-primary-400 dark:text-primary-500" />
          <Page.H variant="h3">{name}</Page.H>
        </div>
        <div className="flex items-center gap-2">
          <Button
            icon={Settings01}
            label="Space settings"
            variant="outline"
            size="sm"
            onClick={() => setSettingsOpen(true)}
          />
          {canEdit && (
            <Button icon={Plus} label="Add data" variant="primary" size="sm" />
          )}
        </div>
      </div>
      <DataTable data={filtered} columns={columns} />
      <SpaceSettingsSheet
        name={name}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={(memberIds, groupIds) => {
          setSavedMembers(memberIds);
          setSavedGroupIds(groupIds);
          setSettingsOpen(false);
        }}
        members={members}
        groups={groups}
        initialSelectedMembers={savedMembers}
        initialSelectedGroupIds={savedGroupIds}
      />
    </Page>
  );
}

// ─── Workspace Settings Page ──────────────────────────────────────────────────

type PodAccessPolicy = "restricted_only" | "restricted_and_open";

interface IntegrationRow {
  id: string;
  label: string;
  description: string;
  Logo: React.ComponentType<{ className?: string }>;
  connected: boolean;
  enabled: boolean;
}

const WORKSPACE_CAPABILITIES = [
  {
    id: "voice_transcription",
    icon: Microphone01,
    label: "Voice transcription",
    description:
      "Control whether members can use voice transcription in conversations.",
  },
  {
    id: "email_agents",
    icon: Mail01,
    label: "Email agents",
    description:
      "Control whether members can reach agents by email at AGENT_NAME@dust.team.",
    beta: true,
  },
  {
    id: "audit_logs",
    icon: LayerSingle,
    label: "Audit Logs",
    description:
      "Control whether audit events are recorded and shown in IT & Security.",
  },
] as const;

const INITIAL_INTEGRATIONS: IntegrationRow[] = [
  {
    id: "slack",
    label: "Slack Bot",
    description: "Control whether the Dust Bot can be used in Slack.",
    Logo: SlackLogo,
    connected: true,
    enabled: true,
  },
  {
    id: "teams",
    label: "Microsoft Teams Bot",
    description: "Control whether the Dust Bot can be used in Microsoft Teams.",
    Logo: MicrosoftTeamsLogo,
    connected: false,
    enabled: false,
  },
  {
    id: "discord",
    label: "Discord Bot",
    description: "Control whether the Dust Bot can be used in Discord.",
    Logo: DiscordLogo,
    connected: true,
    enabled: true,
  },
];

// ─── Placeholder Page ─────────────────────────────────────────────────────────

function PlaceholderPage({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Page>
      <Page.Header title={title} description={description} icon={icon} />
      <div className="flex items-center justify-center rounded-xl border border-dashed border-border dark:border-border-night p-12">
        <Page.P variant="secondary">Content coming soon</Page.P>
      </div>
    </Page>
  );
}

function LockedSpacePage({ title }: { title: string }) {
  return (
    <Page>
      <Page.Header title={title} icon={Lock01} />
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border dark:border-border-night p-12">
        <Lock01 className="h-8 w-8 text-muted-foreground dark:text-muted-foreground-night" />
        <Page.P variant="secondary" size="sm">
          This section requires Super Admin access.
        </Page.P>
      </div>
    </Page>
  );
}

// ─── Sidebar nav section ──────────────────────────────────────────────────────

// ─── Analytics Page ───────────────────────────────────────────────────────────

function LineChart({
  data,
  color = "#3B82F6",
  height = 80,
}: {
  data: number[];
  color?: string;
  height?: number;
}) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 500;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = height - ((v - min) / range) * (height - 10) - 5;
    return `${x},${y}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }}>
      <polyline
        className="ag-chart-line"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts.join(" ")}
      />
    </svg>
  );
}

function DistributionBar({
  segments,
}: {
  segments: { label: string; pct: number; color: string }[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-8 w-full overflow-hidden rounded-lg">
        {segments.map((s, i) => (
          <div
            key={i}
            style={{ width: `${s.pct}%`, backgroundColor: s.color }}
            className="flex items-center justify-center text-xs font-semibold text-white"
          >
            {s.pct}%
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const MESSAGES_DATA = [
  120, 145, 160, 190, 220, 240, 265, 290, 310, 330, 355, 370, 390, 410, 430,
  450, 465, 480, 500, 510, 525, 540, 555, 565, 580, 590, 610, 625, 635, 650,
];
const CONV_DATA = [
  50, 58, 65, 72, 80, 87, 92, 98, 105, 110, 118, 122, 128, 133, 139, 144, 149,
  155, 160, 163, 168, 172, 176, 180, 183, 187, 191, 195, 198, 202,
];
const WEBSEARCH_DATA = [
  20, 25, 30, 35, 42, 48, 55, 62, 68, 75, 82, 88, 95, 100, 108, 115, 120, 128,
  133, 140, 146, 152, 157, 163, 168, 173, 178, 183, 187, 192,
];
const CODEEXEC_DATA = [
  10, 13, 16, 20, 24, 28, 32, 36, 40, 43, 47, 50, 54, 58, 61, 65, 68, 72, 75,
  78, 81, 84, 87, 89, 92, 95, 97, 100, 103, 105,
];
const FILEREADER_DATA = [
  5, 6, 8, 10, 12, 14, 16, 19, 21, 23, 26, 28, 30, 33, 35, 37, 39, 41, 44, 46,
  48, 50, 52, 54, 56, 58, 60, 61, 63, 65,
];

function AnalyticsPage() {
  const [activityView, setActivityView] = useState<"activity" | "users">(
    "activity"
  );

  const topUsers = [
    { name: "Olivia Rhye", messages: "18,601", agents: 26 },
    { name: "Phoenix Baker", messages: "12,465", agents: 24 },
    { name: "Lana Steiner", messages: "8,765", agents: 21 },
    { name: "Demi Wilkinson", messages: "6,743", agents: 13 },
    { name: "Candice Wu", messages: "4,192", agents: 9 },
  ];

  const topAgents = [
    {
      name: "Dust",
      icon: "🌩️",
      messages: "18,601",
      users: 26,
      model: "Claude 4.5 Sonnet",
    },
    {
      name: "CompanyTaxonomy",
      icon: "🏷️",
      messages: "12,465",
      users: 24,
      model: "GPT-5 Mini",
    },
    {
      name: "dust-task",
      icon: "✅",
      messages: "8,765",
      users: 21,
      model: "Claude 4.5 Sonnet",
    },
    {
      name: "deep-dive",
      icon: "🔍",
      messages: "6,743",
      users: 13,
      model: "GPT 5.2",
    },
    {
      name: "Sidekick",
      icon: "🤖",
      messages: "4,192",
      users: 9,
      model: "Claude 4.6 Opus",
    },
  ];

  return (
    <Page>
      <div className="flex items-start justify-between">
        <Page.Header
          title="Analytics"
          description="Track how your team uses Dust."
          icon={BarChart01}
        />
        <Button variant="outline" label="Last 30 days" isSelect size="sm" />
      </div>

      {/* Stat cards */}
      <div className="flex gap-4">
        <div className="flex-1 rounded-xl border border-border dark:border-border-night p-4">
          <Page.P variant="secondary" size="sm">
            Total members
          </Page.P>
          <p className="text-3xl font-semibold text-foreground dark:text-foreground-night mt-1 tabular-nums">
            1,234
          </p>
        </div>
        <div className="flex-1 rounded-xl border border-border dark:border-border-night p-4">
          <Page.P variant="secondary" size="sm">
            Active users (last 30 days)
          </Page.P>
          <p className="text-3xl font-semibold text-foreground dark:text-foreground-night mt-1 tabular-nums">
            456
          </p>
        </div>
      </div>

      {/* Activity chart */}
      <div className="rounded-xl border border-border dark:border-border-night p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <Page.H variant="h5">Activity</Page.H>
            <Page.P variant="secondary" size="sm">
              Messages and conversations over the last 30 days.
            </Page.P>
          </div>
          <ButtonsSwitchList
            size="xs"
            defaultValue="activity"
            onValueChange={(v) => setActivityView(v as "activity" | "users")}
          >
            <ButtonsSwitch value="activity" label="Activity" />
            <ButtonsSwitch value="users" label="Users" />
          </ButtonsSwitchList>
        </div>
        <div className="relative">
          <LineChart data={MESSAGES_DATA} color="#3B82F6" height={120} />
          <div className="absolute inset-0 pointer-events-none">
            <LineChart data={CONV_DATA} color="#10B981" height={120} />
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground dark:text-muted-foreground-night">
          <span className="flex items-center gap-1">
            <span
              className="h-2 w-4 rounded-sm inline-block"
              style={{ backgroundColor: "#3B82F6" }}
            />{" "}
            Messages
          </span>
          <span className="flex items-center gap-1">
            <span
              className="h-2 w-4 rounded-sm inline-block"
              style={{ backgroundColor: "#10B981" }}
            />{" "}
            Conversations
          </span>
        </div>
      </div>

      {/* Source */}
      <div className="rounded-xl border border-border dark:border-border-night p-4 flex flex-col gap-3">
        <div>
          <Page.H variant="h5">Source</Page.H>
          <Page.P variant="secondary" size="sm">
            Message volume broken down by source over the last 30 days.
          </Page.P>
        </div>
        <DistributionBar
          segments={[
            { label: "Web", pct: 25, color: "#3B82F6" },
            { label: "Slack", pct: 25, color: "#8B5CF6" },
            { label: "Triggers", pct: 25, color: "#EF4444" },
            { label: "Google Sheet", pct: 14, color: "#10B981" },
            { label: "Chrome Extension", pct: 11, color: "#F59E0B" },
          ]}
        />
      </div>

      {/* Tool usage */}
      <div className="rounded-xl border border-border dark:border-border-night p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <Page.H variant="h5">Tool usage</Page.H>
            <Page.P variant="secondary" size="sm">
              Tool usage across your workspace over the last 30 days.
            </Page.P>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="xs" label="3 tools" isSelect />
            <ButtonsSwitchList size="xs" defaultValue="executions">
              <ButtonsSwitch value="executions" label="Executions" />
              <ButtonsSwitch value="users" label="Users" />
            </ButtonsSwitchList>
          </div>
        </div>
        <div className="relative h-28">
          <div className="absolute inset-0">
            <LineChart data={WEBSEARCH_DATA} color="#3B82F6" height={112} />
          </div>
          <div className="absolute inset-0">
            <LineChart data={CODEEXEC_DATA} color="#F59E0B" height={112} />
          </div>
          <div className="absolute inset-0">
            <LineChart data={FILEREADER_DATA} color="#10B981" height={112} />
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground dark:text-muted-foreground-night">
          <span className="flex items-center gap-1">
            <span
              className="h-2 w-4 rounded-sm inline-block"
              style={{ backgroundColor: "#3B82F6" }}
            />{" "}
            Web search
          </span>
          <span className="flex items-center gap-1">
            <span
              className="h-2 w-4 rounded-sm inline-block"
              style={{ backgroundColor: "#F59E0B" }}
            />{" "}
            Code exec
          </span>
          <span className="flex items-center gap-1">
            <span
              className="h-2 w-4 rounded-sm inline-block"
              style={{ backgroundColor: "#10B981" }}
            />{" "}
            File reader
          </span>
        </div>
      </div>

      {/* Top users */}
      <div className="rounded-xl border border-border dark:border-border-night p-4 flex flex-col gap-3">
        <Page.H variant="h5">Top users</Page.H>
        <Page.P variant="secondary" size="sm">
          Top 100 users with the most messages over the last 30 days.
        </Page.P>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border dark:border-border-night">
              <th className="py-2 pr-4 text-left text-xs font-semibold text-foreground dark:text-foreground-night w-full">
                <div className="flex items-center gap-1">User ↓</div>
              </th>
              <th className="py-2 pr-4 text-left text-xs font-semibold text-foreground dark:text-foreground-night w-32">
                Messages
              </th>
              <th className="py-2 text-left text-xs font-semibold text-foreground dark:text-foreground-night w-28">
                Agent Used
              </th>
            </tr>
          </thead>
          <tbody>
            {topUsers.map((u) => (
              <tr
                key={u.name}
                className="border-b border-border dark:border-border-night last:border-0"
              >
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <Avatar size="sm" name={u.name} />
                    <span className="text-sm font-medium text-foreground dark:text-foreground-night">
                      {u.name}
                    </span>
                  </div>
                </td>
                <td className="py-3 pr-4 text-sm text-foreground dark:text-foreground-night">
                  {u.messages}
                </td>
                <td className="py-3 text-sm text-foreground dark:text-foreground-night">
                  {u.agents}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Spend distribution */}
      <div className="rounded-xl border border-border dark:border-border-night p-4 flex flex-col gap-3">
        <Page.H variant="h5">Spend distribution by model</Page.H>
        <Page.P variant="secondary" size="sm">
          How your credit pool is distributed across models.
        </Page.P>
        <DistributionBar
          segments={[
            { label: "Claude 4.5 Sonnet", pct: 16, color: "#F59E0B" },
            { label: "GPT-5", pct: 16, color: "#6B7280" },
            { label: "Claude 4.6 Opus", pct: 18, color: "#EF4444" },
            { label: "GPT-5.5", pct: 16, color: "#3B82F6" },
            { label: "o3", pct: 16, color: "#8B5CF6" },
            { label: "Other (18 models)", pct: 18, color: "#10B981" },
          ]}
        />
      </div>

      {/* Top agents */}
      <div className="rounded-xl border border-border dark:border-border-night p-4 flex flex-col gap-3">
        <Page.H variant="h5">Top agents</Page.H>
        <Page.P variant="secondary" size="sm">
          Top 100 agents with the most messages over the last 30 days.
        </Page.P>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border dark:border-border-night">
              <th className="py-2 pr-4 text-left text-xs font-semibold text-foreground dark:text-foreground-night w-full">
                User ↓
              </th>
              <th className="py-2 pr-4 text-left text-xs font-semibold text-foreground dark:text-foreground-night w-28">
                Messages
              </th>
              <th className="py-2 pr-4 text-left text-xs font-semibold text-foreground dark:text-foreground-night w-20">
                Users
              </th>
              <th className="py-2 text-left text-xs font-semibold text-foreground dark:text-foreground-night w-40">
                Model
              </th>
            </tr>
          </thead>
          <tbody>
            {topAgents.map((a) => (
              <tr
                key={a.name}
                className="border-b border-border dark:border-border-night last:border-0"
              >
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{a.icon}</span>
                    <span className="text-sm font-medium text-foreground dark:text-foreground-night">
                      {a.name}
                    </span>
                  </div>
                </td>
                <td className="py-3 pr-4 text-sm text-foreground dark:text-foreground-night">
                  {a.messages}
                </td>
                <td className="py-3 pr-4 text-sm text-foreground dark:text-foreground-night">
                  {a.users}
                </td>
                <td className="py-3 text-sm text-muted-foreground dark:text-muted-foreground-night">
                  {a.model}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Page>
  );
}

// ─── Model Providers Page ─────────────────────────────────────────────────────

type ModelTier =
  | "balanced"
  | "cheap"
  | "expensive"
  | "flagship"
  | "fast"
  | "premier";

interface ModelDef {
  name: string;
  description: string;
  tier: ModelTier;
  access: "everyone" | "groups" | "disabled";
  groups: string[]; // group names that have access when access === "groups"
}

interface ProviderDef {
  id: string;
  name: string;
  Logo: React.ComponentType<{ className?: string }>;
  models: ModelDef[];
}

const TIER_LABELS: Record<ModelTier, string> = {
  balanced: "Balanced",
  cheap: "Cheap",
  expensive: "Expensive",
  flagship: "Flagship",
  fast: "Fast",
  premier: "Premier",
};

const TIER_COLORS: Record<
  ModelTier,
  "blue" | "green" | "warning" | "primary" | "highlight" | "rose"
> = {
  balanced: "blue",
  cheap: "green",
  expensive: "warning",
  flagship: "highlight",
  fast: "green",
  premier: "primary",
};

const INITIAL_PROVIDERS: ProviderDef[] = [
  {
    id: "openai",
    name: "OpenAI",
    Logo: OpenaiLogo,
    models: [
      {
        name: "GPT 5.5",
        description: "OpenAI's latest cutting-edge model",
        tier: "balanced",
        access: "disabled",
        groups: [],
      },
      {
        name: "GPT mini",
        description: "OpenAI Small Model",
        tier: "cheap",
        access: "everyone",
        groups: [],
      },
      {
        name: "GPT Nano",
        description: "OpenAI Small Model",
        tier: "cheap",
        access: "everyone",
        groups: [],
      },
      {
        name: "o3",
        description: "OpenAI Cutting-edge Model",
        tier: "expensive",
        access: "groups",
        groups: ["Engineering Team", "Managers"],
      },
      {
        name: "o4",
        description: "OpenAI Premier Model",
        tier: "expensive",
        access: "disabled",
        groups: [],
      },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    Logo: AnthropicLogo,
    models: [
      {
        name: "Claude 4.5 Haiku",
        description: "Anthropic Latest Flagship Model",
        tier: "fast",
        access: "everyone",
        groups: [],
      },
      {
        name: "Claude 4.5 Sonnet",
        description: "Anthropic Balanced Model",
        tier: "balanced",
        access: "everyone",
        groups: [],
      },
      {
        name: "Claude Opus 4.6",
        description: "Anthropic Premier Model",
        tier: "premier",
        access: "groups",
        groups: ["Managers"],
      },
    ],
  },
  {
    id: "mistral",
    name: "Mistral AI",
    Logo: MistralLogo,
    models: [
      {
        name: "Mistral Large",
        description: "Mistral AI Flagship Model",
        tier: "flagship",
        access: "disabled",
        groups: [],
      },
      {
        name: "Mistral Small",
        description: "Mistral AI Cutting-edge Model",
        tier: "cheap",
        access: "everyone",
        groups: [],
      },
      {
        name: "Mistral Codestral",
        description: "Mistral AI Premier Model",
        tier: "premier",
        access: "groups",
        groups: ["Engineering Team"],
      },
    ],
  },
  {
    id: "gemini",
    name: "Gemini",
    Logo: GeminiLogo,
    models: [
      {
        name: "Gemini 3.1 Focus",
        description: "Gemini Latest Flagship Model",
        tier: "flagship",
        access: "disabled",
        groups: [],
      },
      {
        name: "Gemini 3 Flash",
        description: "Gemini Small Model",
        tier: "fast",
        access: "everyone",
        groups: [],
      },
      {
        name: "Gemini 3.1 Pro",
        description: "Gemini Balanced Model",
        tier: "balanced",
        access: "disabled",
        groups: [],
      },
    ],
  },
  {
    id: "fireworks",
    name: "Fireworks",
    Logo: FireworksLogo,
    models: [
      {
        name: "DeepSeek V4 Pro",
        description: "Fireworks Latest Flagship Model",
        tier: "flagship",
        access: "disabled",
        groups: [],
      },
      {
        name: "Kimi 2.5",
        description: "Fireworks Small Model",
        tier: "cheap",
        access: "disabled",
        groups: [],
      },
      {
        name: "MiniMax M2.5",
        description: "Fireworks Small Model",
        tier: "cheap",
        access: "everyone",
        groups: [],
      },
      {
        name: "Kimi K2 Instruct",
        description: "Fireworks Premier Model",
        tier: "premier",
        access: "disabled",
        groups: [],
      },
      {
        name: "GLM-5",
        description: "Fireworks Cutting-edge Model",
        tier: "expensive",
        access: "disabled",
        groups: [],
      },
    ],
  },
];

// ─── Spaces Sidebar Nav ───────────────────────────────────────────────────────

function SpacesSidebarNav({
  onConnectionsClick,
  onToolsClick,
  onTriggersClick,
  onSpaceClick,
  selectedSpace,
  role,
}: {
  onConnectionsClick: () => void;
  onToolsClick: () => void;
  onTriggersClick: () => void;
  onSpaceClick: (name: string) => void;
  selectedSpace: string | null;
  role: Role;
}) {
  return (
    <ScrollArea className="flex-1">
      <ScrollBar orientation="vertical" size="minimal" />
      <NavigationList className="px-2 py-2">
        <NavigationListCollapsibleSection label="Administration" defaultOpen>
          {(
            [
              {
                icon: CloudArrowLeftRight,
                label: "Connections",
                onClick: onConnectionsClick,
              },
              { icon: ShapesPlus, label: "Tools", onClick: onToolsClick },
              {
                icon: Lightning01,
                label: "Triggers",
                onClick: onTriggersClick,
              },
            ] as const
          ).map((item) => {
            const locked = role === "admin";
            return (
              <div
                key={item.label}
                className={locked ? "opacity-40" : undefined}
              >
                <NavigationListItem
                  icon={locked ? Lock01 : item.icon}
                  label={item.label}
                  onClick={item.onClick}
                />
              </div>
            );
          })}
        </NavigationListCollapsibleSection>

        <NavigationListCollapsibleSection label="Open Spaces" defaultOpen>
          {OPEN_SPACES.map((s) => (
            <NavigationListItem
              key={s}
              icon={Globe01}
              label={s}
              selected={selectedSpace === s}
              onClick={() => onSpaceClick(s)}
            />
          ))}
        </NavigationListCollapsibleSection>

        <NavigationListCollapsibleSection label="Restricted Spaces" defaultOpen>
          {RESTRICTED_SPACES_MEMBER.map((s) => (
            <NavigationListItem
              key={s}
              icon={Lock01}
              label={s}
              selected={selectedSpace === s}
              onClick={() => onSpaceClick(s)}
            />
          ))}
          {role === "super_admin" &&
            RESTRICTED_SPACES_NO_ACCESS.map((s) => (
              <div key={s} className="opacity-50">
                <NavigationListItem
                  icon={Lock01}
                  label={s}
                  onClick={() => {}}
                />
              </div>
            ))}
        </NavigationListCollapsibleSection>
      </NavigationList>
    </ScrollArea>
  );
}

// ─── Manage Connection Sheet ──────────────────────────────────────────────────

function ManageConnectionSheet({
  connection,
  open,
  onClose,
  onUpdateDelegates,
  role,
  members,
}: {
  connection: ConnectionRow | null;
  open: boolean;
  onClose: () => void;
  onUpdateDelegates: (name: string, delegates: string[]) => void;
  role: Role;
  members: MemberRow[];
}) {
  const businessAdmins = members.filter((m) => m.role === "admin");
  const [selectedIds, setSelectedIds] = useState<string[]>(
    businessAdmins
      .filter((m) => connection?.delegates.includes(m.name))
      .map((m) => m.id)
  );
  const [delegateSearch, setDelegateSearch] = useState("");

  const filteredAdmins = businessAdmins.filter(
    (m) =>
      !delegateSearch ||
      m.name.toLowerCase().includes(delegateSearch.toLowerCase()) ||
      m.email.toLowerCase().includes(delegateSearch.toLowerCase())
  );

  const toggle = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const handleSave = () => {
    if (connection) {
      const names = businessAdmins
        .filter((m) => selectedIds.includes(m.id))
        .map((m) => m.name);
      onUpdateDelegates(connection.name, names);
    }
    onClose();
  };

  if (!connection) return null;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" size="lg">
        <SheetHeader>
          <SheetTitle>Manage {connection.name} connection</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-6 py-4 flex-1 overflow-auto">
          {/* Edit / Delete */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" label="Edit connection" />
            <Button variant="warning" size="sm" label="Delete connection" />
          </div>

          {/* Connection options */}
          <Page.Vertical gap="sm">
            <Page.SectionHeader title="Connection options" />
            <div className="flex w-full items-center justify-between rounded-xl border border-border dark:border-border-night p-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
                  Use descriptions
                </span>
                <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                  Your tables and columns description set in {connection.name}{" "}
                  will be used to describe the schemas to Agents.
                </span>
              </div>
              <SliderToggle selected={true} onClick={() => {}} />
            </div>
          </Page.Vertical>

          {/* Delegate management — Super Admin only */}
          {role === "super_admin" && (
            <Page.Vertical gap="sm">
              <Page.SectionHeader
                title="Delegate to Managers"
                description="Managers selected here can edit this connection's settings and select which data is synced."
              />
              <SearchInput
                name="delegate-search"
                placeholder="Search by name or email"
                value={delegateSearch}
                onChange={setDelegateSearch}
                className="w-full"
              />
              {filteredAdmins.length === 0 ? (
                <p className="text-sm text-muted-foreground dark:text-muted-foreground-night py-2">
                  No managers found
                </p>
              ) : (
                <ListGroup className="w-full">
                  {filteredAdmins.map((m, i) => (
                    <ListItem
                      key={m.id}
                      onClick={() => toggle(m.id)}
                      hasSeparator={i < filteredAdmins.length - 1}
                      itemsAlignment="center"
                    >
                      <span onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.includes(m.id)}
                          onCheckedChange={() => toggle(m.id)}
                        />
                      </span>
                      <Avatar
                        size="sm"
                        name={m.name}
                        visual={m.visual}
                        isRounded
                      />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
                          {m.name}
                        </span>
                        <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                          {m.email}
                        </span>
                      </div>
                      <Chip
                        label={ROLE_DISPLAY[m.role].label}
                        color={ROLE_DISPLAY[m.role].color}
                        size="xs"
                      />
                    </ListItem>
                  ))}
                </ListGroup>
              )}
            </Page.Vertical>
          )}

          {/* Select tables */}
          <Page.Vertical gap="sm">
            <Page.SectionHeader title="Select tables" />
            <div className="w-full rounded-xl border border-border dark:border-border-night divide-y divide-border dark:divide-border-night">
              {["or1g1n-186209", "dust-dev"].map((table, i) => (
                <div key={table} className="flex items-center gap-3 px-4 py-3">
                  <Checkbox checked={i === 1} onCheckedChange={() => {}} />
                  <span className="text-sm text-foreground dark:text-foreground-night">
                    {table}
                  </span>
                </div>
              ))}
            </div>
          </Page.Vertical>
        </div>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            onClick: onClose,
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Save",
            onClick: handleSave,
            variant: "primary",
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

// ─── Connections Page ─────────────────────────────────────────────────────────

function ConnectionsPage({
  connections,
  onManage,
  onOpenDetail,
}: {
  connections: ConnectionRow[];
  onManage: (conn: ConnectionRow) => void;
  onOpenDetail: (conn: ConnectionRow) => void;
}) {
  const [search, setSearch] = useState("");
  const [configureTarget, setConfigureTarget] = useState<ConnectionRow | null>(
    null
  );

  const columns = useMemo<ColumnDef<ConnectionRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        meta: { className: "w-full" },
        cell: (info) => {
          const row = info.row.original;
          const Logo = row.logo;
          return (
            <DataTable.CellContent>
              <div className="flex items-center gap-3">
                <div className="h-6 w-6 shrink-0">
                  <Logo className="h-6 w-6" />
                </div>
                <span className="font-semibold text-foreground dark:text-foreground-night">
                  {row.name}
                </span>
              </div>
            </DataTable.CellContent>
          );
        },
      },
      {
        accessorKey: "usedBy",
        header: "Used By",
        meta: { className: "w-28" },
        cell: (info) => {
          return (
            <DataTable.CellContent>
              <div className="flex items-center gap-1 text-muted-foreground dark:text-muted-foreground-night">
                <Users01 className="h-3.5 w-3.5" />
                <span>{info.getValue() as number}</span>
              </div>
            </DataTable.CellContent>
          );
        },
      },
      {
        accessorKey: "managedByAvatar",
        header: "Managed By",
        meta: { className: "w-28" },
        cell: (info) => {
          return (
            <DataTable.CellContent>
              <Avatar name={info.getValue() as string} size="xs" isRounded />
            </DataTable.CellContent>
          );
        },
      },
      {
        accessorKey: "lastSync",
        header: "Last Sync",
        meta: { className: "w-32" },
        cell: (info) => {
          return (
            <DataTable.CellContent>
              <span className="text-muted-foreground dark:text-muted-foreground-night whitespace-nowrap">
                {info.getValue() as string}
              </span>
            </DataTable.CellContent>
          );
        },
      },
      {
        id: "action",
        header: "",
        meta: { className: "w-36" },
        cell: (info: { row: { original: ConnectionRow } }) => {
          const row = info.row.original;
          return (
            <DataTable.CellContent>
              {row.configured ? (
                <Button
                  variant="outline"
                  size="xs"
                  icon={Settings01}
                  label="Manage"
                  onClick={(e) => {
                    e.stopPropagation();
                    onManage(row);
                  }}
                />
              ) : (
                <Button
                  variant="primary"
                  size="xs"
                  label="Configure"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfigureTarget(row);
                  }}
                />
              )}
            </DataTable.CellContent>
          );
        },
      },
    ],
    [onManage]
  );

  const rows = connections
    .filter(
      (c) => !search || c.name.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => (a.configured === b.configured ? 0 : a.configured ? -1 : 1))
    .map((c) => ({
      ...c,
      onClick: () => onOpenDetail(c),
    }));

  return (
    <div className="flex flex-col h-full">
      <Page>
        <div className="w-full">
          <SearchInput
            name="search-connections"
            placeholder="Search in Connections"
            value={search}
            onChange={setSearch}
          />
        </div>
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-2">
            <CloudArrowLeftRight className="h-4 w-4 text-foreground dark:text-foreground-night" />
            <span className="heading-base text-foreground dark:text-foreground-night">
              Connections
            </span>
          </div>
        </div>
        <DataTable data={rows} columns={columns} className="w-full" />
      </Page>

      {/* Configure Connection Sheet */}
      <Sheet
        open={!!configureTarget}
        onOpenChange={(open) => {
          if (!open) setConfigureTarget(null);
        }}
      >
        <SheetContent size="lg">
          <SheetHeader>
            <SheetTitle>
              Configure{configureTarget ? ` ${configureTarget.name}` : ""}
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-5 px-6 py-4">
            {configureTarget && (
              <div className="flex items-center gap-3 rounded-xl bg-muted-background dark:bg-muted-background-night p-4">
                <configureTarget.logo className="h-8 w-8 shrink-0" />
                <div className="flex flex-col">
                  <span className="heading-sm text-foreground dark:text-foreground-night">
                    {configureTarget.name}
                  </span>
                  <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                    Not configured yet
                  </span>
                </div>
              </div>
            )}
            <div className="flex items-start justify-between gap-4 rounded-xl border border-border dark:border-border-night p-4">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
                  Set up yourself
                </span>
                <Page.P variant="secondary" size="sm">
                  Connect your account and configure the data source directly.
                </Page.P>
              </div>
              <Button
                variant="primary"
                size="sm"
                label="Set up"
                onClick={() => setConfigureTarget(null)}
              />
            </div>
          </div>
          <SheetFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => setConfigureTarget(null),
            }}
            rightButtonProps={{
              label: "Done",
              variant: "primary",
              onClick: () => setConfigureTarget(null),
            }}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Connection Detail Page ───────────────────────────────────────────────────

interface FolderRow {
  id: string;
  name: string;
  lastUpdated: string;
  onClick?: () => void;
}

const CONNECTION_FOLDERS: Record<string, FolderRow[]> = {
  BigQuery: [
    { id: "f1", name: "dust-dev", lastUpdated: "Mar 10, 2026" },
    { id: "f2", name: "or1g1n-186209", lastUpdated: "Oct 29, 2025" },
  ],
  default: [
    { id: "f1", name: "Main folder", lastUpdated: "Jun 1, 2026" },
    { id: "f2", name: "Archive", lastUpdated: "Apr 15, 2026" },
  ],
};

function ConnectionDetailPage({
  connectionId,
  onBack,
  role,
  members,
}: {
  connectionId: string;
  onBack: () => void;
  role: Role;
  members: MemberRow[];
}) {
  const [managingConn, setManagingConn] = useState<ConnectionRow | null>(null);
  const connection = INITIAL_CONNECTIONS.find((c) => c.name === connectionId);
  if (!connection) return null;
  const Logo = connection.logo;
  const folders = (
    CONNECTION_FOLDERS[connection.name] ?? CONNECTION_FOLDERS.default
  ).map((f) => ({ ...f, onClick: () => {} }));

  const canManage = role === "super_admin" || role === "admin";

  const folderColumns = useMemo<ColumnDef<FolderRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        meta: { className: "w-full" },
        cell: (info) => (
          <DataTable.CellContent>
            <div className="flex items-center gap-2">
              <Folder className="h-4 w-4 text-muted-foreground dark:text-muted-foreground-night" />
              <span className="font-medium text-foreground dark:text-foreground-night">
                {info.getValue() as string}
              </span>
            </div>
          </DataTable.CellContent>
        ),
      },
      {
        accessorKey: "lastUpdated",
        header: "Last Updated",
        meta: { className: "w-40" },
        cell: (info) => (
          <DataTable.CellContent>
            <span className="text-muted-foreground dark:text-muted-foreground-night">
              {info.getValue() as string}
            </span>
          </DataTable.CellContent>
        ),
      },
    ],
    []
  );

  return (
    <>
      <Page>
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground dark:text-muted-foreground-night">
          <button
            type="button"
            className="hover:underline cursor-pointer"
            onClick={onBack}
          >
            Connections
          </button>
          <span>/</span>
          <div className="flex items-center gap-1.5 font-medium text-foreground dark:text-foreground-night">
            <Logo className="h-4 w-4" />
            <span>{connection.name}</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Page.SectionHeader title={connection.name} />
          {canManage && (
            <Button
              variant="primary"
              size="sm"
              icon={Settings01}
              label={`Manage ${connection.name}`}
              onClick={() => setManagingConn(connection as ConnectionRow)}
            />
          )}
        </div>

        <DataTable data={folders} columns={folderColumns} className="w-full" />
      </Page>
      <ManageConnectionSheet
        connection={managingConn}
        open={!!managingConn}
        onClose={() => setManagingConn(null)}
        onUpdateDelegates={() => setManagingConn(null)}
        role={role}
        members={members}
      />
    </>
  );
}

// ─── Tools Page ───────────────────────────────────────────────────────────────

interface M1ToolRow {
  id: string;
  name: string;
  description: string;
  usedBy: number;
  availability: "Workspace" | "Personal";
  account?: string;
  byAvatar: string;
  byName: string;
  lastUpdated: string;
  color: string;
  initial: string;
  onClick?: () => void;
}

const M1_TOOLS_DATA: M1ToolRow[] = [
  {
    id: "airtable",
    name: "Airtable",
    description: "Call a tool to answer a question.",
    usedBy: 0,
    availability: "Personal",
    account: "Adèle",
    byAvatar: "https://i.pravatar.cc/150?img=3",
    byName: "Alex",
    lastUpdated: "Jun, 2026",
    color: "#F82B60",
    initial: "⊞",
  },
  {
    id: "apollo-gtm",
    name: "Apollo Gtm",
    description: "Call this tool to search people",
    usedBy: 15,
    availability: "Workspace",
    byAvatar: "https://i.pravatar.cc/150?img=3",
    byName: "Alex",
    lastUpdated: "Jun, 2026",
    color: "#F82B60",
    initial: "⊞",
  },
  {
    id: "asana",
    name: "Asana",
    description: "Call a tool to answer a question.",
    usedBy: 0,
    availability: "Workspace",
    account: "Personal",
    byAvatar: "https://i.pravatar.cc/150?img=3",
    byName: "Alex",
    lastUpdated: "Jun, 2026",
    color: "#FC636B",
    initial: "◉",
  },
  {
    id: "ashby",
    name: "Ashby",
    description: "Access and manage Ashby ATS data.",
    usedBy: 51,
    availability: "Workspace",
    byAvatar: "https://i.pravatar.cc/150?img=14",
    byName: "Aubin",
    lastUpdated: "Nov, 2025",
    color: "#5B6BFF",
    initial: "A",
  },
  {
    id: "attio",
    name: "Attio",
    description: "Attio is the CRM for modern go-to-market teams.",
    usedBy: 1,
    availability: "Workspace",
    account: "Personal",
    byAvatar: "https://i.pravatar.cc/150?img=7",
    byName: "Marie",
    lastUpdated: "Jun, 2026",
    color: "#1C1C1C",
    initial: "A",
  },
  {
    id: "bitly",
    name: "Bitly",
    description: "Call a tool to answer a question.",
    usedBy: 0,
    availability: "Workspace",
    account: "Shared",
    byAvatar: "https://i.pravatar.cc/150?img=3",
    byName: "Alex",
    lastUpdated: "Jun, 2026",
    color: "#EE6123",
    initial: "@",
  },
  {
    id: "brand-fetch",
    name: "Brand Fetch",
    description: "Call a tool to answer a question.",
    usedBy: 5,
    availability: "Workspace",
    byAvatar: "https://i.pravatar.cc/150?img=3",
    byName: "Alex",
    lastUpdated: "Jun, 2026",
    color: "#00B8D9",
    initial: "⊞",
  },
];

const ADD_TOOLS_LIST: {
  name: string;
  logo: React.ComponentType<{ className?: string }> | null;
  color?: string;
}[] = [
  { name: "Amplitude", logo: AmplitudeLogo },
  { name: "Asana", logo: AsanaLogo },
  { name: "Ashby", logo: AshbyLogo },
  { name: "Attio", logo: AttioLogo },
  { name: "BigQuery", logo: BigQueryLogo },
  { name: "Confluence", logo: ConfluenceLogo },
  { name: "Google Drive", logo: DriveLogo },
  { name: "Gong", logo: GongLogo },
  { name: "Intercom", logo: IntercomLogo },
  { name: "Jira", logo: JiraLogo },
  { name: "Linear", logo: LinearLogo },
  { name: "Microsoft", logo: MicrosoftLogo },
  { name: "Notion", logo: NotionLogo },
  { name: "Slack", logo: SlackLogo },
  { name: "Snowflake", logo: SnowflakeLogo },
  { name: "Zendesk", logo: ZendeskLogo },
];

function ToolsPage({ role }: { role: Role }) {
  const [search, setSearch] = useState("");
  const [toolsSearch, setToolsSearch] = useState("");
  const filteredAddTools = ADD_TOOLS_LIST.filter((t) =>
    t.name.toLowerCase().includes(toolsSearch.toLowerCase())
  );
  const filtered = M1_TOOLS_DATA.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase())
  );
  const columns = useMemo<ColumnDef<M1ToolRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        meta: { className: "w-full" },
        cell: (info) => {
          const row = info.row.original;
          return (
            <DataTable.CellContent>
              <div className="flex items-center gap-3">
                <div
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white text-xs"
                  style={{ backgroundColor: row.color }}
                />
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
                    {row.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground dark:text-muted-foreground-night">
                    {row.description}
                  </span>
                </div>
              </div>
            </DataTable.CellContent>
          );
        },
      },
      {
        accessorKey: "usedBy",
        header: "Used By",
        meta: { className: "w-28" },
        cell: (info) => (
          <DataTable.CellContent>
            <div className="flex items-center gap-1 text-sm text-muted-foreground dark:text-muted-foreground-night">
              <Users01 className="h-4 w-4" />
              <span>{info.getValue() as number}</span>
            </div>
          </DataTable.CellContent>
        ),
      },
      {
        accessorKey: "availability",
        header: "Availability",
        meta: { className: "w-32" },
        cell: (info) => (
          <DataTable.CellContent>
            <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              {info.getValue() as string}
            </span>
          </DataTable.CellContent>
        ),
      },
      {
        accessorKey: "account",
        header: "Account",
        meta: { className: "w-40" },
        cell: (info) => (
          <DataTable.CellContent>
            <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              {(info.getValue() as string | undefined) ?? ""}
            </span>
          </DataTable.CellContent>
        ),
      },
      {
        accessorKey: "byName",
        header: "By",
        meta: { className: "w-12" },
        cell: (info) => {
          const row = info.row.original;
          return (
            <DataTable.CellContent>
              <Avatar
                visual={row.byAvatar}
                name={row.byName}
                size="xs"
                isRounded
              />
            </DataTable.CellContent>
          );
        },
      },
      {
        accessorKey: "lastUpdated",
        header: "Last Updated",
        meta: { className: "w-32" },
        cell: (info) => (
          <DataTable.CellContent>
            <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              {info.getValue() as string}
            </span>
          </DataTable.CellContent>
        ),
      },
    ],
    []
  );
  const canAddMcp = role === "super_admin" || role === "admin";
  return (
    <Page>
      <div className="w-full">
        <SearchInput
          name="search-tools"
          placeholder="Search in Tools"
          value={search}
          onChange={setSearch}
        />
      </div>
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <ShapesPlus className="h-4 w-4 text-foreground dark:text-foreground-night" />
          <span className="heading-base text-foreground dark:text-foreground-night">
            Tools
          </span>
        </div>
        <DropdownMenu
          onOpenChange={(open) => {
            if (!open) setToolsSearch("");
          }}
        >
          <DropdownMenuTrigger asChild>
            <Button icon={Plus} label="Add Tools" variant="primary" size="sm" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-[420px]"
            dropdownHeaders={
              <div className="flex items-center gap-2 p-2 border-b border-border dark:border-border-night">
                <div className="flex-1">
                  <SearchInput
                    name="tools-search"
                    placeholder="Search tools..."
                    value={toolsSearch}
                    onChange={setToolsSearch}
                  />
                </div>
                <Button
                  icon={Plus}
                  label="Add MCP Server"
                  variant="primary"
                  size="sm"
                  disabled={!canAddMcp}
                  tooltip={
                    !canAddMcp
                      ? "Only Super Admins and Managers can add MCP servers."
                      : undefined
                  }
                />
              </div>
            }
          >
            {filteredAddTools.map((tool) => (
              <DropdownMenuItem
                key={tool.name}
                label={tool.name}
                icon={
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border dark:border-border-night">
                    {tool.logo ? (
                      <tool.logo className="h-8 w-8" />
                    ) : (
                      <div
                        className="h-10 w-10 rounded-xl"
                        style={{ backgroundColor: tool.color ?? "#888" }}
                      />
                    )}
                  </div>
                }
              />
            ))}
            {filteredAddTools.length === 0 && (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground dark:text-muted-foreground-night">
                No tools found
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <DataTable data={filtered} columns={columns} />
    </Page>
  );
}

// ─── Triggers Page ────────────────────────────────────────────────────────────

interface M1TriggerRow {
  id: string;
  name: string;
  description?: string;
  provider: "Custom" | "Github" | "Zendesk" | "Slack";
  usedBy: number;
  access: string;
  byAvatar: string;
  byName: string;
  lastUpdated: string;
  onClick?: () => void;
}

const M1_TRIGGERS_DATA: M1TriggerRow[] = [
  {
    id: "jiratest",
    name: "JiraTest",
    provider: "Custom",
    usedBy: 0,
    access: "Workspace",
    byAvatar: "https://i.pravatar.cc/150?img=3",
    byName: "Alex",
    lastUpdated: "Oct, 2025",
  },
  {
    id: "alban-test",
    name: "Alban Test",
    provider: "Github",
    usedBy: 0,
    access: "Workspace",
    byAvatar: "https://i.pravatar.cc/150?img=33",
    byName: "Alban",
    lastUpdated: "Oct, 2025",
  },
  {
    id: "freshservice",
    name: "FreshserviceTest",
    provider: "Custom",
    usedBy: 1,
    access: "Workspace",
    byAvatar: "https://i.pravatar.cc/150?img=3",
    byName: "Alex",
    lastUpdated: "Oct, 2025",
  },
  {
    id: "github-issues",
    name: "Github (dust-tt/dust issues)",
    provider: "Github",
    usedBy: 0,
    access: "Workspace",
    byAvatar: "https://i.pravatar.cc/150?img=3",
    byName: "Alex",
    lastUpdated: "Oct, 2025",
  },
  {
    id: "zendesk-test",
    name: "Zendesk test Fabien",
    description: "Testing zendesk connection with d3v-dust",
    provider: "Zendesk",
    usedBy: 1,
    access: "Workspace",
    byAvatar: "https://i.pravatar.cc/150?img=7",
    byName: "Fabien",
    lastUpdated: "Oct, 2025",
  },
];

const ADD_SOURCES_LIST: {
  name: string;
  logo: React.ComponentType<{ className?: string }> | null;
  adminOnly?: boolean;
}[] = [
  { name: "Fathom", logo: FathomLogo },
  { name: "GitHub", logo: GithubLogo },
  { name: "Jira", logo: JiraLogo },
  { name: "Linear", logo: LinearLogo },
  { name: "Zendesk", logo: ZendeskLogo },
  { name: "Custom Webhook", logo: null, adminOnly: true },
];

function TriggersPage({ role }: { role: Role }) {
  const [search, setSearch] = useState("");
  const filtered = M1_TRIGGERS_DATA.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );
  const canAddCustom = role === "super_admin" || role === "admin";
  const columns = useMemo<ColumnDef<M1TriggerRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        meta: { className: "w-full" },
        cell: (info) => {
          const row = info.row.original;
          const ProviderLogo =
            row.provider === "Github"
              ? GithubLogo
              : row.provider === "Zendesk"
                ? ZendeskLogo
                : null;
          return (
            <DataTable.CellContent>
              <div className="flex items-center gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border dark:border-border-night bg-muted-background dark:bg-muted-background-night">
                  {ProviderLogo ? (
                    <ProviderLogo className="h-4 w-4" />
                  ) : (
                    <Globe01 className="h-3.5 w-3.5 text-muted-foreground dark:text-muted-foreground-night" />
                  )}
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
                    {row.name}
                  </span>
                  {row.description && (
                    <span className="truncate text-xs text-muted-foreground dark:text-muted-foreground-night">
                      {row.description}
                    </span>
                  )}
                </div>
              </div>
            </DataTable.CellContent>
          );
        },
      },
      {
        accessorKey: "provider",
        header: "Provider",
        meta: { className: "w-24" },
        cell: (info) => (
          <DataTable.CellContent>
            <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              {info.getValue() as string}
            </span>
          </DataTable.CellContent>
        ),
      },
      {
        accessorKey: "usedBy",
        header: "Used By",
        meta: { className: "w-24" },
        cell: (info) => (
          <DataTable.CellContent>
            <div className="flex items-center gap-1 text-sm text-muted-foreground dark:text-muted-foreground-night">
              <Users01 className="h-4 w-4" />
              <span>{info.getValue() as number}</span>
            </div>
          </DataTable.CellContent>
        ),
      },
      {
        accessorKey: "access",
        header: "Access",
        meta: { className: "w-32" },
        cell: (info) => (
          <DataTable.CellContent>
            <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              {info.getValue() as string}
            </span>
          </DataTable.CellContent>
        ),
      },
      {
        accessorKey: "byName",
        header: "By",
        meta: { className: "w-12" },
        cell: (info) => {
          const row = info.row.original;
          return (
            <DataTable.CellContent>
              <Avatar
                visual={row.byAvatar}
                name={row.byName}
                size="xs"
                isRounded
              />
            </DataTable.CellContent>
          );
        },
      },
      {
        accessorKey: "lastUpdated",
        header: "Last Updated",
        meta: { className: "w-32" },
        cell: (info) => (
          <DataTable.CellContent>
            <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              {info.getValue() as string}
            </span>
          </DataTable.CellContent>
        ),
      },
    ],
    []
  );
  return (
    <Page>
      <div className="w-full">
        <SearchInput
          name="search-triggers"
          placeholder="Search in Triggers"
          value={search}
          onChange={setSearch}
        />
      </div>
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightning01 className="h-4 w-4 text-foreground dark:text-foreground-night" />
          <span className="heading-base text-foreground dark:text-foreground-night">
            Triggers
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              icon={Plus}
              label="Add Source"
              variant="primary"
              size="sm"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {ADD_SOURCES_LIST.map((source) => {
              const isDisabled = source.adminOnly && !canAddCustom;
              return (
                <DropdownMenuItem
                  key={source.name}
                  label={source.name}
                  icon={source.logo ?? Globe01}
                  disabled={isDisabled}
                />
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Page.P variant="secondary" size="sm">
        Here you can add new trigger sources to your workspace. Once created,
        those sources can be used in the Agent Builder to trigger Agents.
      </Page.P>
      <DataTable data={filtered} columns={columns} />
    </Page>
  );
}

// ─── Locked Page ─────────────────────────────────────────────────────────────

function LockedPage({ pageLabel, role }: { pageLabel: string; role: Role }) {
  return (
    <Page>
      <div className="flex flex-col items-center justify-center py-24 text-center gap-5 max-w-sm mx-auto">
        <div className="rounded-full bg-muted-background dark:bg-muted-background-night p-5">
          <Lock01 className="h-8 w-8 text-muted-foreground dark:text-muted-foreground-night" />
        </div>
        <Page.Vertical gap="xs" align="center">
          <Page.H variant="h4">{pageLabel} is managed by Super Admin</Page.H>
          <Page.P variant="secondary" size="sm">
            Your current role ({ROLE_LABELS[role]}) doesn't have access to this
            section. Contact your Super Admin to request access.
          </Page.P>
        </Page.Vertical>
      </div>
    </Page>
  );
}

interface NavSpec {
  id: AdminPage;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_SECTIONS: { title: string; items: NavSpec[] }[] = [
  {
    title: "Workspace",
    items: [
      { id: "people", label: "People", icon: Users01 },
      { id: "identity", label: "IT & Security", icon: Fingerprint04 },
      {
        id: "capabilities",
        label: "Workspace & Governance",
        icon: Toggle01Left,
      },
      { id: "model_providers", label: "Model Providers", icon: Brain },
      { id: "usage", label: "Usage", icon: PieChart01 },
      { id: "analytics", label: "Analytics", icon: BarChart01 },
      { id: "billing", label: "Billing", icon: CreditCard01 },
    ],
  },
  {
    title: "API & Programmatic",
    items: [{ id: "api_keys", label: "API Keys", icon: Key01 }],
  },
  {
    title: "Builder Tools",
    items: [
      { id: "credentials", label: "App Credentials", icon: PuzzlePiece01 },
      { id: "secrets", label: "Secrets", icon: Lock01 },
      { id: "programmatic", label: "Programmatic", icon: Code01 },
    ],
  },
];

// ─── Main Story ───────────────────────────────────────────────────────────────

export default function AdminGovernanceV2() {
  const sidebarRef = useRef<SidebarLayoutRef>(null);
  const [role, setRole] = useState<Role>("super_admin");
  const [activePage, setActivePage] = useState<AdminPage>("people");
  const [activeTab, setActiveTab] = useState<"chat" | "spaces" | "admin">(
    "admin"
  );
  const [spacesPage, setSpacesPage] = useState<
    "space" | "connections" | "tools" | "triggers"
  >("space");
  const [selectedSpace, setSelectedSpace] = useState<string>("Company Data");
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(null);
  const [lockedItem, setLockedItem] = useState<{
    label: string;
    requiredRoles: string[];
  } | null>(null);
  const [members, setMembers] = useState<MemberRow[]>(INITIAL_MEMBERS);
  const [groups, setGroups] = useState<GroupRow[]>(GROUPS);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupSearch, setNewGroupSearch] = useState("");
  const [newGroupSelected, setNewGroupSelected] = useState<string[]>([]);
  const pendingGroupCallback = useRef<((group: GroupRow) => void) | null>(null);
  const newGroupFiltered = members.filter(
    (m) =>
      !newGroupSearch ||
      m.name.toLowerCase().includes(newGroupSearch.toLowerCase()) ||
      m.email.toLowerCase().includes(newGroupSearch.toLowerCase())
  );
  const newGroupAllChecked =
    newGroupFiltered.length > 0 &&
    newGroupFiltered.every((m) => newGroupSelected.includes(m.id));
  const toggleNewGroupMember = (id: string) =>
    setNewGroupSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  const toggleAllNewGroup = () =>
    setNewGroupSelected(
      newGroupAllChecked
        ? newGroupSelected.filter(
            (id) => !newGroupFiltered.some((m) => m.id === id)
          )
        : [
            ...new Set([
              ...newGroupSelected,
              ...newGroupFiltered.map((m) => m.id),
            ]),
          ]
    );
  const resetCreateGroup = () => {
    setNewGroupName("");
    setNewGroupSearch("");
    setNewGroupSelected([]);
  };
  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return;
    const newGroup: GroupRow = {
      id: `g${Date.now()}`,
      name: newGroupName.trim(),
      memberCount: newGroupSelected.length,
      type: "manual",
    };
    setGroups([...groups, newGroup]);
    pendingGroupCallback.current?.(newGroup);
    pendingGroupCallback.current = null;
    resetCreateGroup();
    setCreateGroupOpen(false);
  };
  const handleCloseCreateGroup = () => {
    pendingGroupCallback.current = null;
    resetCreateGroup();
    setCreateGroupOpen(false);
  };
  const openCreateGroup = (onCreated?: (group: GroupRow) => void) => {
    pendingGroupCallback.current = onCreated ?? null;
    setCreateGroupOpen(true);
  };
  const [auditLogsEnabled, setAuditLogsEnabled] = useState(true);
  const [governance, setGovernance] =
    useState<GovernanceSetting[]>(INITIAL_GOVERNANCE);
  const [frameSharing, setFrameSharing] = useState<FrameVisibilitySetting[]>(
    FRAME_VISIBILITY_OPTIONS.map((o) => ({
      ...o,
      scope: "everyone" as GovernanceScope,
      groups: [],
    }))
  );
  const [providers, setProviders] = useState<ProviderDef[]>(INITIAL_PROVIDERS);
  const [connections, setConnections] = useState<ConnectionRow[]>([
    ...INITIAL_CONNECTIONS,
  ]);
  const [managingConn, setManagingConn] = useState<ConnectionRow | null>(null);

  const access = ROLE_ACCESS[role];
  const effectivePage = access.includes(activePage)
    ? activePage
    : (access[0] ?? "people");

  const sidebar = (
    <div className="flex h-full flex-col border-r border-border bg-app-background dark:border-border-night dark:bg-app-background-night">
      <NavTabPill
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as typeof activeTab);
          if (v === "spaces") setSpacesPage("space");
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <NavTabPillList className="px-3 pt-3 pb-1">
          <NavTabPillTrigger value="chat" icon={IntersectDust}>
            Chat
          </NavTabPillTrigger>
          <NavTabPillTrigger value="spaces" icon={Planet}>
            Spaces
          </NavTabPillTrigger>
          <NavTabPillTrigger value="admin" icon={Settings01}>
            Admin
          </NavTabPillTrigger>
          <div className="flex flex-grow justify-end">
            <NavTabPillTrigger
              value="collapse"
              icon={LayoutLeft}
              onClick={() => sidebarRef.current?.toggle()}
            />
          </div>
        </NavTabPillList>

        {/* Spaces sidebar */}
        <NavTabPillContent
          value="spaces"
          className="data-[state=active]:flex min-h-0 flex-1 flex-col"
        >
          <SpacesSidebarNav
            role={role}
            onConnectionsClick={() => {
              if (role === "admin") {
                setLockedItem({
                  label: "Connections",
                  requiredRoles: ["Super Admin"],
                });
              } else {
                setSpacesPage("connections");
                setSelectedConnectionId(null);
              }
            }}
            onToolsClick={() =>
              role === "admin"
                ? setLockedItem({
                    label: "Tools",
                    requiredRoles: ["Super Admin"],
                  })
                : setSpacesPage("tools")
            }
            onTriggersClick={() =>
              role === "admin"
                ? setLockedItem({
                    label: "Triggers",
                    requiredRoles: ["Super Admin"],
                  })
                : setSpacesPage("triggers")
            }
            selectedSpace={spacesPage === "space" ? selectedSpace : null}
            onSpaceClick={(name) => {
              setSelectedSpace(name);
              setSpacesPage("space");
            }}
          />
        </NavTabPillContent>

        {/* Admin sidebar */}
        <NavTabPillContent
          value="admin"
          className="data-[state=active]:flex min-h-0 flex-1 flex-col"
        >
          <ScrollArea className="flex-1">
            <ScrollBar orientation="vertical" size="minimal" />
            <NavigationList className="px-2 py-2">
              {NAV_SECTIONS.map((section) => (
                <NavigationListCollapsibleSection
                  key={section.title}
                  label={section.title}
                  defaultOpen
                >
                  {section.items.map((item) => {
                    const accessible = access.includes(item.id);
                    return (
                      <div
                        key={item.id}
                        className={`ag-nav-item${!accessible ? " opacity-40" : ""}`}
                      >
                        <NavigationListItem
                          icon={accessible ? item.icon : Lock01}
                          label={item.label}
                          selected={effectivePage === item.id && accessible}
                          onClick={() => {
                            if (accessible) {
                              setActivePage(item.id);
                            } else {
                              const requiredRoles = (
                                Object.keys(ROLE_ACCESS) as Role[]
                              )
                                .filter((r) => ROLE_ACCESS[r].includes(item.id))
                                .map((r) => ROLE_LABELS[r]);
                              setLockedItem({
                                label: item.label,
                                requiredRoles,
                              });
                            }
                          }}
                        />
                      </div>
                    );
                  })}
                </NavigationListCollapsibleSection>
              ))}
            </NavigationList>
          </ScrollArea>
        </NavTabPillContent>

        {/* Chat sidebar (empty) */}
        <NavTabPillContent
          value="chat"
          className="data-[state=active]:flex min-h-0 flex-1 flex-col"
        />
      </NavTabPill>

      {/* Bottom bar — matches Projects.tsx exactly */}
      <div className="flex h-14 items-center justify-between gap-2 border-t border-border pl-1 pr-2 dark:border-border-night">
        <Card size="xs" className="p-1" containerClassName="flex-1 min-w-0">
          <div className="flex min-w-0 items-center gap-2 pr-1">
            <Avatar name="Thomas Schmidt" size="sm" isRounded />
            <div className="flex min-w-0 grow flex-col text-sm text-foreground dark:text-foreground-night">
              <span className="heading-sm min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                Thomas Schmidt
              </span>
              <span className="-mt-0.5 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-muted-foreground dark:text-muted-foreground-night">
                ACME
              </span>
            </div>
          </div>
        </Card>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="xs"
              variant="outline"
              isSelect
              label={ROLE_LABELS[role]}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end">
            {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
              <DropdownMenuItem
                key={r}
                label={ROLE_LABELS[r]}
                onClick={() => setRole(r)}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  const content = (
    <ScrollArea className="h-full bg-background dark:bg-background-night">
      <ScrollBar orientation="vertical" size="minimal" />
      <div
        key={
          activeTab === "admin"
            ? effectivePage
            : `${activeTab}-${spacesPage}-${selectedConnectionId ?? ""}`
        }
        className="ag-page-in"
      >
        {activeTab === "spaces" ? (
          spacesPage === "space" ? (
            <SpacePage
              name={selectedSpace}
              isRestricted={
                RESTRICTED_SPACES_MEMBER.includes(selectedSpace) ||
                RESTRICTED_SPACES_NO_ACCESS.includes(selectedSpace)
              }
              role={role}
              members={members}
              groups={GROUPS}
            />
          ) : selectedConnectionId ? (
            <ConnectionDetailPage
              connectionId={selectedConnectionId}
              role={role}
              members={members}
              onBack={() => setSelectedConnectionId(null)}
            />
          ) : spacesPage === "connections" ? (
            role === "admin" ? (
              <LockedSpacePage title="Connections" />
            ) : (
              <ConnectionsPage
                connections={connections}
                onManage={(conn) => setManagingConn(conn)}
                onOpenDetail={(conn) => setSelectedConnectionId(conn.name)}
              />
            )
          ) : spacesPage === "tools" ? (
            role === "admin" ? (
              <LockedSpacePage title="Tools" />
            ) : (
              <ToolsPage role={role} />
            )
          ) : role === "admin" ? (
            <LockedSpacePage title="Triggers" />
          ) : (
            <TriggersPage role={role} />
          )
        ) : activeTab === "chat" ? (
          <PlaceholderPage
            title="Chat"
            description="Chat interface coming soon."
            icon={Settings01}
          />
        ) : effectivePage === "people" ? (
          <PeoplePage
            role={role}
            members={members}
            setMembers={setMembers}
            groups={groups}
            setGroups={setGroups}
            onNavigate={(page) => setActivePage(page as AdminPage)}
            defaultTab="members"
            onTabChange={() => {}}
            onCreateGroup={openCreateGroup}
          />
        ) : effectivePage === "capabilities" ? (
          <GovernancePage
            role={role}
            settings={governance}
            setSettings={setGovernance}
            groups={groups}
            onNavigateToGroups={() => setActivePage("people" as AdminPage)}
            onCreateGroup={openCreateGroup}
            frameSharing={frameSharing}
            setFrameSharing={setFrameSharing}
            auditLogsEnabled={auditLogsEnabled}
            setAuditLogsEnabled={setAuditLogsEnabled}
          />
        ) : effectivePage === "model_providers" ? (
          <ModelProvidersPage
            role={role}
            providers={providers}
            setProviders={setProviders}
            groups={groups}
          />
        ) : effectivePage === "identity" ? (
          <IdentityPage role={role} auditLogsEnabled={auditLogsEnabled} />
        ) : effectivePage === "analytics" ? (
          <AnalyticsPage />
        ) : effectivePage === "billing" ? (
          <BillingPage />
        ) : effectivePage === "usage" ? (
          <UsagePage role={role} members={members} setMembers={setMembers} />
        ) : effectivePage === "api_keys" ? (
          <PlaceholderPage
            title="API Keys"
            description="Manage API keys for programmatic access."
            icon={Key01}
          />
        ) : effectivePage === "programmatic" ? (
          <PlaceholderPage
            title="Programmatic usage"
            description="Track API usage and quotas."
            icon={Code01}
          />
        ) : effectivePage === "credentials" ? (
          <PlaceholderPage
            title="App Credentials"
            description="Manage application credentials."
            icon={PuzzlePiece01}
          />
        ) : (
          <PlaceholderPage
            title="Secrets"
            description="Manage workspace secrets."
            icon={Lock01}
          />
        )}
      </div>
    </ScrollArea>
  );

  return (
    <>
      <style>{ANIMATION_CSS}</style>

      <ManageConnectionSheet
        connection={managingConn}
        open={!!managingConn}
        onClose={() => setManagingConn(null)}
        onUpdateDelegates={(name, delegates) => {
          setConnections(
            connections.map((c) => (c.name === name ? { ...c, delegates } : c))
          );
        }}
        role={role}
        members={members}
      />

      {/* Locked section dialog */}
      <Dialog
        open={!!lockedItem}
        onOpenChange={(open) => {
          if (!open) setLockedItem(null);
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{lockedItem?.label}</DialogTitle>
          </DialogHeader>
          <DialogContainer>
            <Page.P size="sm">
              You need to be{" "}
              <span className="font-semibold text-foreground dark:text-foreground-night">
                {lockedItem?.requiredRoles.join(" or ")}
              </span>{" "}
              to access this section.
            </Page.P>
            <Page.P variant="secondary" size="sm">
              Contact your Super Admin to get the required permissions.
            </Page.P>
          </DialogContainer>
          <DialogFooter
            rightButtonProps={{
              label: "Got it",
              variant: "primary",
              onClick: () => setLockedItem(null),
            }}
          />
        </DialogContent>
      </Dialog>
      <div className="flex h-screen w-full bg-background dark:bg-background-night">
        <SidebarLayout
          ref={sidebarRef}
          sidebar={sidebar}
          content={content}
          defaultSidebarWidth={260}
          minSidebarWidth={220}
          maxSidebarWidth={340}
        />
      </div>
      {/* Create group modal */}
      <Dialog
        open={createGroupOpen}
        onOpenChange={(o) => !o && handleCloseCreateGroup()}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>New group</DialogTitle>
          </DialogHeader>
          <DialogContainer
            fixedContent={
              <div className="flex flex-col gap-4">
                <Page.Vertical gap="xs">
                  <Label>Group name</Label>
                  <Input
                    placeholder="e.g. Engineering Team"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    name="new-group-name"
                    containerClassName="w-full"
                  />
                </Page.Vertical>
                <div className="flex items-center justify-between">
                  <Label>
                    Members
                    {newGroupSelected.length > 0 && (
                      <span className="ml-1 text-muted-foreground font-normal">
                        ({newGroupSelected.length} selected)
                      </span>
                    )}
                  </Label>
                </div>
                <SearchInput
                  name="new-group-member-search"
                  placeholder="Search users..."
                  value={newGroupSearch}
                  onChange={setNewGroupSearch}
                />
              </div>
            }
          >
            <table className="w-full">
              <thead>
                <tr className="border-b border-border dark:border-border-night">
                  <th className="py-2 pr-4 text-left w-8">
                    <Checkbox
                      checked={newGroupAllChecked}
                      onCheckedChange={toggleAllNewGroup}
                    />
                  </th>
                  <th className="py-2 text-left text-xs font-semibold text-foreground dark:text-foreground-night w-full">
                    Name
                  </th>
                  <th className="py-2 w-24" />
                </tr>
              </thead>
              <tbody>
                {newGroupFiltered.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-border dark:border-border-night last:border-0 cursor-pointer hover:bg-muted-background dark:hover:bg-muted-background-night"
                    onClick={() => toggleNewGroupMember(m.id)}
                  >
                    <td
                      className="py-3 pr-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={newGroupSelected.includes(m.id)}
                        onCheckedChange={() => toggleNewGroupMember(m.id)}
                      />
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <Avatar size="xs" name={m.name} />
                        <span className="text-sm font-medium text-foreground dark:text-foreground-night">
                          {m.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 text-right">
                      <Chip
                        color={ROLE_DISPLAY[m.role ?? "member"].color}
                        label={ROLE_DISPLAY[m.role ?? "member"].label}
                        size="sm"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              onClick: handleCloseCreateGroup,
              variant: "outline",
            }}
            rightButtonProps={{
              label: "Create group",
              onClick: handleCreateGroup,
              variant: "primary",
              disabled: !newGroupName.trim(),
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

export const storyName = "Admin Governance M1 + M2";
