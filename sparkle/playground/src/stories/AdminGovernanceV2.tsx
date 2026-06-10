import {
  Avatar,
  BarChart01,
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
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DotsHorizontal,
  Fingerprint04,
  Folder,
  Globe01,
  Input,
  Key01,
  Label,
  LayerSingle,
  LayersThree01,
  LayersTwo01,
  Lock01,
  NavigationList,
  NavigationListCollapsibleSection,
  NavigationListItem,
  Page,
  PieChart01,
  Plus,
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
} from "@dust-tt/sparkle";
import {
  AmplitudeLogo,
  AsanaLogo,
  AshbyLogo,
  AttioLogo,
  BigQueryLogo,
  ConfluenceLogo,
  FathomLogo,
  GithubLogo,
  GongLogo,
  DriveLogo,
  IntercomLogo,
  JiraLogo,
  LinearLogo,
  MicrosoftLogo,
  NotionLogo,
  SlackLogo,
  SnowflakeLogo,
  ZendeskLogo,
} from "@dust-tt/sparkle/logo/platforms";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useRef, useState } from "react";

// ─── Global animation styles ──────────────────────────────────────────────────

const ANIMATION_CSS = `
  :root {
    --ease-out-cubic: cubic-bezier(0.215, 0.61, 0.355, 1);
    --ease-out-quart: cubic-bezier(0.165, 0.84, 0.44, 1);
    --ease-in-out-cubic: cubic-bezier(0.645, 0.045, 0.355, 1);
  }

  @keyframes ag-page-in {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes ag-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes ag-chip-in {
    from { opacity: 0; transform: scale(0.82); }
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

  .ag-page-in    { animation: ag-page-in    200ms var(--ease-out-cubic) both; }
  .ag-fade-in    { animation: ag-fade-in    150ms var(--ease-out-cubic) both; }
  .ag-chip-in    { animation: ag-chip-in    150ms var(--ease-out-quart) both; }
  .ag-section-in { animation: ag-section-in 180ms var(--ease-out-cubic) both; }

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
    .ag-model-row:hover { background-color: var(--muted); }
  }

  /* Toggle row hover */
  @media (hover: hover) and (pointer: fine) {
    .ag-governance-row:hover { background-color: rgba(0,0,0,0.015); }
  }
  .ag-governance-row { transition: background-color 120ms ease; }

  /* Chart line draw */
  .ag-chart-line {
    stroke-dasharray: 2000;
    stroke-dashoffset: 0;
    animation: ag-chart-draw 900ms var(--ease-out-cubic) both;
  }

  /* Reduced motion: disable everything */
  @media (prefers-reduced-motion: reduce) {
    .ag-page-in, .ag-fade-in, .ag-chip-in, .ag-section-in {
      animation: none !important;
    }
    .ag-btn-press { transition: none !important; }
    .ag-nav-item  { transition: none !important; }
    .ag-model-row { transition: none !important; }
    .ag-governance-row { transition: none !important; }
    .ag-chart-line { animation: none !important; }
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
  | "workspace"
  | "models"
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

const INITIAL_GOVERNANCE: GovernanceSetting[] = [
  {
    id: "create_agents",
    label: "Members can create agents",
    description: "Build new agents in the Agent Builder",
    scope: "groups",
    groups: ["Design Team", "Engineering Team"],
  },
  {
    id: "publish_agents",
    label: "Members can publish agents",
    description: "Publish agents workspace-wide for all members to use",
    scope: "everyone",
    groups: [],
  },
  {
    id: "create_skills",
    label: "Members can create skills",
    description: "Build custom Skills",
    scope: "everyone",
    groups: [],
  },
  {
    id: "publish_skills",
    label: "Members can publish skills",
    description: "Publish Skills workspace-wide for all members to use",
    scope: "disabled",
    groups: [],
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
  admin: "Business Admin",
  security_admin: "Security Admin",
  billing_admin: "Billing Admin",
};

// Exact pages accessible per role — V2 IA
const ROLE_ACCESS: Record<Role, AdminPage[]> = {
  super_admin: [
    "people",
    "capabilities",
    "identity",
    "workspace",
    "models",
    "analytics",
    "api_keys",
    "programmatic",
    "credentials",
    "secrets",
    "billing",
    "usage",
  ],
  admin: [
    "people",
    "capabilities",
    "models",
    "analytics",
    "api_keys",
    "programmatic",
    "credentials",
    "secrets",
  ],
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
  admin: { label: "Business Admin", color: "green" },
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
        <div className="s-flex s-flex-col s-flex-1 s-overflow-hidden s-px-6 s-gap-4 s-py-4">
          <Page.Vertical gap="xs">
            <Label>Add members</Label>
            <SearchInput
              name="search"
              placeholder={searchPlaceholder}
              value={search}
              onChange={setSearch}
            />
          </Page.Vertical>
          <div className="s-flex-1 s-overflow-auto">
            <table className="s-w-full">
              <thead>
                <tr className="s-border-b s-border-border dark:s-border-border-night">
                  <th className="s-py-2 s-pr-4 s-text-left s-w-8">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={toggleAll}
                    />
                  </th>
                  <th className="s-py-2 s-text-left s-text-xs s-font-semibold s-text-foreground dark:s-text-foreground-night s-w-full">
                    <div className="s-flex s-items-center s-gap-1">Name ↓</div>
                  </th>
                  <th className="s-py-2 s-w-24" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr
                    key={m.id}
                    className="s-border-b s-border-border dark:s-border-border-night last:s-border-0 s-cursor-pointer hover:s-bg-muted-background dark:hover:s-bg-muted-background-night"
                    onClick={() => toggle(m.id)}
                  >
                    <td className="s-py-3 s-pr-4">
                      <Checkbox
                        checked={selected.includes(m.id)}
                        onCheckedChange={() => toggle(m.id)}
                      />
                    </td>
                    <td className="s-py-3">
                      <div className="s-flex s-items-center s-gap-2">
                        <Avatar size="sm" name={m.name} />
                        <span className="s-text-sm s-font-medium s-text-foreground dark:s-text-foreground-night">
                          {m.name}
                        </span>
                      </div>
                    </td>
                    <td className="s-py-3 s-text-right">
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
}: {
  role: Role;
  members: MemberRow[];
  setMembers: (m: MemberRow[]) => void;
  groups: GroupRow[];
  setGroups: (g: GroupRow[]) => void;
  onNavigate: (page: AdminPage) => void;
  defaultTab?: "members" | "groups";
  onTabChange?: (tab: "members" | "groups") => void;
}) {
  const [sub, setSub] = useState<"members" | "groups">(defaultTab ?? "members");
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmails, setInviteEmails] = useState("");
  const [inviteRole, setInviteRole] = useState("Select role");
  const [inviteBilling, setInviteBilling] = useState<"monthly" | "yearly">(
    "monthly"
  );
  const [invitePlan, setInvitePlan] = useState<"free" | "pro" | "max">("pro");
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
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
        meta: { className: "s-w-full" },
        cell: (info) => {
          const row = info.row.original;
          return (
            <DataTable.CellContent>
              <div className="s-flex s-items-center s-gap-3">
                <Avatar
                  size="sm"
                  name={row.name}
                  visual={row.visual}
                  isRounded
                />
                <div className="s-flex s-flex-col">
                  <span className="s-text-sm s-font-semibold s-text-foreground dark:s-text-foreground-night leading-snug">
                    {row.name}
                  </span>
                  <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
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
        meta: { className: "s-w-32" },
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
        meta: { className: "s-w-20" },
        cell: (info) => {
          const seat = info.getValue() as MemberRow["seat"];
          const seatColors: Record<MemberRow["seat"], string> = {
            max: "s-text-amber-500",
            pro: "s-text-blue-500",
            free: "s-text-slate-400",
          };
          return (
            <DataTable.CellContent>
              <span className={`s-text-sm s-font-semibold ${seatColors[seat]}`}>
                {seat.charAt(0).toUpperCase() + seat.slice(1)}
              </span>
            </DataTable.CellContent>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        meta: { className: "s-w-40" },
        cell: (info) => (
          <DataTable.CellContent>
            <span className="s-text-sm s-text-foreground dark:s-text-foreground-night">
              {STATUS_LABELS[info.getValue() as MemberRow["status"]]}
            </span>
          </DataTable.CellContent>
        ),
      },
      {
        accessorKey: "groupCount",
        header: "Groups",
        meta: { className: "s-w-24" },
        cell: (info) => {
          const count = info.getValue() as number;
          return (
            <DataTable.CellContent>
              <span className="s-text-sm s-text-foreground dark:s-text-foreground-night">
                {count > 0 ? `${count} group${count > 1 ? "s" : ""}` : "—"}
              </span>
            </DataTable.CellContent>
          );
        },
      },
      {
        id: "actions",
        header: "",
        meta: { className: "s-w-10" },
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

  const groupColumns = useMemo<ColumnDef<GroupRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        meta: { className: "s-w-full" },
        cell: (info) => {
          const row = info.row.original;
          return (
            <DataTable.CellContent>
              <div className="s-flex s-items-center s-gap-3">
                <Users01 className="s-h-5 s-w-5 s-shrink-0 s-text-muted-foreground dark:s-text-muted-foreground-night" />
                <span className="s-text-sm s-font-semibold s-text-foreground dark:s-text-foreground-night">
                  {row.name}
                </span>
                <span className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
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
        meta: { className: "s-w-32" },
        cell: (info) => {
          const type = info.getValue() as GroupRow["type"];
          return (
            <DataTable.CellContent>
              <Chip
                color={type === "provisioned" ? "green" : "blue"}
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
    onClick: () => setSelectedGroup(g),
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
        : inviteRole === "Business Admin"
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

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return;
    setGroups([
      ...groups,
      {
        id: `g${Date.now()}`,
        name: newGroupName.trim(),
        memberCount: 0,
        type: "manual" as const,
      },
    ]);
    setNewGroupName("");
    setCreateGroupOpen(false);
  };

  const handleSaveGroup = (selected: string[]) => {
    if (!selectedGroup) return;
    setGroups(
      groups.map((g) =>
        g.id === selectedGroup.id ? { ...g, memberCount: selected.length } : g
      )
    );
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
          <div className="s-mt-4">
            <Page.Vertical gap="md">
              {/* Search + invite row */}
              <div className="s-flex s-w-full s-items-center s-gap-2">
                <SearchInput
                  name="member-search"
                  placeholder="Search"
                  value={search}
                  onChange={setSearch}
                  className="s-flex-1"
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
              <div className="s-flex s-w-full s-items-center s-justify-between s-gap-4">
                <ButtonsSwitchList size="sm" defaultValue="members">
                  <ButtonsSwitch value="members" label="Members" />
                  <ButtonsSwitch value="invitations" label="Invitations" />
                </ButtonsSwitchList>
                <div className="s-flex s-items-center s-gap-2">
                  <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
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
              </div>
              <DataTable data={filteredMembers} columns={memberColumns} />
            </Page.Vertical>
          </div>
        </TabsContent>

        <TabsContent value="groups">
          <div className="s-mt-4">
            <Page.Vertical gap="md">
              <div className="s-w-full s-rounded-xl s-bg-muted-background dark:s-bg-muted-background-night s-px-4 s-py-3">
                <Page.P variant="secondary" size="sm">
                  User provisioning is configured in{" "}
                  <button
                    type="button"
                    className="s-underline s-font-medium s-text-foreground dark:s-text-foreground-night"
                    onClick={() => onNavigate("identity" as AdminPage)}
                  >
                    Identity &amp; Provisioning → User provisioning
                  </button>
                </Page.P>
              </div>
              <div className="s-flex s-w-full s-items-center s-gap-2">
                <SearchInput
                  name="group-search"
                  placeholder="Search"
                  value={search}
                  onChange={setSearch}
                  className="s-flex-1"
                />
                {canEdit && (
                  <span className="ag-btn-press">
                    <Button
                      icon={Plus}
                      label="Create group"
                      variant="primary"
                      size="sm"
                      onClick={() => setCreateGroupOpen(true)}
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
          <div className="s-flex s-flex-col s-gap-5 s-px-5 s-py-4">
            {/* Email input */}
            <Page.Vertical gap="xs">
              <Label>Email addresses</Label>
              <div className="s-w-full">
                <Input
                  placeholder="Email addresses, comma separated"
                  value={inviteEmails}
                  onChange={(e) => setInviteEmails(e.target.value)}
                  name="invite-emails"
                  className="s-w-full"
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
                  className="s-self-start"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {(
                  [
                    "Super Admin",
                    "Business Admin",
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
              className="s-self-start"
            >
              <ButtonsSwitch value="monthly" label="Monthly" />
              <ButtonsSwitch value="yearly" label="Yearly" />
            </ButtonsSwitchList>

            {/* Plan cards */}
            <div className="s-flex s-flex-col s-gap-2">
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
                  className={`s-w-full s-flex s-items-center s-justify-between s-rounded-xl s-border s-px-4 s-py-3 s-text-left s-transition-colors ${
                    invitePlan === plan.id
                      ? "s-border-highlight-500 s-bg-highlight-50 dark:s-bg-highlight-900/20"
                      : "s-border-border dark:s-border-border-night hover:s-bg-muted-background dark:hover:s-bg-muted-background-night"
                  }`}
                >
                  <div className="s-flex s-items-center s-gap-3">
                    <plan.Icon className="s-h-5 s-w-5 s-shrink-0 s-text-muted-foreground dark:s-text-muted-foreground-night" />
                    <div className="s-flex s-flex-col s-gap-0.5">
                      <span className="s-text-sm s-font-semibold s-text-foreground dark:s-text-foreground-night">
                        {plan.label}
                      </span>
                      <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                        {plan.credits}
                      </span>
                    </div>
                  </div>
                  <div className="s-flex s-items-center s-gap-2">
                    {plan.available !== null && (
                      <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                        {plan.available} Available
                      </span>
                    )}
                    {plan.price && (
                      <span className="s-text-sm s-font-semibold s-text-foreground dark:s-text-foreground-night">
                        {plan.price}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
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

      {/* Create group sheet */}
      <Sheet open={createGroupOpen} onOpenChange={setCreateGroupOpen}>
        <SheetContent side="right" size="lg">
          <SheetHeader>
            <SheetTitle>New group</SheetTitle>
          </SheetHeader>
          <div className="s-flex s-flex-col s-gap-4 s-flex-1 s-overflow-auto s-px-6 s-py-4">
            <Page.Vertical gap="xs">
              <Label>Group name</Label>
              <Input
                placeholder="e.g. Engineering Team"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
              />
            </Page.Vertical>
            <Page.Vertical gap="xs">
              <Label>Add members</Label>
              <SearchInput
                name="search"
                placeholder="Search by name or email"
                value=""
                onChange={() => {}}
              />
            </Page.Vertical>
          </div>
          <SheetFooter
            leftButtonProps={{
              label: "Cancel",
              onClick: () => setCreateGroupOpen(false),
              variant: "outline",
            }}
            rightButtonProps={{
              label: "Create group",
              onClick: handleCreateGroup,
              variant: "primary",
              disabled: !newGroupName.trim(),
            }}
          />
        </SheetContent>
      </Sheet>

      {/* Edit group sheet */}
      <MemberPickerSheet
        title={selectedGroup?.name ?? ""}
        open={!!selectedGroup}
        onClose={() => setSelectedGroup(null)}
        primaryLabel="Save"
        onPrimary={handleSaveGroup}
        preSelected={members.slice(0, 3).map((m) => m.id)}
        members={members}
      />

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
          <div className="s-px-5 s-py-2">
            <Page.P variant="secondary" size="sm">
              Super Admin grants full access to all workspace settings including
              SSO, billing, and audit logs. This is a sensitive action — are you
              sure you want to grant this role?
            </Page.P>
          </div>
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
            <div className="s-flex s-flex-col s-gap-5 s-px-5 s-py-4">
              {/* Member identity */}
              <div className="s-flex s-items-center s-gap-3">
                <Avatar
                  size="lg"
                  name={selectedMember.name}
                  visual={selectedMember.visual}
                  isRounded
                />
                <div>
                  <div className="s-text-base s-font-semibold s-text-foreground dark:s-text-foreground-night">
                    {selectedMember.name}
                  </div>
                  <div className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
                    {selectedMember.email}
                  </div>
                </div>
              </div>

              {/* Role picker */}
              <div className="s-flex s-flex-col s-gap-2">
                <Label>Role</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      label={ROLE_DISPLAY[memberPlan].label}
                      isSelect
                      size="sm"
                      className="s-self-start"
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
              <div className="s-flex s-flex-col s-gap-2">
                <Label>Seat type</Label>
                <div className="s-flex s-flex-col s-gap-2">
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
                        className={`s-w-full s-flex s-items-center s-justify-between s-rounded-xl s-border s-px-4 s-py-3 s-text-left s-transition-colors ${
                          editSeat === plan.id
                            ? "s-border-highlight-500 s-bg-highlight-50 dark:s-bg-highlight-900/20"
                            : "s-border-border dark:s-border-border-night hover:s-bg-muted-background dark:hover:s-bg-muted-background-night"
                        }`}
                      >
                        <div className="s-flex s-items-center s-gap-3">
                          <plan.Icon className="s-h-5 s-w-5 s-shrink-0 s-text-muted-foreground dark:s-text-muted-foreground-night" />
                          <div className="s-flex s-flex-col s-gap-0.5">
                            <span className="s-text-sm s-font-semibold s-text-foreground dark:s-text-foreground-night">
                              {plan.label}
                            </span>
                            <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                              {plan.credits}
                            </span>
                          </div>
                        </div>
                        {plan.price && (
                          <span className="s-text-sm s-font-semibold s-text-foreground dark:s-text-foreground-night">
                            {plan.price}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Danger zone */}
              <div className="s-flex s-flex-col s-gap-2">
                <Button
                  variant="warning"
                  label="Remove member access"
                  size="sm"
                  className="s-self-start"
                />
                <Page.P variant="secondary" size="sm">
                  This will permanently remove {selectedMember.name}'s access to
                  the company workspace.
                </Page.P>
              </div>
            </div>
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

      {/* Seat upgrade confirmation (Business Admin only) */}
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
          <div className="s-px-5 s-py-4">
            <Page.P variant="secondary">
              Upgrading{" "}
              <span className="s-font-semibold s-text-foreground dark:s-text-foreground-night">
                {selectedMember?.name}
              </span>{" "}
              to a{" "}
              <span className="s-font-semibold s-text-foreground dark:s-text-foreground-night">
                {confirmSeatUpgrade === "pro" ? "Pro" : "Max"}
              </span>{" "}
              seat will add a recurring charge to your company's subscription.
              Are you sure you want to proceed?
            </Page.P>
          </div>
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

function IdentityPage({ role }: { role: Role }) {
  const canEdit = role === "super_admin";
  const showAuditLogs = role === "security_admin";

  const domainColumns = useMemo<ColumnDef<DomainRow>[]>(
    () => [
      {
        accessorKey: "domain",
        header: "Domain",
        meta: { className: "s-w-full" },
        cell: (info) => (
          <DataTable.BasicCellContent label={info.getValue() as string} />
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        meta: { className: "s-w-40" },
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
        title="Identity & provisioning"
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
        <div className="s-flex s-flex-col s-items-start  s-rounded-xl s-border s-border-border dark:s-border-border-night s-divide-y s-divide-border dark:s-divide-border-night">
          <div className="s-flex s-items-start s-gap-4 s-p-4">
            <Page.Vertical gap="xs" sizing="grow">
              <Page.Horizontal gap="sm">
                <Page.H variant="h5">Single Sign-On (SSO)</Page.H>
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
          <div className="s-flex s-items-start s-gap-4 s-p-4">
            <Page.Vertical gap="xs" sizing="grow">
              <Page.H variant="h5">Auto-join Workspace</Page.H>
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
        <div className="s-flex s-items-start s-gap-4 s-rounded-xl s-border s-border-border dark:s-border-border-night s-p-4">
          <Page.Vertical gap="xs" sizing="grow">
            <Page.Horizontal gap="sm">
              <Page.H variant="h5">Directory sync</Page.H>
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
}: {
  setting: GovernanceSetting;
  canEdit: boolean;
  onChange: (s: GovernanceSetting) => void;
  groups: GroupRow[];
}) {
  return (
    <div className="ag-governance-row s-w-full s-flex s-flex-col s-gap-3 s-rounded-xl s-border s-border-border dark:s-border-border-night s-p-4">
      <div className="s-flex s-w-full s-items-center s-justify-between s-gap-4">
        <Page.Vertical gap="xs" sizing="grow">
          <Page.H variant="h5">{setting.label}</Page.H>
          <Page.P variant="secondary" size="sm">
            {setting.description}
          </Page.P>
        </Page.Vertical>
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
          <ButtonsSwitch value="disabled" label="Disabled" />
        </ButtonsSwitchList>
      </div>
      {setting.scope === "groups" && (
        <div className="ag-section-in s-flex s-items-center s-gap-2 s-flex-wrap">
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
                {groups
                  .filter((g) => !setting.groups.includes(g.name))
                  .map((g) => (
                    <DropdownMenuItem
                      key={g.id}
                      label={g.name}
                      onClick={() =>
                        onChange({
                          ...setting,
                          groups: [...setting.groups, g.name],
                        })
                      }
                    />
                  ))}
                {groups.filter((g) => !setting.groups.includes(g.name))
                  .length === 0 && (
                  <DropdownMenuItem label="All groups added" disabled />
                )}
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

function GovernancePage({
  role,
  settings,
  setSettings,
  groups,
  onNavigateToGroups,
}: {
  role: Role;
  settings: GovernanceSetting[];
  setSettings: (s: GovernanceSetting[]) => void;
  groups: GroupRow[];
  onNavigateToGroups: () => void;
}) {
  const canEdit = role === "super_admin" || role === "admin";
  const update = (updated: GovernanceSetting) =>
    setSettings(settings.map((s) => (s.id === updated.id ? updated : s)));
  const [assignTarget, setAssignTarget] = useState<
    "billing_admin" | "security_manager" | null
  >(null);

  return (
    <Page>
      <Page.Header
        title="Governance"
        description="Control what members can create and publish. Use groups to grant exceptions."
        icon={Toggle01Left}
      />
      <div className="s-w-full s-rounded-xl s-bg-muted-background dark:s-bg-muted-background-night s-px-4 s-py-3">
        <Page.P variant="secondary" size="sm">
          Groups assigned here are managed in{" "}
          <button
            type="button"
            className="s-underline s-font-medium s-text-foreground dark:s-text-foreground-night"
            onClick={onNavigateToGroups}
          >
            People → Groups
          </button>
        </Page.P>
      </div>
      <Page.Vertical gap="sm">
        <Page.SectionHeader title="Agents" />
        {settings
          .filter((s) => s.id.includes("agent"))
          .map((s) => (
            <GovernanceRow
              key={s.id}
              setting={s}
              canEdit={canEdit}
              onChange={update}
              groups={groups}
            />
          ))}
      </Page.Vertical>
      <Page.Separator />
      <Page.Vertical gap="sm">
        <Page.SectionHeader title="Skills" />
        {settings
          .filter((s) => s.id.includes("skill"))
          .map((s) => (
            <GovernanceRow
              key={s.id}
              setting={s}
              canEdit={canEdit}
              onChange={update}
              groups={groups}
            />
          ))}
      </Page.Vertical>
      <Page.Separator />
      <Page.Vertical gap="sm">
        <Page.SectionHeader title="Billing & Security" />
        {[
          {
            id: "billing_admin",
            title: "Billing admin",
            desc: "Manage your billing settings, view invoices, and update payment methods.",
            members: ["Jane Doe", "Jack Doerty"],
          },
          {
            id: "security_manager",
            title: "Security manager",
            desc: "Manage security by controlling user access, verifying identities, and handling provisioning across the workspace.",
            members: ["Jane Doe", "Jack Doerty"],
          },
        ].map((item) => (
          <div
            key={item.id}
            className="s-flex s-w-full s-flex-col s-gap-3 s-rounded-xl s-border s-border-border dark:s-border-border-night s-p-4"
          >
            <Page.Vertical gap="xs">
              <Page.H variant="h5">{item.title}</Page.H>
              <Page.P variant="secondary" size="sm">
                {item.desc}
              </Page.P>
            </Page.Vertical>
            <div className="s-flex s-items-start s-gap-3 s-flex-wrap">
              {item.members.map((name) => (
                <Chip
                  key={name}
                  label={name}
                  size="xs"
                  color="primary"
                  onRemove={canEdit ? () => {} : undefined}
                />
              ))}
              {canEdit && (
                <Button
                  variant="ghost"
                  size="xs"
                  icon={Plus}
                  label="Assign member"
                  onClick={() =>
                    setAssignTarget(
                      item.id as "billing_admin" | "security_manager"
                    )
                  }
                />
              )}
            </div>
          </div>
        ))}
      </Page.Vertical>

      {/* Assign member sheets */}
      <MemberPickerSheet
        title="Billing Admin"
        open={assignTarget === "billing_admin"}
        onClose={() => setAssignTarget(null)}
        primaryLabel="Create group"
        onPrimary={() => setAssignTarget(null)}
        preSelected={[]}
        searchPlaceholder="e.g. John Doe"
      />
      <MemberPickerSheet
        title="Security manager"
        open={assignTarget === "security_manager"}
        onClose={() => setAssignTarget(null)}
        primaryLabel="Create group"
        onPrimary={() => setAssignTarget(null)}
        preSelected={[]}
        searchPlaceholder="e.g. John Doe"
      />
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
      <div className="s-flex s-flex-col s-gap-4 s-rounded-[20px] s-border s-border-border dark:s-border-border-night s-p-5">
        <div className="s-flex s-items-center s-justify-between s-gap-3">
          <div className="s-flex s-items-center s-gap-2">
            <Page.H variant="h4">Business</Page.H>
            <Chip color="blue" label="Current" size="xs" />
          </div>
          <Button variant="outline" label="Cancel subscription" size="sm" />
        </div>
        <div className="s-flex s-flex-col s-gap-1">
          <Page.P variant="secondary" size="sm">
            Frequency: Monthly
          </Page.P>
          <Page.P variant="secondary" size="sm">
            Next billing date: October, 14, 2026
          </Page.P>
          <Page.P size="sm">
            Amount: <span className="s-font-semibold">$15,000</span>
          </Page.P>
        </div>
        <div className="s-flex s-items-center s-justify-between s-rounded-xl s-border s-border-border dark:s-border-border-night s-px-4 s-py-3">
          <Page.P variant="secondary" size="sm">
            Switch to yearly to save $XXX per year
          </Page.P>
          <Button variant="primary" label="Upgrade" size="sm" />
        </div>
      </div>

      {/* Plan breakdown */}
      <div className="s-grid s-grid-cols-2 s-gap-4">
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
            className="s-flex s-flex-col s-gap-3 s-rounded-[20px] s-border s-border-border dark:s-border-border-night s-p-5"
          >
            <div>
              <Page.H variant="h5">{plan.name}</Page.H>
              <div className="s-flex s-items-baseline s-gap-1 s-mt-1">
                <span className="s-text-2xl s-font-bold s-text-foreground dark:s-text-foreground-night s-tabular-nums">
                  {plan.price}
                </span>
                <span className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
                  {plan.unit}
                </span>
              </div>
            </div>
            <div className="s-border-t s-border-border dark:s-border-border-night" />
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
        <div className="s-rounded-[20px] s-border s-border-border dark:s-border-border-night s-divide-y s-divide-border dark:s-divide-border-night">
          <div className="s-flex s-items-start s-justify-between s-gap-4 s-p-5">
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
          <div className="s-flex s-items-center s-justify-between s-gap-4 s-p-5">
            <div className="s-flex s-items-center s-gap-3">
              <div className="s-rounded s-border s-border-border dark:s-border-border-night s-px-2 s-py-0.5 s-text-xs s-font-bold s-text-blue-700">
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
        <div className="s-rounded-[20px] s-border s-border-border dark:s-border-border-night s-divide-y s-divide-border dark:s-divide-border-night">
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
            <div
              key={i}
              className="s-flex s-items-center s-gap-4 s-px-5 s-py-3"
            >
              <span className="s-flex-1 s-text-sm s-text-foreground dark:s-text-foreground-night">
                {inv.label}
              </span>
              <span className="s-w-32 s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
                {inv.date}
              </span>
              <span className="s-w-16 s-text-right s-text-sm s-font-medium s-text-foreground dark:s-text-foreground-night">
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
        : inviteRole === "Business Admin"
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
    max: "s-text-amber-500",
    pro: "s-text-blue-500",
    free: "s-text-slate-400",
  };

  const usageColumns = useMemo<ColumnDef<MemberRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        meta: { className: "s-w-full" },
        cell: (info) => {
          const row = info.row.original;
          return (
            <DataTable.CellContent>
              <div className="s-flex s-items-center s-gap-3">
                <Avatar size="sm" name={row.name} />
                <div>
                  <div className="s-text-sm s-font-semibold s-text-foreground dark:s-text-foreground-night">
                    {row.name}
                  </div>
                  <div className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
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
        meta: { className: "s-w-20" },
        cell: (info) => {
          const seat = info.getValue() as MemberRow["seat"];
          return (
            <DataTable.CellContent>
              <span className={`s-text-sm s-font-semibold ${seatColors[seat]}`}>
                {seat.charAt(0).toUpperCase() + seat.slice(1)}
              </span>
            </DataTable.CellContent>
          );
        },
      },
      {
        accessorKey: "role",
        header: "Role",
        meta: { className: "s-w-32" },
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
        meta: { className: "s-w-56" },
        cell: (info) => {
          const row = info.row.original;
          const usage = row.usage ?? 0;
          const limit = row.limit;
          const pct = limit ? Math.min(100, (usage / limit) * 100) : 0;
          return (
            <DataTable.CellContent>
              <div className="s-flex s-items-center s-gap-2">
                <span className="s-text-sm s-tabular-nums s-text-foreground dark:s-text-foreground-night s-w-14 s-text-right">
                  {usage.toLocaleString()}
                </span>
                {limit ? (
                  <div className="s-flex s-flex-1 s-flex-col s-gap-0.5">
                    <div className="s-h-1 s-w-full s-rounded-full s-bg-muted-background dark:s-bg-muted-background-night">
                      <div
                        className="s-h-full s-rounded-full s-bg-primary-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="s-text-xs s-tabular-nums s-text-muted-foreground dark:s-text-muted-foreground-night s-text-right">
                      {limit.toLocaleString()}
                    </span>
                  </div>
                ) : (
                  <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
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
        meta: { className: "s-w-10" },
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

      <div className="s-flex s-flex-col s-items-start s-gap-3 s-rounded-xl s-border s-border-border dark:s-border-border-night s-p-4">
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
        <div className="s-h-2 s-rounded-full s-overflow-hidden s-flex s-gap-px">
          <div className="s-h-full s-bg-amber-400" style={{ width: "30%" }} />
          <div className="s-h-full s-bg-purple-400" style={{ width: "20%" }} />
          <div className="s-h-full s-bg-pink-400" style={{ width: "5%" }} />
          <div className="s-h-full s-flex-1 s-bg-muted-background dark:s-bg-muted-background-night" />
        </div>
        <Page.Horizontal gap="md">
          <span className="s-flex s-items-center s-gap-1 s-text-sm s-text-foreground dark:s-text-foreground-night">
            <span className="s-inline-block s-h-2 s-w-2 s-rounded-full s-bg-amber-400" />{" "}
            Users
          </span>
          <span className="s-flex s-items-center s-gap-1 s-text-sm s-text-foreground dark:s-text-foreground-night">
            <span className="s-inline-block s-h-2 s-w-2 s-rounded-full s-bg-purple-400" />{" "}
            Programmatic Usage
          </span>
          <span className="s-flex s-items-center s-gap-1 s-text-sm s-text-foreground dark:s-text-foreground-night">
            <span className="s-inline-block s-h-2 s-w-2 s-rounded-full s-bg-pink-400" />{" "}
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
          <div className="s-flex s-flex-col s-gap-5 s-px-5 s-py-4">
            <Page.Vertical gap="xs">
              <Label>Email addresses</Label>
              <div className="s-w-full">
                <Input
                  placeholder="Email addresses, comma separated"
                  value={inviteEmails}
                  onChange={(e) => setInviteEmails(e.target.value)}
                  name="invite-emails-usage"
                  className="s-w-full"
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
                  className="s-self-start"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {(
                  [
                    "Super Admin",
                    "Business Admin",
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
              className="s-self-start"
            >
              <ButtonsSwitch value="monthly" label="Monthly" />
              <ButtonsSwitch value="yearly" label="Yearly" />
            </ButtonsSwitchList>
            <div className="s-flex s-flex-col s-gap-2">
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
                  className={`s-w-full s-flex s-items-center s-justify-between s-rounded-xl s-border s-px-4 s-py-3 s-text-left s-transition-colors ${
                    invitePlan === plan.id
                      ? "s-border-highlight-500 s-bg-highlight-50 dark:s-bg-highlight-900/20"
                      : "s-border-border dark:s-border-border-night hover:s-bg-muted-background dark:hover:s-bg-muted-background-night"
                  }`}
                >
                  <div className="s-flex s-items-center s-gap-3">
                    <plan.Icon className="s-h-5 s-w-5 s-shrink-0 s-text-muted-foreground dark:s-text-muted-foreground-night" />
                    <div className="s-flex s-flex-col s-gap-0.5">
                      <span className="s-text-sm s-font-semibold s-text-foreground dark:s-text-foreground-night">
                        {plan.label}
                      </span>
                      <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                        {plan.credits}
                      </span>
                    </div>
                  </div>
                  <div className="s-flex s-items-center s-gap-2">
                    {plan.available !== null && (
                      <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                        {plan.available} Available
                      </span>
                    )}
                    {plan.price && (
                      <span className="s-text-sm s-font-semibold s-text-foreground dark:s-text-foreground-night">
                        {plan.price}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
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
      <div className="s-flex s-items-center s-justify-center s-rounded-xl s-border s-border-dashed s-border-border dark:s-border-border-night s-p-12">
        <Page.P variant="secondary">Content coming soon</Page.P>
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
    <svg viewBox={`0 0 ${w} ${height}`} className="s-w-full" style={{ height }}>
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
    <div className="s-flex s-flex-col s-gap-2">
      <div className="s-flex s-h-8 s-w-full s-overflow-hidden s-rounded-lg">
        {segments.map((s, i) => (
          <div
            key={i}
            style={{ width: `${s.pct}%`, backgroundColor: s.color }}
            className="s-flex s-items-center s-justify-center s-text-xs s-font-semibold s-text-white"
          >
            {s.pct}%
          </div>
        ))}
      </div>
      <div className="s-flex s-flex-wrap s-gap-3">
        {segments.map((s, i) => (
          <div key={i} className="s-flex s-items-center s-gap-1.5">
            <div
              className="s-h-2 s-w-2 s-rounded-full s-shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
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
      <div className="s-flex s-items-start s-justify-between">
        <Page.Header
          title="Analytics"
          description="Track how your team uses Dust."
          icon={BarChart01}
        />
        <Button variant="outline" label="Last 30 days" isSelect size="sm" />
      </div>

      {/* Stat cards */}
      <div className="s-flex s-gap-4">
        <div className="s-flex-1 s-rounded-xl s-border s-border-border dark:s-border-border-night s-p-4">
          <Page.P variant="secondary" size="sm">
            Total members
          </Page.P>
          <p className="s-text-3xl s-font-semibold s-text-foreground dark:s-text-foreground-night s-mt-1 s-tabular-nums">
            1,234
          </p>
        </div>
        <div className="s-flex-1 s-rounded-xl s-border s-border-border dark:s-border-border-night s-p-4">
          <Page.P variant="secondary" size="sm">
            Active users (last 30 days)
          </Page.P>
          <p className="s-text-3xl s-font-semibold s-text-foreground dark:s-text-foreground-night s-mt-1 s-tabular-nums">
            456
          </p>
        </div>
      </div>

      {/* Activity chart */}
      <div className="s-rounded-xl s-border s-border-border dark:s-border-border-night s-p-4 s-flex s-flex-col s-gap-3">
        <div className="s-flex s-items-center s-justify-between">
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
        <div className="s-relative">
          <LineChart data={MESSAGES_DATA} color="#3B82F6" height={120} />
          <div className="s-absolute s-inset-0 s-pointer-events-none">
            <LineChart data={CONV_DATA} color="#10B981" height={120} />
          </div>
        </div>
        <div className="s-flex s-items-center s-gap-4 s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
          <span className="s-flex s-items-center s-gap-1">
            <span
              className="s-h-2 s-w-4 s-rounded-sm s-inline-block"
              style={{ backgroundColor: "#3B82F6" }}
            />{" "}
            Messages
          </span>
          <span className="s-flex s-items-center s-gap-1">
            <span
              className="s-h-2 s-w-4 s-rounded-sm s-inline-block"
              style={{ backgroundColor: "#10B981" }}
            />{" "}
            Conversations
          </span>
        </div>
      </div>

      {/* Source */}
      <div className="s-rounded-xl s-border s-border-border dark:s-border-border-night s-p-4 s-flex s-flex-col s-gap-3">
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
      <div className="s-rounded-xl s-border s-border-border dark:s-border-border-night s-p-4 s-flex s-flex-col s-gap-3">
        <div className="s-flex s-items-center s-justify-between">
          <div>
            <Page.H variant="h5">Tool usage</Page.H>
            <Page.P variant="secondary" size="sm">
              Tool usage across your workspace over the last 30 days.
            </Page.P>
          </div>
          <div className="s-flex s-items-center s-gap-2">
            <Button variant="outline" size="xs" label="3 tools" isSelect />
            <ButtonsSwitchList size="xs" defaultValue="executions">
              <ButtonsSwitch value="executions" label="Executions" />
              <ButtonsSwitch value="users" label="Users" />
            </ButtonsSwitchList>
          </div>
        </div>
        <div className="s-relative s-h-28">
          <div className="s-absolute s-inset-0">
            <LineChart data={WEBSEARCH_DATA} color="#3B82F6" height={112} />
          </div>
          <div className="s-absolute s-inset-0">
            <LineChart data={CODEEXEC_DATA} color="#F59E0B" height={112} />
          </div>
          <div className="s-absolute s-inset-0">
            <LineChart data={FILEREADER_DATA} color="#10B981" height={112} />
          </div>
        </div>
        <div className="s-flex s-items-center s-gap-4 s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
          <span className="s-flex s-items-center s-gap-1">
            <span
              className="s-h-2 s-w-4 s-rounded-sm s-inline-block"
              style={{ backgroundColor: "#3B82F6" }}
            />{" "}
            Web search
          </span>
          <span className="s-flex s-items-center s-gap-1">
            <span
              className="s-h-2 s-w-4 s-rounded-sm s-inline-block"
              style={{ backgroundColor: "#F59E0B" }}
            />{" "}
            Code exec
          </span>
          <span className="s-flex s-items-center s-gap-1">
            <span
              className="s-h-2 s-w-4 s-rounded-sm s-inline-block"
              style={{ backgroundColor: "#10B981" }}
            />{" "}
            File reader
          </span>
        </div>
      </div>

      {/* Top users */}
      <div className="s-rounded-xl s-border s-border-border dark:s-border-border-night s-p-4 s-flex s-flex-col s-gap-3">
        <Page.H variant="h5">Top users</Page.H>
        <Page.P variant="secondary" size="sm">
          Top 100 users with the most messages over the last 30 days.
        </Page.P>
        <table className="s-w-full">
          <thead>
            <tr className="s-border-b s-border-border dark:s-border-border-night">
              <th className="s-py-2 s-pr-4 s-text-left s-text-xs s-font-semibold s-text-foreground dark:s-text-foreground-night s-w-full">
                <div className="s-flex s-items-center s-gap-1">User ↓</div>
              </th>
              <th className="s-py-2 s-pr-4 s-text-left s-text-xs s-font-semibold s-text-foreground dark:s-text-foreground-night s-w-32">
                Messages
              </th>
              <th className="s-py-2 s-text-left s-text-xs s-font-semibold s-text-foreground dark:s-text-foreground-night s-w-28">
                Agent Used
              </th>
            </tr>
          </thead>
          <tbody>
            {topUsers.map((u) => (
              <tr
                key={u.name}
                className="s-border-b s-border-border dark:s-border-border-night last:s-border-0"
              >
                <td className="s-py-3 s-pr-4">
                  <div className="s-flex s-items-center s-gap-2">
                    <Avatar size="sm" name={u.name} />
                    <span className="s-text-sm s-font-medium s-text-foreground dark:s-text-foreground-night">
                      {u.name}
                    </span>
                  </div>
                </td>
                <td className="s-py-3 s-pr-4 s-text-sm s-text-foreground dark:s-text-foreground-night">
                  {u.messages}
                </td>
                <td className="s-py-3 s-text-sm s-text-foreground dark:s-text-foreground-night">
                  {u.agents}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Spend distribution */}
      <div className="s-rounded-xl s-border s-border-border dark:s-border-border-night s-p-4 s-flex s-flex-col s-gap-3">
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
      <div className="s-rounded-xl s-border s-border-border dark:s-border-border-night s-p-4 s-flex s-flex-col s-gap-3">
        <Page.H variant="h5">Top agents</Page.H>
        <Page.P variant="secondary" size="sm">
          Top 100 agents with the most messages over the last 30 days.
        </Page.P>
        <table className="s-w-full">
          <thead>
            <tr className="s-border-b s-border-border dark:s-border-border-night">
              <th className="s-py-2 s-pr-4 s-text-left s-text-xs s-font-semibold s-text-foreground dark:s-text-foreground-night s-w-full">
                User ↓
              </th>
              <th className="s-py-2 s-pr-4 s-text-left s-text-xs s-font-semibold s-text-foreground dark:s-text-foreground-night s-w-28">
                Messages
              </th>
              <th className="s-py-2 s-pr-4 s-text-left s-text-xs s-font-semibold s-text-foreground dark:s-text-foreground-night s-w-20">
                Users
              </th>
              <th className="s-py-2 s-text-left s-text-xs s-font-semibold s-text-foreground dark:s-text-foreground-night s-w-40">
                Model
              </th>
            </tr>
          </thead>
          <tbody>
            {topAgents.map((a) => (
              <tr
                key={a.name}
                className="s-border-b s-border-border dark:s-border-border-night last:s-border-0"
              >
                <td className="s-py-3 s-pr-4">
                  <div className="s-flex s-items-center s-gap-2">
                    <span className="s-text-lg">{a.icon}</span>
                    <span className="s-text-sm s-font-medium s-text-foreground dark:s-text-foreground-night">
                      {a.name}
                    </span>
                  </div>
                </td>
                <td className="s-py-3 s-pr-4 s-text-sm s-text-foreground dark:s-text-foreground-night">
                  {a.messages}
                </td>
                <td className="s-py-3 s-pr-4 s-text-sm s-text-foreground dark:s-text-foreground-night">
                  {a.users}
                </td>
                <td className="s-py-3 s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
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
  enabled: boolean;
}

interface ProviderDef {
  id: string;
  name: string;
  logo: string;
  logoBg: string;
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
    logo: "O",
    logoBg: "s-bg-black",
    models: [
      {
        name: "GPT 5.5",
        description: "OpenAI's latest cutting-edge model",
        tier: "balanced",
        enabled: false,
      },
      {
        name: "GPT mini",
        description: "OpenAI Small Model",
        tier: "cheap",
        enabled: true,
      },
      {
        name: "GPT Nano",
        description: "OpenAI Small Model",
        tier: "cheap",
        enabled: true,
      },
      {
        name: "o3",
        description: "OpenAI Cutting-edge Model",
        tier: "expensive",
        enabled: true,
      },
      {
        name: "o4",
        description: "OpenAI Premier Model",
        tier: "expensive",
        enabled: false,
      },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    logo: "A",
    logoBg: "s-bg-[#cc785c]",
    models: [
      {
        name: "Claude 4.5 Haiku",
        description: "Anthropic Latest Flagship Model",
        tier: "fast",
        enabled: true,
      },
      {
        name: "Claude 4.5 Sonnet",
        description: "Anthropic Balanced Model",
        tier: "balanced",
        enabled: true,
      },
      {
        name: "Claude Opus 4.6",
        description: "Anthropic Premier Model",
        tier: "premier",
        enabled: false,
      },
    ],
  },
  {
    id: "mistral",
    name: "Mistral AI",
    logo: "M",
    logoBg: "s-bg-[#fa6705]",
    models: [
      {
        name: "Mistral Large",
        description: "Mistral AI Flagship Model",
        tier: "flagship",
        enabled: false,
      },
      {
        name: "Mistral Small",
        description: "Mistral AI Cutting-edge Model",
        tier: "cheap",
        enabled: true,
      },
      {
        name: "Mistral Codestral",
        description: "Mistral AI Premier Model",
        tier: "premier",
        enabled: false,
      },
    ],
  },
  {
    id: "gemini",
    name: "Gemini",
    logo: "G",
    logoBg: "s-bg-[#4285f4]",
    models: [
      {
        name: "Gemini 3.1 Focus",
        description: "Gemini Latest Flagship Model",
        tier: "flagship",
        enabled: false,
      },
      {
        name: "Gemini 3 Flash",
        description: "Gemini Small Model",
        tier: "fast",
        enabled: true,
      },
      {
        name: "Gemini 3.1 Pro",
        description: "Gemini Balanced Model",
        tier: "balanced",
        enabled: false,
      },
    ],
  },
  {
    id: "fireworks",
    name: "Fireworks",
    logo: "8×",
    logoBg: "s-bg-[#7c3aed]",
    models: [
      {
        name: "DeepSeek V4 Pro",
        description: "Fireworks Latest Flagship Model",
        tier: "flagship",
        enabled: false,
      },
      {
        name: "Kimi 2.5",
        description: "Fireworks Small Model",
        tier: "cheap",
        enabled: false,
      },
      {
        name: "MiniMax M2.5",
        description: "Fireworks Small Model",
        tier: "cheap",
        enabled: true,
      },
      {
        name: "Kimi K2 Instruct",
        description: "Fireworks Premier Model",
        tier: "premier",
        enabled: false,
      },
      {
        name: "GLM-5",
        description: "Fireworks Cutting-edge Model",
        tier: "expensive",
        enabled: false,
      },
    ],
  },
];

function ModelProvidersPage() {
  const [providers, setProviders] = useState<ProviderDef[]>(INITIAL_PROVIDERS);
  const [makeAllAvailable, setMakeAllAvailable] = useState(false);
  const [embeddingProvider, setEmbeddingProvider] = useState("OpenAI");

  const toggleModel = (providerId: string, modelName: string) => {
    setProviders((prev) =>
      prev.map((p) =>
        p.id === providerId
          ? {
              ...p,
              models: p.models.map((m) =>
                m.name === modelName ? { ...m, enabled: !m.enabled } : m
              ),
            }
          : p
      )
    );
  };

  const handleMakeAll = (val: boolean) => {
    setMakeAllAvailable(val);
    if (val) {
      setProviders((prev) =>
        prev.map((p) => ({
          ...p,
          models: p.models.map((m) => ({ ...m, enabled: true })),
        }))
      );
    }
  };

  return (
    <Page>
      <Page.Header
        title="Model Providers"
        description="Configure model providers."
        icon={Server01}
      />

      {/* Embedding provider */}
      <div className="s-flex s-w-full s-items-start s-justify-between s-gap-6 s-rounded-xl s-border s-border-border dark:s-border-border-night s-p-4">
        <Page.Vertical gap="xs" sizing="grow">
          <Page.H variant="h6">Embedding provider</Page.H>
          <Page.P variant="secondary" size="sm">
            Embedding models are used to create numerical representations of
            your data powering the semantic search capabilities of your agents.
          </Page.P>
        </Page.Vertical>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              label={embeddingProvider}
              isSelect
              size="sm"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {["OpenAI", "Anthropic", "Mistral AI"].map((p) => (
              <DropdownMenuItem
                key={p}
                label={p}
                onClick={() => setEmbeddingProvider(p)}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Make all available */}
      <div className="s-flex s-w-full s-items-center s-justify-between s-gap-4">
        <Page.P size="sm">Make all models available</Page.P>
        <SliderToggle
          selected={makeAllAvailable}
          onClick={() => handleMakeAll(!makeAllAvailable)}
          size="sm"
        />
      </div>

      {/* Provider sections */}
      {providers.map((provider) => (
        <Page.Vertical key={provider.id} gap="xs">
          {/* Provider header */}
          <div className="s-flex s-items-center s-gap-2 s-py-2">
            <div
              className={`s-flex s-h-6 s-w-6 s-items-center s-justify-center s-rounded-full ${provider.logoBg} s-text-[10px] s-font-bold s-text-white s-shrink-0`}
            >
              {provider.logo}
            </div>
            <Page.H variant="h6">{provider.name}</Page.H>
            <Page.P variant="secondary" size="sm">
              {provider.models.length} models
            </Page.P>
          </div>

          {/* Model rows */}
          <div className="s-w-full s-flex s-flex-col s-divide-y s-divide-border dark:s-divide-border-night s-rounded-xl s-border s-border-border dark:s-border-border-night">
            {provider.models.map((model) => (
              <div
                key={model.name}
                className="ag-model-row s-flex s-w-full s-items-center s-justify-between s-gap-4 s-px-4 s-py-3"
              >
                <div className="s-flex s-flex-col s-gap-0.5 s-flex-1 s-min-w-0">
                  <div className="s-flex s-items-center s-gap-1.5">
                    <span className="s-text-sm s-font-semibold s-text-foreground dark:s-text-foreground-night">
                      {model.name}
                    </span>
                    <Chip
                      label={TIER_LABELS[model.tier]}
                      color={TIER_COLORS[model.tier]}
                      size="xs"
                    />
                  </div>
                  <Page.P variant="secondary" size="sm">
                    {model.description}
                  </Page.P>
                </div>
                <SliderToggle
                  selected={model.enabled}
                  onClick={() => toggleModel(provider.id, model.name)}
                  size="xs"
                />
              </div>
            ))}
          </div>
        </Page.Vertical>
      ))}
    </Page>
  );
}

// ─── Spaces Sidebar Nav ───────────────────────────────────────────────────────

function SpacesSidebarNav({
  onConnectionsClick,
  onToolsClick,
  onTriggersClick,
  role,
}: {
  onConnectionsClick: () => void;
  onToolsClick: () => void;
  onTriggersClick: () => void;
  role: Role;
}) {
  return (
    <ScrollArea className="s-flex-1">
      <ScrollBar orientation="vertical" size="minimal" />
      <NavigationList className="s-px-2 s-py-2">
        <NavigationListCollapsibleSection label="Administration" defaultOpen>
          <NavigationListItem
            icon={CloudArrowLeftRight}
            label="Connections"
            onClick={onConnectionsClick}
          />
          <NavigationListItem
            icon={ShapesPlus}
            label="Tools"
            onClick={onToolsClick}
          />
          <NavigationListItem
            icon={Lightning01}
            label="Triggers"
            onClick={onTriggersClick}
          />
        </NavigationListCollapsibleSection>

        <NavigationListCollapsibleSection label="Open Spaces" defaultOpen>
          {OPEN_SPACES.map((s) => (
            <NavigationListItem
              key={s}
              icon={Globe01}
              label={s}
              onClick={() => {}}
            />
          ))}
        </NavigationListCollapsibleSection>

        <NavigationListCollapsibleSection label="Restricted Spaces" defaultOpen>
          {RESTRICTED_SPACES_MEMBER.map((s) => (
            <NavigationListItem
              key={s}
              icon={Lock01}
              label={s}
              onClick={() => {}}
            />
          ))}
          {(role === "super_admin" || role === "admin") &&
            RESTRICTED_SPACES_NO_ACCESS.map((s) => (
              <div key={s} className="s-opacity-50">
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
}: {
  connection: ConnectionRow | null;
  open: boolean;
  onClose: () => void;
  onUpdateDelegates: (name: string, delegates: string[]) => void;
}) {
  const handleSave = () => {
    if (connection) {
      onUpdateDelegates(connection.name, connection.delegates);
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
        <div className="s-flex s-flex-col s-gap-6 s-px-6 s-py-4 s-flex-1 s-overflow-auto">
          {/* Edit / Delete */}
          <div className="s-flex s-gap-2">
            <Button variant="outline" size="sm" label="Edit connection" />
            <Button variant="warning" size="sm" label="Delete connection" />
          </div>

          {/* Connection options */}
          <Page.Vertical gap="sm">
            <Page.SectionHeader title="Connection options" />
            <div className="s-flex s-w-full s-items-center s-justify-between s-rounded-xl s-border s-border-border dark:s-border-border-night s-p-4">
              <div className="s-flex s-flex-col s-gap-0.5">
                <span className="s-text-sm s-font-semibold s-text-foreground dark:s-text-foreground-night">
                  Use descriptions
                </span>
                <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                  Your tables and columns description set in {connection.name}{" "}
                  will be used to describe the schemas to Agents.
                </span>
              </div>
              <SliderToggle selected={true} onClick={() => {}} />
            </div>
          </Page.Vertical>

          {/* Select tables */}
          <Page.Vertical gap="sm">
            <Page.SectionHeader title="Select tables" />
            <div className="s-w-full s-rounded-xl s-border s-border-border dark:s-border-border-night s-divide-y s-divide-border dark:s-divide-border-night">
              {["or1g1n-186209", "dust-dev"].map((table, i) => (
                <div
                  key={table}
                  className="s-flex s-items-center s-gap-3 s-px-4 s-py-3"
                >
                  <Checkbox checked={i === 1} onCheckedChange={() => {}} />
                  <span className="s-text-sm s-text-foreground dark:s-text-foreground-night">
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
  role,
}: {
  connections: ConnectionRow[];
  onManage: (conn: ConnectionRow) => void;
  onOpenDetail: (conn: ConnectionRow) => void;
  role: Role;
}) {
  const [search, setSearch] = useState("");
  const [requestTarget, setRequestTarget] = useState<ConnectionRow | null>(
    null
  );
  const [requestMessage, setRequestMessage] = useState("");
  const [requestedIds, setRequestedIds] = useState<string[]>([]);
  const [configureTarget, setConfigureTarget] = useState<ConnectionRow | null>(
    null
  );

  const canManage = role === "super_admin" || role === "admin";

  const columns = useMemo<ColumnDef<ConnectionRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        meta: { className: "s-w-full" },
        cell: (info) => {
          const row = info.row.original;
          const Logo = row.logo;
          return (
            <DataTable.CellContent>
              <div className="s-flex s-items-center s-gap-3">
                <div className="s-h-6 s-w-6 s-shrink-0">
                  <Logo className="s-h-6 s-w-6" />
                </div>
                <span className="s-font-semibold s-text-foreground dark:s-text-foreground-night">
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
        meta: { className: "s-w-28" },
        cell: (info) => {
          return (
            <DataTable.CellContent>
              <div className="s-flex s-items-center s-gap-1 s-text-muted-foreground dark:s-text-muted-foreground-night">
                <Users01 className="s-h-3.5 s-w-3.5" />
                <span>{info.getValue() as number}</span>
              </div>
            </DataTable.CellContent>
          );
        },
      },
      {
        accessorKey: "managedByAvatar",
        header: "Managed By",
        meta: { className: "s-w-28" },
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
        meta: { className: "s-w-32" },
        cell: (info) => {
          return (
            <DataTable.CellContent>
              <span className="s-text-muted-foreground dark:s-text-muted-foreground-night s-whitespace-nowrap">
                {info.getValue() as string}
              </span>
            </DataTable.CellContent>
          );
        },
      },
      {
        id: "action",
        header: "",
        meta: { className: "s-w-36" },
        cell: (info: { row: { original: ConnectionRow } }) => {
          const row = info.row.original;
          const requested = requestedIds.includes(row.name);
          if (canManage) {
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
          }
          return (
            <DataTable.CellContent>
              {requested ? (
                <Chip label="Requested" size="xs" color="warning" />
              ) : (
                <Button
                  variant="outline"
                  size="xs"
                  label="Request access"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRequestTarget(row);
                  }}
                />
              )}
            </DataTable.CellContent>
          );
        },
      },
    ],
    [role, onManage, requestedIds, canManage]
  );

  const rows = connections
    .filter(
      (c) => !search || c.name.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => (a.configured === b.configured ? 0 : a.configured ? -1 : 1))
    .map((c) => ({
      ...c,
      onClick: canManage ? () => onOpenDetail(c) : undefined,
    }));

  return (
    <div className="s-flex s-flex-col s-h-full">
      <Page>
        <div className="s-w-full">
          <SearchInput
            name="search-connections"
            placeholder="Search in Connections"
            value={search}
            onChange={setSearch}
          />
        </div>
        <div className="s-flex s-w-full s-items-center s-justify-between">
          <div className="s-flex s-items-center s-gap-2">
            <CloudArrowLeftRight className="s-h-4 s-w-4 s-text-foreground dark:s-text-foreground-night" />
            <span className="s-heading-base s-text-foreground dark:s-text-foreground-night">
              Connections
            </span>
          </div>
        </div>
        <DataTable data={rows} columns={columns} className="s-w-full" />
      </Page>

      {/* Request Access Sheet */}
      <Sheet
        open={!!requestTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRequestTarget(null);
            setRequestMessage("");
          }
        }}
      >
        <SheetContent size="lg">
          <SheetHeader>
            <SheetTitle>Request access to {requestTarget?.name}</SheetTitle>
          </SheetHeader>
          <div className="s-flex s-flex-col s-gap-5 s-p-5">
            {requestTarget && (
              <div className="s-flex s-items-center s-gap-3 s-rounded-xl s-bg-muted-background dark:s-bg-muted-background-night s-p-4">
                <div className="s-h-8 s-w-8 s-shrink-0">
                  <requestTarget.logo className="s-h-8 s-w-8" />
                </div>
                <div className="s-flex s-flex-col">
                  <span className="s-heading-sm s-text-foreground dark:s-text-foreground-night">
                    {requestTarget.name}
                  </span>
                  <span className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
                    {requestTarget.usedBy} users · Last sync{" "}
                    {requestTarget.lastSync}
                  </span>
                </div>
              </div>
            )}
            <div className="s-flex s-flex-col s-gap-2">
              <Label>Why do you need access?</Label>
              <TextArea
                placeholder="Explain why your team needs access to this data source..."
                value={requestMessage}
                onChange={(e) => setRequestMessage(e.target.value)}
                minRows={4}
              />
              <Page.P variant="secondary" size="sm">
                Your request will be sent to the Super Admin for approval.
              </Page.P>
            </div>
          </div>
          <SheetFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => {
                setRequestTarget(null);
                setRequestMessage("");
              },
            }}
            rightButtonProps={{
              label: "Send request",
              variant: "primary",
              disabled: !requestMessage.trim(),
              onClick: () => {
                if (requestTarget) {
                  setRequestedIds((prev) => [...prev, requestTarget.name]);
                }
                setRequestTarget(null);
                setRequestMessage("");
              },
            }}
          />
        </SheetContent>
      </Sheet>

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
          <div className="s-flex s-flex-col s-gap-5 s-px-6 s-py-4">
            {configureTarget && (
              <div className="s-flex s-items-center s-gap-3 s-rounded-xl s-bg-muted-background dark:s-bg-muted-background-night s-p-4">
                <configureTarget.logo className="s-h-8 s-w-8 s-shrink-0" />
                <div className="s-flex s-flex-col">
                  <span className="s-heading-sm s-text-foreground dark:s-text-foreground-night">
                    {configureTarget.name}
                  </span>
                  <span className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
                    Not configured yet
                  </span>
                </div>
              </div>
            )}
            <div className="s-flex s-items-start s-justify-between s-gap-4 s-rounded-xl s-border s-border-border dark:s-border-border-night s-p-4">
              <div className="s-flex s-flex-col s-gap-1">
                <span className="s-text-sm s-font-semibold s-text-foreground dark:s-text-foreground-night">
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
}: {
  connectionId: string;
  onBack: () => void;
  role: Role;
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
        meta: { className: "s-w-full" },
        cell: (info) => (
          <DataTable.CellContent>
            <div className="s-flex s-items-center s-gap-2">
              <Folder className="s-h-4 s-w-4 s-text-muted-foreground dark:s-text-muted-foreground-night" />
              <span className="s-font-medium s-text-foreground dark:s-text-foreground-night">
                {info.getValue() as string}
              </span>
            </div>
          </DataTable.CellContent>
        ),
      },
      {
        accessorKey: "lastUpdated",
        header: "Last Updated",
        meta: { className: "s-w-40" },
        cell: (info) => (
          <DataTable.CellContent>
            <span className="s-text-muted-foreground dark:s-text-muted-foreground-night">
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
        <div className="s-flex s-items-center s-gap-1.5 s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
          <button
            type="button"
            className="s-hover:underline s-cursor-pointer"
            onClick={onBack}
          >
            Connections
          </button>
          <span>/</span>
          <div className="s-flex s-items-center s-gap-1.5 s-font-medium s-text-foreground dark:s-text-foreground-night">
            <Logo className="s-h-4 s-w-4" />
            <span>{connection.name}</span>
          </div>
        </div>

        <div className="s-flex s-items-center s-justify-between">
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

        <DataTable
          data={folders}
          columns={folderColumns}
          className="s-w-full"
        />
      </Page>
      <ManageConnectionSheet
        connection={managingConn}
        open={!!managingConn}
        onClose={() => setManagingConn(null)}
        onUpdateDelegates={() => setManagingConn(null)}
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
        meta: { className: "s-w-full" },
        cell: (info) => {
          const row = info.row.original;
          return (
            <DataTable.CellContent>
              <div className="s-flex s-items-center s-gap-3">
                <div
                  className="s-flex s-h-6 s-w-6 s-shrink-0 s-items-center s-justify-center s-rounded-md s-text-white s-text-xs"
                  style={{ backgroundColor: row.color }}
                />
                <div className="s-flex s-min-w-0 s-flex-col">
                  <span className="s-text-sm s-font-semibold s-text-foreground dark:s-text-foreground-night">
                    {row.name}
                  </span>
                  <span className="s-truncate s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
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
        meta: { className: "s-w-28" },
        cell: (info) => (
          <DataTable.CellContent>
            <div className="s-flex s-items-center s-gap-1 s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
              <Users01 className="s-h-4 s-w-4" />
              <span>{info.getValue() as number}</span>
            </div>
          </DataTable.CellContent>
        ),
      },
      {
        accessorKey: "availability",
        header: "Availability",
        meta: { className: "s-w-32" },
        cell: (info) => (
          <DataTable.CellContent>
            <span className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
              {info.getValue() as string}
            </span>
          </DataTable.CellContent>
        ),
      },
      {
        accessorKey: "account",
        header: "Account",
        meta: { className: "s-w-40" },
        cell: (info) => (
          <DataTable.CellContent>
            <span className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
              {(info.getValue() as string | undefined) ?? ""}
            </span>
          </DataTable.CellContent>
        ),
      },
      {
        accessorKey: "byName",
        header: "By",
        meta: { className: "s-w-12" },
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
        meta: { className: "s-w-32" },
        cell: (info) => (
          <DataTable.CellContent>
            <span className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
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
      <div className="s-w-full">
        <SearchInput
          name="search-tools"
          placeholder="Search in Tools"
          value={search}
          onChange={setSearch}
        />
      </div>
      <div className="s-flex s-w-full s-items-center s-justify-between">
        <div className="s-flex s-items-center s-gap-2">
          <ShapesPlus className="s-h-4 s-w-4 s-text-foreground dark:s-text-foreground-night" />
          <span className="s-heading-base s-text-foreground dark:s-text-foreground-night">
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
            className="s-w-[420px]"
            dropdownHeaders={
              <div className="s-flex s-items-center s-gap-2 s-p-2 s-border-b s-border-border dark:s-border-border-night">
                <div className="s-flex-1">
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
                      ? "Only Super Admins and Business Admins can add MCP servers."
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
                  <div className="s-flex s-h-10 s-w-10 s-shrink-0 s-items-center s-justify-center s-overflow-hidden s-rounded-xl s-border s-border-border dark:s-border-border-night">
                    {tool.logo ? (
                      <tool.logo className="s-h-8 s-w-8" />
                    ) : (
                      <div
                        className="s-h-10 s-w-10 s-rounded-xl"
                        style={{ backgroundColor: tool.color ?? "#888" }}
                      />
                    )}
                  </div>
                }
              />
            ))}
            {filteredAddTools.length === 0 && (
              <div className="s-px-3 s-py-4 s-text-center s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
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
        meta: { className: "s-w-full" },
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
              <div className="s-flex s-items-center s-gap-3">
                <div className="s-flex s-h-6 s-w-6 s-shrink-0 s-items-center s-justify-center s-rounded-full s-border s-border-border dark:s-border-border-night s-bg-muted-background dark:s-bg-muted-background-night">
                  {ProviderLogo ? (
                    <ProviderLogo className="s-h-4 s-w-4" />
                  ) : (
                    <Globe01 className="s-h-3.5 s-w-3.5 s-text-muted-foreground dark:s-text-muted-foreground-night" />
                  )}
                </div>
                <div className="s-flex s-min-w-0 s-flex-col">
                  <span className="s-text-sm s-font-semibold s-text-foreground dark:s-text-foreground-night">
                    {row.name}
                  </span>
                  {row.description && (
                    <span className="s-truncate s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
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
        meta: { className: "s-w-24" },
        cell: (info) => (
          <DataTable.CellContent>
            <span className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
              {info.getValue() as string}
            </span>
          </DataTable.CellContent>
        ),
      },
      {
        accessorKey: "usedBy",
        header: "Used By",
        meta: { className: "s-w-24" },
        cell: (info) => (
          <DataTable.CellContent>
            <div className="s-flex s-items-center s-gap-1 s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
              <Users01 className="s-h-4 s-w-4" />
              <span>{info.getValue() as number}</span>
            </div>
          </DataTable.CellContent>
        ),
      },
      {
        accessorKey: "access",
        header: "Access",
        meta: { className: "s-w-32" },
        cell: (info) => (
          <DataTable.CellContent>
            <span className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
              {info.getValue() as string}
            </span>
          </DataTable.CellContent>
        ),
      },
      {
        accessorKey: "byName",
        header: "By",
        meta: { className: "s-w-12" },
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
        meta: { className: "s-w-32" },
        cell: (info) => (
          <DataTable.CellContent>
            <span className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
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
      <div className="s-w-full">
        <SearchInput
          name="search-triggers"
          placeholder="Search in Triggers"
          value={search}
          onChange={setSearch}
        />
      </div>
      <div className="s-flex s-w-full s-items-center s-justify-between">
        <div className="s-flex s-items-center s-gap-2">
          <Lightning01 className="s-h-4 s-w-4 s-text-foreground dark:s-text-foreground-night" />
          <span className="s-heading-base s-text-foreground dark:s-text-foreground-night">
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
      <div className="s-flex s-flex-col s-items-center s-justify-center s-py-24 s-text-center s-gap-5 s-max-w-sm s-mx-auto">
        <div className="s-rounded-full s-bg-muted-background dark:s-bg-muted-background-night s-p-5">
          <Lock01 className="s-h-8 s-w-8 s-text-muted-foreground dark:s-text-muted-foreground-night" />
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
      { id: "identity", label: "Identity & provisioning", icon: Fingerprint04 },
      { id: "capabilities", label: "Governance", icon: Toggle01Left },
      { id: "workspace", label: "Workspace Settings", icon: Tool01 },
      { id: "usage", label: "Usage", icon: PieChart01 },
      { id: "models", label: "Model Providers", icon: Server01 },
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
    "connections" | "tools" | "triggers"
  >("connections");
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(null);
  const [lockedItem, setLockedItem] = useState<{
    label: string;
    requiredRoles: string[];
  } | null>(null);
  const [members, setMembers] = useState<MemberRow[]>(INITIAL_MEMBERS);
  const [groups, setGroups] = useState<GroupRow[]>(GROUPS);
  const [governance, setGovernance] =
    useState<GovernanceSetting[]>(INITIAL_GOVERNANCE);
  const [connections, setConnections] = useState<ConnectionRow[]>([
    ...INITIAL_CONNECTIONS,
  ]);
  const [managingConn, setManagingConn] = useState<ConnectionRow | null>(null);

  const access = ROLE_ACCESS[role];
  const effectivePage = access.includes(activePage)
    ? activePage
    : (access[0] ?? "people");

  const sidebar = (
    <div className="s-flex s-h-full s-flex-col s-border-r s-border-border s-bg-app-background dark:s-border-border-night dark:s-bg-app-background-night">
      <NavTabPill
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as typeof activeTab);
          if (v === "spaces") setSpacesPage("connections");
        }}
        className="s-flex s-min-h-0 s-flex-1 s-flex-col"
      >
        <NavTabPillList className="s-px-3 s-pt-3 s-pb-1">
          <NavTabPillTrigger value="chat" icon={IntersectDust}>
            Chat
          </NavTabPillTrigger>
          <NavTabPillTrigger value="spaces" icon={Planet}>
            Spaces
          </NavTabPillTrigger>
          <NavTabPillTrigger value="admin" icon={Settings01}>
            Admin
          </NavTabPillTrigger>
          <div className="s-flex s-flex-grow s-justify-end">
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
          className="data-[state=active]:s-flex s-min-h-0 s-flex-1 s-flex-col"
        >
          <SpacesSidebarNav
            role={role}
            onConnectionsClick={() => {
              setSpacesPage("connections");
              setSelectedConnectionId(null);
            }}
            onToolsClick={() => setSpacesPage("tools")}
            onTriggersClick={() => setSpacesPage("triggers")}
          />
        </NavTabPillContent>

        {/* Admin sidebar */}
        <NavTabPillContent
          value="admin"
          className="data-[state=active]:s-flex s-min-h-0 s-flex-1 s-flex-col"
        >
          <ScrollArea className="s-flex-1">
            <ScrollBar orientation="vertical" size="minimal" />
            <NavigationList className="s-px-2 s-py-2">
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
                        className={`ag-nav-item${!accessible ? " s-opacity-40" : ""}`}
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
          className="data-[state=active]:s-flex s-min-h-0 s-flex-1 s-flex-col"
        />
      </NavTabPill>

      {/* Bottom bar — matches Projects.tsx exactly */}
      <div className="s-flex s-h-14 s-items-center s-justify-between s-gap-2 s-border-t s-border-border s-pl-1 s-pr-2 dark:s-border-border-night">
        <Card
          size="xs"
          className="s-p-1"
          containerClassName="s-flex-1 s-min-w-0"
        >
          <div className="s-flex s-min-w-0 s-items-center s-gap-2 s-pr-1">
            <Avatar name="Thomas Schmidt" size="sm" isRounded />
            <div className="s-flex s-min-w-0 s-grow s-flex-col s-text-sm s-text-foreground dark:s-text-foreground-night">
              <span className="s-heading-sm s-min-w-0 s-overflow-hidden s-text-ellipsis s-whitespace-nowrap">
                Thomas Schmidt
              </span>
              <span className="-s-mt-0.5 s-min-w-0 s-overflow-hidden s-text-ellipsis s-whitespace-nowrap s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
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
    <ScrollArea className="s-h-full s-bg-background dark:s-bg-background-night">
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
          selectedConnectionId ? (
            <ConnectionDetailPage
              connectionId={selectedConnectionId}
              role={role}
              onBack={() => setSelectedConnectionId(null)}
            />
          ) : spacesPage === "connections" ? (
            <ConnectionsPage
              connections={connections}
              role={role}
              onManage={(conn) => setManagingConn(conn)}
              onOpenDetail={(conn) => setSelectedConnectionId(conn.name)}
            />
          ) : spacesPage === "tools" ? (
            <ToolsPage role={role} />
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
          />
        ) : effectivePage === "capabilities" ? (
          <GovernancePage
            role={role}
            settings={governance}
            setSettings={setGovernance}
            groups={groups}
            onNavigateToGroups={() => setActivePage("people" as AdminPage)}
          />
        ) : effectivePage === "identity" ? (
          <IdentityPage role={role} />
        ) : effectivePage === "analytics" ? (
          <AnalyticsPage />
        ) : effectivePage === "billing" ? (
          <BillingPage />
        ) : effectivePage === "usage" ? (
          <UsagePage role={role} members={members} setMembers={setMembers} />
        ) : effectivePage === "workspace" ? (
          <PlaceholderPage
            title="Workspace Settings"
            description="Configure your workspace preferences."
            icon={Tool01}
          />
        ) : effectivePage === "models" ? (
          <ModelProvidersPage />
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
          <div className="s-flex s-flex-col s-gap-3 s-px-5 s-py-4">
            <Page.P size="sm">
              You need to be{" "}
              <span className="s-font-semibold s-text-foreground dark:s-text-foreground-night">
                {lockedItem?.requiredRoles.join(" or ")}
              </span>{" "}
              to access this section.
            </Page.P>
            <Page.P variant="secondary" size="sm">
              Contact your Super Admin to get the required permissions.
            </Page.P>
          </div>
          <DialogFooter
            rightButtonProps={{
              label: "Got it",
              variant: "primary",
              onClick: () => setLockedItem(null),
            }}
          />
        </DialogContent>
      </Dialog>
      <div className="s-flex s-h-screen s-w-full s-bg-background dark:s-bg-background-night">
        <SidebarLayout
          ref={sidebarRef}
          sidebar={sidebar}
          content={content}
          defaultSidebarWidth={260}
          minSidebarWidth={220}
          maxSidebarWidth={340}
        />
      </div>
    </>
  );
}

export const storyName = "Admin Governance M1 + M2";
