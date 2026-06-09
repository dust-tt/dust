import {
  Avatar,
  BarChart01,
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  Card,
  IntersectDust,
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
  Fingerprint04,
  Folder,
  Globe01,
  Input,
  Key01,
  Label,
  ListGroup,
  ListItem,
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
  Tool01,
  Shield01,
  Package,
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
  SidebarLayout,
  type SidebarLayoutRef,
  Planet,
  SpaceOpen,
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

// --- Global animation styles --------------------------------------------------

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

  /* Chart line draw */
  .ag-chart-line {
    stroke-dasharray: 2000;
    stroke-dashoffset: 0;
    animation: ag-chart-draw 900ms var(--ease-out-cubic) both;
  }

  /* Reduced motion: disable everything */
  @media (prefers-reduced-motion: reduce) {
    .ag-page-in, .ag-fade-in, .ag-chip-in, .ag-section-in {
      animation: none;
    }
    .ag-btn-press { transition: none; }
    .ag-nav-item  { transition: none; }
    .ag-model-row { transition: none; }
    .ag-chart-line { animation: none; }
  }
`;

// --- Types --------------------------------------------------------------------

// M1: two roles with admin panel access
type Role = "admin" | "manager";

type AdminPage =
  | "people"
  | "analytics"
  // Infrastructure -- admin only
  | "identity"
  | "workspace"
  | "models"
  | "api_keys"
  | "programmatic"
  | "credentials"
  | "secrets"
  | "billing"
  | "usage";

type SpacesPage =
  | "list"
  | "connections"
  | "connection_detail"
  | "tools"
  | "triggers";

// Full member role set
type MemberRole = "admin" | "manager" | "builder" | "user";

interface MemberRow {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
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

interface UsageMemberRow {
  id: string;
  name: string;
  email: string;
  seat: "max" | "pro" | "free";
  period: "annual" | "monthly" | null;
  usage: number;
  limit: number | null;
  onClick?: () => void;
}

// --- Data ---------------------------------------------------------------------

const INITIAL_MEMBERS: MemberRow[] = [
  {
    id: "m1",
    name: "Olivia Rhye",
    email: "olivia@acme.com",
    role: "admin",
    status: "active_provisioned",
    groupCount: 1,
    groupIds: ["g1"],
    visual: "https://i.pravatar.cc/150?img=47",
  },
  {
    id: "m2",
    name: "Phoenix Baker",
    email: "phoenix@acme.com",
    role: "manager",
    status: "active",
    groupCount: 1,
    groupIds: ["g2"],
    visual: "https://i.pravatar.cc/150?img=12",
  },
  {
    id: "m3",
    name: "Lana Steiner",
    email: "lana@acme.com",
    role: "manager",
    status: "active",
    groupCount: 3,
    groupIds: ["g1", "g2", "g3"],
    visual: "https://i.pravatar.cc/150?img=32",
  },
  {
    id: "m4",
    name: "Demi Wilkinson",
    email: "demi@acme.com",
    role: "user",
    status: "active",
    groupCount: 1,
    groupIds: ["g4"],
    visual: "https://i.pravatar.cc/150?img=23",
  },
  {
    id: "m5",
    name: "Candice Wu",
    email: "candice@acme.com",
    role: "builder",
    status: "active_provisioned",
    groupCount: 2,
    groupIds: ["g3", "g4"],
    visual: "https://i.pravatar.cc/150?img=44",
  },
  {
    id: "m6",
    name: "Natali Craig",
    email: "natali@acme.com",
    role: "user",
    status: "invited",
    groupCount: 0,
    groupIds: [],
    visual: "https://i.pravatar.cc/150?img=15",
  },
  {
    id: "m7",
    name: "Drew Cano",
    email: "drew@acme.com",
    role: "user",
    status: "auto_joined",
    groupCount: 1,
    groupIds: ["g4"],
    visual: "https://i.pravatar.cc/150?img=8",
  },
  {
    id: "m8",
    name: "Orlando Diggs",
    email: "orlando@acme.com",
    role: "manager",
    status: "active",
    groupCount: 2,
    groupIds: ["g1", "g3"],
    visual: "https://i.pravatar.cc/150?img=18",
  },
  {
    id: "m9",
    name: "Sia Fuentes",
    email: "sia@acme.com",
    role: "user",
    status: "active",
    groupCount: 1,
    groupIds: ["g2"],
    visual: "https://i.pravatar.cc/150?img=39",
  },
  {
    id: "m10",
    name: "Koray Okumus",
    email: "koray@acme.com",
    role: "builder",
    status: "active",
    groupCount: 0,
    groupIds: [],
    visual: "https://i.pravatar.cc/150?img=58",
  },
  {
    id: "m11",
    name: "Amelie Laurent",
    email: "amelie@acme.com",
    role: "user",
    status: "active_provisioned",
    groupCount: 1,
    groupIds: ["g2"],
    visual: "https://i.pravatar.cc/150?img=41",
  },
  {
    id: "m12",
    name: "Ryan Hartmann",
    email: "ryan@acme.com",
    role: "user",
    status: "active",
    groupCount: 1,
    groupIds: ["g4"],
    visual: "https://i.pravatar.cc/150?img=6",
  },
  {
    id: "m13",
    name: "Sofia Christopoulos",
    email: "sofia@acme.com",
    role: "user",
    status: "invited",
    groupCount: 0,
    groupIds: [],
    visual: "https://i.pravatar.cc/150?img=49",
  },
  {
    id: "m14",
    name: "Marcus Webb",
    email: "marcus@acme.com",
    role: "user",
    status: "active",
    groupCount: 2,
    groupIds: ["g1", "g4"],
    visual: "https://i.pravatar.cc/150?img=3",
  },
  {
    id: "m15",
    name: "Yuki Tanaka",
    email: "yuki@acme.com",
    role: "builder",
    status: "auto_joined",
    groupCount: 1,
    groupIds: ["g3"],
    visual: "https://i.pravatar.cc/150?img=57",
  },
];

const GROUPS: GroupRow[] = [
  { id: "g1", name: "Design Team", memberCount: 16, type: "provisioned" },
  { id: "g2", name: "Engineering Team", memberCount: 16, type: "provisioned" },
  { id: "g3", name: "Business Admins", memberCount: 16, type: "provisioned" },
  { id: "g4", name: "Marketing", memberCount: 16, type: "manual" },
];

const DOMAINS: DomainRow[] = [
  { id: "d1", domain: "@dust.us", status: "verified" },
  { id: "d2", domain: "@dust.com", status: "pending" },
  { id: "d3", domain: "@dust.tt", status: "failed" },
];

const USAGE_MEMBERS: UsageMemberRow[] = [
  {
    id: "m1",
    name: "Olivia Rhye",
    email: "olivia@acme.com",
    seat: "max",
    period: "annual",
    usage: 8237,
    limit: null,
  },
  {
    id: "m2",
    name: "Phoenix Baker",
    email: "phoenix@acme.com",
    seat: "max",
    period: "monthly",
    usage: 6739,
    limit: 10000,
  },
  {
    id: "m3",
    name: "Lana Steiner",
    email: "lana@acme.com",
    seat: "max",
    period: "monthly",
    usage: 0,
    limit: 1000,
  },
  {
    id: "m4",
    name: "Demi Wilkinson",
    email: "demi@acme.com",
    seat: "max",
    period: "monthly",
    usage: 1254,
    limit: null,
  },
  {
    id: "m5",
    name: "Candice Wu",
    email: "candice@acme.com",
    seat: "pro",
    period: "monthly",
    usage: 300,
    limit: 1000,
  },
  {
    id: "m6",
    name: "Natali Craig",
    email: "natali@acme.com",
    seat: "pro",
    period: "annual",
    usage: 2739,
    limit: 4000,
  },
  {
    id: "m7",
    name: "Drew Cano",
    email: "drew@acme.com",
    seat: "free",
    period: null,
    usage: 15739,
    limit: null,
  },
];

// Role labels for the admin panel role switcher
const ROLE_LABELS: Record<Role, string> = {
  admin: "Super Admin",
  manager: "Business Admin",
};

// M1 access model (per permission matrix):
// Super Admin: full access to everything
// Business Admin: people, analytics, usage — connectors only if delegated by Super Admin
const ROLE_ACCESS: Record<Role, AdminPage[]> = {
  admin: [
    "people",
    "analytics",
    "identity",
    "workspace",
    "models",
    "api_keys",
    "programmatic",
    "credentials",
    "secrets",
    "billing",
    "usage",
  ],
  manager: ["people", "analytics", "usage"],
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
  admin: { label: "Super Admin", color: "green" },
  manager: { label: "Business Admin", color: "warning" },
  builder: { label: "Builder", color: "primary" },
  user: { label: "Member", color: "blue" },
};

const ROLE_DESCRIPTIONS: Record<MemberRole, string> = {
  admin:
    "Full access: SSO/identity setup, billing, connectors, sensitive governance & infra settings, members & roles, groups, spaces, and workspace analytics.",
  manager:
    "Can manage members & roles, groups, and see workspace analytics. Can manage connectors only if granted by a Super Admin.",
  builder:
    "Can create and publish agents and skills. No admin access. (Deprecated in M2)",
  user: "Default role for most users. Can use agents in the workspace.",
};

const DOMAIN_STATUS_COLOR: Record<
  DomainRow["status"],
  "green" | "warning" | "rose"
> = {
  verified: "green",
  pending: "warning",
  failed: "rose",
};

// --- Member picker sheet ------------------------------------------------------

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
                    <div className="s-flex s-items-center s-gap-1">Name</div>
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
                        color={ROLE_DISPLAY[m.role].color}
                        label={ROLE_DISPLAY[m.role].label}
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

// --- People Page --------------------------------------------------------------

function PeoplePage({
  role,
  members,
  setMembers,
  groups,
  setGroups,
}: {
  role: Role;
  members: MemberRow[];
  setMembers: (m: MemberRow[]) => void;
  groups: GroupRow[];
  setGroups: (g: GroupRow[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmails, setInviteEmails] = useState("");
  const [inviteRole, setInviteRole] = useState("Business Admin");
  const [selectedGroup, setSelectedGroup] = useState<GroupRow | null>(null);
  const [selectedMember, setSelectedMember] = useState<MemberRow | null>(null);
  const [memberPlan, setMemberPlan] = useState<MemberRole>("user");
  const [confirmAdmin, setConfirmAdmin] = useState(false);
  const canEdit = role === "admin" || role === "manager";

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
                {count > 0 ? `${count} group${count > 1 ? "s" : ""}` : "-"}
              </span>
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
        .map((m) => {
          // Managers cannot edit admin members
          const canEditThisMember =
            canEdit && !(role === "manager" && m.role === "admin");
          return {
            ...m,
            onClick: canEditThisMember
              ? () => {
                  setSelectedMember(m);
                  setMemberPlan(m.role);
                }
              : undefined,
          };
        }),
    [search, members, canEdit, role]
  );

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
        ? "admin"
        : inviteRole === "Business Admin"
          ? "manager"
          : inviteRole === "Builder"
            ? "builder"
            : "user";
    const newMembers: MemberRow[] = emails.map((email, i) => ({
      id: `invited-${Date.now()}-${i}`,
      name: email.split("@")[0],
      email,
      role: invitedRole,
      status: "invited" as const,
      groupCount: 0,
      groupIds: [],
    }));
    setMembers([...members, ...newMembers]);
    setInviteEmails("");
    setInviteOpen(false);
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
              <Button variant="outline" size="xs" label="Any role" isSelect />
            </div>
          </div>
          <DataTable data={filteredMembers} columns={memberColumns} />
        </Page.Vertical>
      </div>

      {/* Invite members sheet */}
      <Sheet open={inviteOpen} onOpenChange={setInviteOpen}>
        <SheetContent side="right" size="lg">
          <SheetHeader>
            <SheetTitle>Invite new users</SheetTitle>
          </SheetHeader>
          <div className="s-flex s-flex-col s-gap-4 s-flex-1 s-overflow-auto s-px-6 s-py-4">
            <Page.Vertical gap="xs">
              <Label>Email addresses (comma or newline separated):</Label>
              <div className="s-w-full">
                <TextArea
                  placeholder="Email addresses, comma or newline separated"
                  value={inviteEmails}
                  onChange={(e) => setInviteEmails(e.target.value)}
                  minRows={4}
                />
              </div>
            </Page.Vertical>
            <Page.Vertical gap="xs">
              <Label>Role</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    label={inviteRole}
                    isSelect
                    size="sm"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {(
                    [
                      "Super Admin",
                      "Business Admin",
                      "Builder",
                      "Member",
                    ] as const
                  )
                    .filter((r) => !(role === "manager" && r === "Super Admin"))
                    .map((r) => (
                      <DropdownMenuItem
                        key={r}
                        label={r}
                        onClick={() => setInviteRole(r)}
                      />
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Page.P variant="secondary" size="sm">
                {inviteRole === "Super Admin"
                  ? ROLE_DESCRIPTIONS.admin
                  : inviteRole === "Business Admin"
                    ? ROLE_DESCRIPTIONS.manager
                    : inviteRole === "Builder"
                      ? ROLE_DESCRIPTIONS.builder
                      : ROLE_DESCRIPTIONS.user}
              </Page.P>
            </Page.Vertical>
          </div>
          <SheetFooter
            leftButtonProps={{
              label: "Cancel",
              onClick: () => setInviteOpen(false),
              variant: "outline",
            }}
            rightButtonProps={{
              label: "Send invite",
              onClick: handleInvite,
              variant: "primary",
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

      {/* Admin role confirmation dialog */}
      <Dialog
        open={confirmAdmin}
        onOpenChange={(open) => {
          if (!open) setConfirmAdmin(false);
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Assign Super Admin role?</DialogTitle>
          </DialogHeader>
          <div className="s-px-5 s-py-2">
            <Page.P variant="secondary" size="sm">
              Super Admin grants full access to all workspace settings including
              SSO/identity, billing, sensitive governance & infra settings. This
              is a highly sensitive action — are you sure?
            </Page.P>
          </div>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => setConfirmAdmin(false),
            }}
            rightButtonProps={{
              label: "Grant Super Admin",
              variant: "warning",
              onClick: () => {
                setMemberPlan("admin");
                setConfirmAdmin(false);
              },
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Member detail sheet */}
      {selectedMember && (
        <Sheet
          open={!!selectedMember}
          onOpenChange={() => setSelectedMember(null)}
        >
          <SheetContent side="right" size="lg">
            <SheetHeader>
              <SheetTitle>Member</SheetTitle>
            </SheetHeader>
            <div className="s-flex s-flex-col s-gap-6 s-flex-1 s-overflow-auto s-px-6 s-py-4">
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
                    {(["admin", "manager", "builder", "user"] as MemberRole[])
                      .filter((p) => !(role === "manager" && p === "admin"))
                      .map((p) => (
                        <DropdownMenuItem
                          key={p}
                          label={ROLE_DISPLAY[p].label}
                          onClick={() =>
                            p === "admin"
                              ? setConfirmAdmin(true)
                              : setMemberPlan(p)
                          }
                        />
                      ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Page.P variant="secondary" size="sm">
                  {ROLE_DESCRIPTIONS[memberPlan]}
                </Page.P>
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
            <SheetFooter
              leftButtonProps={{
                label: "Cancel",
                onClick: () => setSelectedMember(null),
                variant: "outline",
              }}
              rightButtonProps={{
                label: "Update role",
                variant: "primary",
                onClick: () => {
                  setMembers(
                    members.map((m) =>
                      m.id === selectedMember.id
                        ? { ...m, role: memberPlan }
                        : m
                    )
                  );
                  setSelectedMember(null);
                },
              }}
            />
          </SheetContent>
        </Sheet>
      )}
    </Page>
  );
}

// --- Identity & Provisioning Page ---------------------------------------------

function IdentityPage({ role }: { role: Role }) {
  const canEdit = role === "admin";

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
        <div className="s-flex s-flex-col s-items-start s-rounded-xl s-border s-border-border dark:s-border-border-night s-divide-y s-divide-border dark:s-divide-border-night">
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
    </Page>
  );
}

// --- Billing Page -------------------------------------------------------------

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
            seats: "12 seats assigned, 1 available",
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
              <Page.P size="sm">.... .... .... 1234</Page.P>
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

// --- Usage Page ---------------------------------------------------------------

function UsagePage() {
  const seatColors: Record<UsageMemberRow["seat"], string> = {
    max: "s-text-amber-500",
    pro: "s-text-blue-500",
    free: "s-text-slate-400",
  };

  const usageColumns = useMemo<ColumnDef<UsageMemberRow>[]>(
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
        meta: { className: "s-w-24" },
        cell: (info) => {
          const seat = info.getValue() as UsageMemberRow["seat"];
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
        accessorKey: "period",
        header: "Period",
        meta: { className: "s-w-28" },
        cell: (info) => {
          const period = info.getValue() as UsageMemberRow["period"];
          return (
            <DataTable.BasicCellContent
              label={
                period ? period.charAt(0).toUpperCase() + period.slice(1) : "-"
              }
            />
          );
        },
      },
      {
        accessorKey: "usage",
        header: "Credit usage",
        meta: { className: "s-w-48" },
        cell: (info) => {
          const row = info.row.original;
          const pct = row.limit
            ? Math.min(100, (row.usage / row.limit) * 100)
            : 0;
          return (
            <DataTable.CellContent>
              <div className="s-flex s-items-center s-gap-2">
                <span className="s-text-sm s-text-foreground dark:s-text-foreground-night s-w-14">
                  {row.usage.toLocaleString()}
                </span>
                {row.limit ? (
                  <div className="s-flex s-flex-1 s-items-center s-gap-1">
                    <div className="s-h-1.5 s-flex-1 s-rounded-full s-bg-muted-background dark:s-bg-muted-background-night">
                      <div
                        className="s-h-full s-rounded-full s-bg-primary-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night s-w-14 s-text-right">
                      {row.limit.toLocaleString()}
                    </span>
                  </div>
                ) : (
                  <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                    inf
                  </span>
                )}
              </div>
            </DataTable.CellContent>
          );
        },
      },
    ],
    []
  );

  return (
    <Page>
      <Page.Header
        title="Usage"
        description="Manage the usage of your Dust workspace."
        icon={BarChart01}
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
          }}
        />
        <DataTable data={USAGE_MEMBERS} columns={usageColumns} />
      </Page.Vertical>
    </Page>
  );
}

// --- Placeholder Page ---------------------------------------------------------

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

// --- Analytics Page -----------------------------------------------------------

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
      icon: "X",
      messages: "18,601",
      users: 26,
      model: "Claude 4.5 Sonnet",
    },
    {
      name: "CompanyTaxonomy",
      icon: "T",
      messages: "12,465",
      users: 24,
      model: "GPT-5 Mini",
    },
    {
      name: "dust-task",
      icon: "D",
      messages: "8,765",
      users: 21,
      model: "Claude 4.5 Sonnet",
    },
    {
      name: "deep-dive",
      icon: "S",
      messages: "6,743",
      users: 13,
      model: "GPT 5.2",
    },
    {
      name: "Sidekick",
      icon: "K",
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
                User
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
                Agent
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

// --- Model Providers Page -----------------------------------------------------

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
    logo: "8x",
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

// --- Nav spec -----------------------------------------------------------------

interface NavSpec {
  id: AdminPage;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

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

// ─── Spaces sidebar nav ───────────────────────────────────────────────────────

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
          {role === "admin" &&
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
  role,
  managers,
}: {
  connection: ConnectionRow | null;
  open: boolean;
  onClose: () => void;
  onUpdateDelegates: (name: string, delegates: string[]) => void;
  role: Role;
  managers: MemberRow[];
}) {
  const managerMembers = managers.filter((m) => m.role === "manager");
  const [selectedIds, setSelectedIds] = useState<string[]>(
    managerMembers
      .filter((m) => connection?.delegates.includes(m.name))
      .map((m) => m.id)
  );
  const [delegateSearch, setDelegateSearch] = useState("");

  const filteredManagers = managerMembers.filter(
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
      const names = managerMembers
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

          {/* Delegate management — inline list, admin only */}
          {role === "admin" && (
            <Page.Vertical gap="sm">
              <Page.SectionHeader
                title="Delegate to Business Admins"
                description="Business Admins selected here can edit this connection's settings and select which data is synced."
              />
              <SearchInput
                name="delegate-search"
                placeholder="Search by name or email"
                value={delegateSearch}
                onChange={setDelegateSearch}
                className="s-w-full"
              />
              {filteredManagers.length === 0 ? (
                <p className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night s-py-2">
                  No business admins found
                </p>
              ) : (
                <ListGroup className="s-w-full">
                  {filteredManagers.map((m, i) => (
                    <ListItem
                      key={m.id}
                      onClick={() => toggle(m.id)}
                      hasSeparator={i < filteredManagers.length - 1}
                      itemsAlignment="center"
                    >
                      <Checkbox
                        checked={selectedIds.includes(m.id)}
                        onCheckedChange={() => toggle(m.id)}
                      />
                      <Avatar
                        size="sm"
                        name={m.name}
                        visual={m.visual}
                        isRounded
                      />
                      <div className="s-flex s-flex-col s-flex-1 s-min-w-0">
                        <span className="s-text-sm s-font-semibold s-text-foreground dark:s-text-foreground-night">
                          {m.name}
                        </span>
                        <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
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

// Connections the manager currently has access to (simulates delegation)
const MANAGER_ACCESSIBLE = new Set(["Notion", "Slack", "Google Drive"]);

function ConnectionsPage({
  connections,
  onManage,
  onOpenDetail,
  role,
  managers,
}: {
  connections: ConnectionRow[];
  onManage: (conn: ConnectionRow) => void;
  onOpenDetail: (conn: ConnectionRow) => void;
  role: Role;
  managers: MemberRow[];
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
  const [configureDelegateIds, setConfigureDelegateIds] = useState<string[]>(
    []
  );
  const [configureDelegateSearch, setConfigureDelegateSearch] = useState("");

  const isAccessible = (conn: ConnectionRow) =>
    role === "admin" || MANAGER_ACCESSIBLE.has(conn.name);

  const columns = useMemo<ColumnDef<ConnectionRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        meta: { className: "s-w-full" },
        cell: (info) => {
          const row = info.row.original;
          const Logo = row.logo;
          const accessible =
            role === "admin" || MANAGER_ACCESSIBLE.has(row.name);
          return (
            <DataTable.CellContent>
              <div
                className={`s-flex s-items-center s-gap-3${!accessible ? " s-opacity-40" : ""}`}
              >
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
          const row = info.row.original;
          const accessible =
            role === "admin" || MANAGER_ACCESSIBLE.has(row.name);
          return (
            <DataTable.CellContent>
              <div
                className={`s-flex s-items-center s-gap-1 s-text-muted-foreground dark:s-text-muted-foreground-night${!accessible ? " s-opacity-40" : ""}`}
              >
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
          const row = info.row.original;
          const accessible =
            role === "admin" || MANAGER_ACCESSIBLE.has(row.name);
          return (
            <DataTable.CellContent>
              <div className={!accessible ? "s-opacity-40" : ""}>
                <Avatar name={info.getValue() as string} size="xs" isRounded />
              </div>
            </DataTable.CellContent>
          );
        },
      },
      {
        accessorKey: "lastSync",
        header: "Last Sync",
        meta: { className: "s-w-32" },
        cell: (info) => {
          const row = info.row.original;
          const accessible =
            role === "admin" || MANAGER_ACCESSIBLE.has(row.name);
          return (
            <DataTable.CellContent>
              <span
                className={`s-text-muted-foreground dark:s-text-muted-foreground-night s-whitespace-nowrap${!accessible ? " s-opacity-40" : ""}`}
              >
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
          const accessible = isAccessible(row);
          const requested = requestedIds.includes(row.name);
          if (role === "admin" || (role === "manager" && accessible)) {
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
                ) : role === "admin" ? (
                  <Button
                    variant="primary"
                    size="xs"
                    label="Configure"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfigureTarget(row);
                      setConfigureDelegateIds([]);
                      setConfigureDelegateSearch("");
                    }}
                  />
                ) : null}
              </DataTable.CellContent>
            );
          }
          if (!accessible) {
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
          }
          return <DataTable.CellContent />;
        },
      },
    ],
    [role, onManage, requestedIds, setConfigureTarget]
  );

  const rows = connections
    .filter(
      (c) => !search || c.name.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => (a.configured === b.configured ? 0 : a.configured ? -1 : 1))
    .map((c) => ({
      ...c,
      onClick: isAccessible(c) ? () => onOpenDetail(c) : undefined,
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
          if (!open) {
            setConfigureTarget(null);
            setConfigureDelegateIds([]);
            setConfigureDelegateSearch("");
          }
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

            {/* Option A — configure yourself */}
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

            {/* Option B — delegate to a manager */}
            <div className="s-flex s-flex-col s-gap-3">
              <div className="s-flex s-flex-col s-gap-1">
                <span className="s-text-sm s-font-semibold s-text-foreground dark:s-text-foreground-night">
                  Delegate to a Business Admin
                </span>
                <Page.P variant="secondary" size="sm">
                  Assign a Business Admin to configure and maintain this
                  connection.
                </Page.P>
              </div>
              <SearchInput
                name="configure-delegate-search"
                placeholder="Search by name or email"
                value={configureDelegateSearch}
                onChange={setConfigureDelegateSearch}
              />
              {(() => {
                const filtered = managers
                  .filter((m) => m.role === "manager")
                  .filter(
                    (m) =>
                      !configureDelegateSearch ||
                      m.name
                        .toLowerCase()
                        .includes(configureDelegateSearch.toLowerCase()) ||
                      m.email
                        .toLowerCase()
                        .includes(configureDelegateSearch.toLowerCase())
                  );
                return filtered.length === 0 ? (
                  <p className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night s-py-2">
                    No business admins found
                  </p>
                ) : (
                  <ListGroup className="s-w-full">
                    {filtered.map((m, i) => (
                      <ListItem
                        key={m.id}
                        onClick={() =>
                          setConfigureDelegateIds((prev) =>
                            prev.includes(m.id)
                              ? prev.filter((x) => x !== m.id)
                              : [...prev, m.id]
                          )
                        }
                        hasSeparator={i < filtered.length - 1}
                        itemsAlignment="center"
                      >
                        <Checkbox
                          checked={configureDelegateIds.includes(m.id)}
                          onCheckedChange={() =>
                            setConfigureDelegateIds((prev) =>
                              prev.includes(m.id)
                                ? prev.filter((x) => x !== m.id)
                                : [...prev, m.id]
                            )
                          }
                        />
                        <Avatar
                          size="sm"
                          name={m.name}
                          visual={m.visual}
                          isRounded
                        />
                        <div className="s-flex s-flex-1 s-min-w-0 s-flex-col">
                          <span className="s-text-sm s-font-semibold s-text-foreground dark:s-text-foreground-night">
                            {m.name}
                          </span>
                          <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
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
                );
              })()}
            </div>
          </div>
          <SheetFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => {
                setConfigureTarget(null);
                setConfigureDelegateIds([]);
                setConfigureDelegateSearch("");
              },
            }}
            rightButtonProps={{
              label: "Delegate",
              variant: "primary",
              disabled: configureDelegateIds.length === 0,
              onClick: () => {
                setConfigureTarget(null);
                setConfigureDelegateIds([]);
                setConfigureDelegateSearch("");
              },
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
  connection,
  onBack,
  onManage,
  role,
}: {
  connection: ConnectionRow;
  onBack: () => void;
  onManage: (conn: ConnectionRow) => void;
  role: Role;
}) {
  const Logo = connection.logo;
  const folders = (
    CONNECTION_FOLDERS[connection.name] ?? CONNECTION_FOLDERS.default
  ).map((f) => ({ ...f, onClick: () => {} }));

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
        {role === "admin" && (
          <Button
            variant="primary"
            size="sm"
            icon={Settings01}
            label={`Manage ${connection.name}`}
            onClick={() => onManage(connection)}
          />
        )}
      </div>

      <DataTable data={folders} columns={folderColumns} className="s-w-full" />
    </Page>
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
    id: "asana2",
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
    id: "ashby3",
    name: "Ashby 3",
    description: "Access and manage Ashby ATS data.",
    usedBy: 0,
    availability: "Workspace",
    account: "aubin 2",
    byAvatar: "https://i.pravatar.cc/150?img=14",
    byName: "Aubin",
    lastUpdated: "May, 2026",
    color: "#5B6BFF",
    initial: "A",
  },
  {
    id: "ashby-gina",
    name: "Ashby Gina Test",
    description: "Access and manage Ashby ATS data.",
    usedBy: 0,
    availability: "Workspace",
    account: "TALENT (for demo testing)",
    byAvatar: "https://i.pravatar.cc/150?img=47",
    byName: "Gina",
    lastUpdated: "Mar, 2026",
    color: "#5B6BFF",
    initial: "A",
  },
  {
    id: "attio",
    name: "Attio",
    description:
      "Attio is the CRM for modern go-to-market teams. It has a highly flexible data model and is built on allowing you to build your CRM exactly to your business model...",
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
  {
    id: "bsr-fathom",
    name: "Bsr Fathom 2",
    description:
      "Access Fathom meeting recordings, transcripts, summaries, and action items.",
    usedBy: 1,
    availability: "Workspace",
    account: "Personal",
    byAvatar: "https://i.pravatar.cc/150?img=3",
    byName: "Alex",
    lastUpdated: "Mar, 2026",
    color: "#00B4D8",
    initial: "▶",
  },
  {
    id: "cakewalk",
    name: "Cakewalk",
    description: "Cakewalk Access Controls",
    usedBy: 1,
    availability: "Workspace",
    account: "z",
    byAvatar: "https://i.pravatar.cc/150?img=3",
    byName: "Alex",
    lastUpdated: "Jun, 2026",
    color: "#6B7280",
    initial: "⊞",
  },
  {
    id: "canva",
    name: "Canva MCP Server",
    description: "Call a tool to answer a question.",
    usedBy: 0,
    availability: "Workspace",
    account: "Personal",
    byAvatar: "https://i.pravatar.cc/150?img=3",
    byName: "Alex",
    lastUpdated: "Jun, 2026",
    color: "#7D2AE8",
    initial: "C",
  },
  {
    id: "cc-enrich",
    name: "Cc Enrich Linked In Profile",
    description: "Call a tool to answer a question.",
    usedBy: 0,
    availability: "Workspace",
    byAvatar: "https://i.pravatar.cc/150?img=3",
    byName: "Alex",
    lastUpdated: "Jun, 2026",
    color: "#0A66C2",
    initial: "↓",
  },
  {
    id: "cc-email",
    name: "Cc Find Email",
    description: "Call a tool to answer a question.",
    usedBy: 0,
    availability: "Workspace",
    byAvatar: "https://i.pravatar.cc/150?img=3",
    byName: "Alex",
    lastUpdated: "Jun, 2026",
    color: "#0984E3",
    initial: "⊞",
  },
  {
    id: "cc-companies",
    name: "Cc Find Lookalike Companies",
    description: "Call a tool to answer a question.",
    usedBy: 0,
    availability: "Workspace",
    byAvatar: "https://i.pravatar.cc/150?img=3",
    byName: "Alex",
    lastUpdated: "Jun, 2026",
    color: "#0984E3",
    initial: "★",
  },
  {
    id: "cc-phone",
    name: "Cc Find Phone",
    description: "Call a tool to answer a question.",
    usedBy: 0,
    availability: "Workspace",
    byAvatar: "https://i.pravatar.cc/150?img=3",
    byName: "Alex",
    lastUpdated: "Jun, 2026",
    color: "#0984E3",
    initial: "✆",
  },
];

const ADD_TOOLS_LIST: {
  name: string;
  logo: React.ComponentType<{ className?: string }> | null;
  color?: string;
}[] = [
  { name: "Amplitude", logo: AmplitudeLogo },
  { name: "Amplitude Europe", logo: AmplitudeLogo },
  { name: "Apify", logo: null, color: "#FF6B35" },
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
                  disabled={role === "manager"}
                  tooltip={
                    role === "manager"
                      ? "Only Super Admins can add MCP servers."
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
    id: "jiratest2",
    name: "JiraTest2",
    provider: "Custom",
    usedBy: 0,
    access: "Workspace",
    byAvatar: "https://i.pravatar.cc/150?img=3",
    byName: "Alex",
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
    id: "freshservice2",
    name: "Freshservice2",
    provider: "Custom",
    usedBy: 0,
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
    id: "dust-modjo",
    name: "DUST MODJO",
    provider: "Custom",
    usedBy: 0,
    access: "Workspace",
    byAvatar: "https://i.pravatar.cc/150?img=33",
    byName: "Alban",
    lastUpdated: "Oct, 2025",
  },
  {
    id: "okal-test",
    name: "Okal Test A",
    provider: "Custom",
    usedBy: 1,
    access: "Okal's Private Space",
    byAvatar: "https://i.pravatar.cc/150?img=9",
    byName: "Okal",
    lastUpdated: "Oct, 2025",
  },
  {
    id: "gong",
    name: "Gong",
    provider: "Custom",
    usedBy: 0,
    access: "Workspace",
    byAvatar: "https://i.pravatar.cc/150?img=3",
    byName: "Alex",
    lastUpdated: "Oct, 2025",
  },
  {
    id: "frank-github",
    name: "Frank_GithubTest",
    provider: "Custom",
    usedBy: 0,
    access: "Workspace",
    byAvatar: "https://i.pravatar.cc/150?img=3",
    byName: "Alex",
    lastUpdated: "Oct, 2025",
  },
  {
    id: "verity-webhook",
    name: "@Verity's Webhook",
    provider: "Custom",
    usedBy: 0,
    access: "Workspace",
    byAvatar: "https://i.pravatar.cc/150?img=3",
    byName: "Alex",
    lastUpdated: "Oct, 2025",
  },
  {
    id: "iliassistant-webhook",
    name: "@iliassistant's Webhook",
    provider: "Custom",
    usedBy: 0,
    access: "Workspace",
    byAvatar: "https://i.pravatar.cc/150?img=3",
    byName: "Alex",
    lastUpdated: "Oct, 2025",
  },
  {
    id: "source-mail",
    name: "Source mail",
    provider: "Custom",
    usedBy: 0,
    access: "Workspace",
    byAvatar: "https://i.pravatar.cc/150?img=3",
    byName: "Alex",
    lastUpdated: "Nov, 2025",
  },
  {
    id: "github-tasks",
    name: "Github (dust-tt/tasks)",
    provider: "Github",
    usedBy: 0,
    access: "Workspace",
    byAvatar: "https://i.pravatar.cc/150?img=3",
    byName: "Alex",
    lastUpdated: "Oct, 2025",
  },
  {
    id: "junior",
    name: "@junior",
    provider: "Custom",
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
  {
    id: "github-adrien",
    name: "Github Adrien",
    provider: "Github",
    usedBy: 0,
    access: "Workspace",
    byAvatar: "https://i.pravatar.cc/150?img=14",
    byName: "Adrien",
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
              const isDisabled = source.adminOnly && role === "manager";
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

// M1 nav: mirrors the current admin panel structure exactly.
// "People & Security" is split into People (operator+) and Identity & SSO (admin only).
const NAV_SECTIONS: { title: string; items: NavSpec[] }[] = [
  {
    title: "Workspace",
    items: [
      { id: "people", label: "People", icon: Users01 },
      { id: "identity", label: "Identity & provisioning", icon: Fingerprint04 },
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
      { id: "credentials", label: "App Credentials", icon: Package },
      { id: "secrets", label: "Secrets", icon: Lock01 },
      { id: "programmatic", label: "Programmatic", icon: Code01 },
    ],
  },
];

// --- Main Story ---------------------------------------------------------------

export default function AdminGovernanceM1() {
  const sidebarRef = useRef<SidebarLayoutRef>(null);
  const [role, setRole] = useState<Role>("admin");
  const [activeTab, setActiveTab] = useState<"chat" | "spaces" | "admin">(
    "admin"
  );
  const [activePage, setActivePage] = useState<AdminPage>("people");
  const [lockedItem, setLockedItem] = useState<{ label: string } | null>(null);
  const [members, setMembers] = useState<MemberRow[]>(INITIAL_MEMBERS);
  const [groups, setGroups] = useState<GroupRow[]>(GROUPS);
  // Spaces / Connections state
  const [spacesPage, setSpacesPage] = useState<SpacesPage>("connections");
  const [connections, setConnections] = useState<ConnectionRow[]>([
    ...INITIAL_CONNECTIONS,
  ]);
  const [activeConnection, setActiveConnection] =
    useState<ConnectionRow | null>(null);
  const [managingConn, setManagingConn] = useState<ConnectionRow | null>(null);

  const managers = members.filter((m) => m.role === "manager");

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
            onConnectionsClick={() => setSpacesPage("connections")}
            onToolsClick={() => setSpacesPage("tools")}
            onTriggersClick={() => setSpacesPage("triggers")}
          />
        </NavTabPillContent>

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
                              setLockedItem({ label: item.label });
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

        <NavTabPillContent
          value="chat"
          className="data-[state=active]:s-flex s-min-h-0 s-flex-1 s-flex-col"
        />
      </NavTabPill>

      {/* Bottom bar */}
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

      {/* Spaces content */}
      {activeTab === "spaces" && (
        <div key={spacesPage} className="ag-page-in">
          {spacesPage === "connections" ? (
            <ConnectionsPage
              connections={connections}
              role={role}
              managers={members}
              onManage={(conn) => setManagingConn(conn)}
              onOpenDetail={(conn) => {
                setActiveConnection(conn);
                setSpacesPage("connection_detail");
              }}
            />
          ) : spacesPage === "connection_detail" && activeConnection ? (
            <ConnectionDetailPage
              connection={activeConnection}
              role={role}
              onBack={() => setSpacesPage("connections")}
              onManage={(conn) => setManagingConn(conn)}
            />
          ) : spacesPage === "tools" ? (
            <ToolsPage role={role} />
          ) : spacesPage === "triggers" ? (
            <TriggersPage role={role} />
          ) : (
            <Page>
              <Page.Header
                title="Spaces"
                description="Manage your workspace spaces."
                icon={SpaceOpen}
              />
              <div className="s-flex s-items-center s-justify-center s-rounded-xl s-border s-border-dashed s-border-border dark:s-border-border-night s-p-12">
                <Page.P variant="secondary">
                  Select a space from the sidebar
                </Page.P>
              </div>
            </Page>
          )}
        </div>
      )}
      {/* Admin content */}
      {activeTab === "admin" && (
        <div key={effectivePage} className="ag-page-in">
          {effectivePage === "people" ? (
            <PeoplePage
              role={role}
              members={members}
              setMembers={setMembers}
              groups={groups}
              setGroups={setGroups}
            />
          ) : effectivePage === "analytics" ? (
            <AnalyticsPage />
          ) : effectivePage === "identity" ? (
            <IdentityPage role={role} />
          ) : effectivePage === "billing" ? (
            <BillingPage />
          ) : effectivePage === "usage" ? (
            <UsagePage />
          ) : effectivePage === "workspace" ? (
            <PlaceholderPage
              title="Workspace Settings"
              description="Configure your workspace preferences."
              icon={Settings01}
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
      )}
    </ScrollArea>
  );

  return (
    <>
      <style>{ANIMATION_CSS}</style>
      <ManageConnectionSheet
        connection={managingConn}
        open={!!managingConn}
        onClose={() => setManagingConn(null)}
        role={role}
        managers={managers}
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
            <div className="s-flex s-items-start s-gap-3">
              <div className="s-rounded-full s-bg-muted-background dark:s-bg-muted-background-night s-p-3 s-shrink-0">
                <Lock01 className="s-h-5 s-w-5 s-text-muted-foreground dark:s-text-muted-foreground-night" />
              </div>
              <div className="s-flex s-flex-col s-gap-1">
                <Page.P size="sm">
                  This section requires the{" "}
                  <span className="s-font-semibold s-text-foreground dark:s-text-foreground-night">
                    Admin
                  </span>{" "}
                  role.
                </Page.P>
                <Page.P variant="secondary" size="sm">
                  Business Admins cannot access Infrastructure settings. Contact
                  your Admin to get access.
                </Page.P>
              </div>
            </div>
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

export const storyName = "Admin Governance M1 Only";
