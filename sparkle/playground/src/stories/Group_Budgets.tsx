import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  BarChart01,
  Button,
  Chip,
  Clock,
  CoinsStacked01,
  ContentMessage,
  CreditCard01,
  DataTable,
  Cube01,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  InfoCircle,
  Input,
  NavigationList,
  NavigationListItem,
  NavigationListLabel,
  Notification,
  Plus,
  ProgressBar,
  PuzzlePiece01,
  SearchInput,
  ShieldTick,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Terminal,
  Toggle01Left,
  Users01,
  useSendNotification,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";

// Credit rules per group, edited in one modal with two tabs (Figma 153:7731):
// - Limits: group budget, limit per member, and who else these members share
//   a group with.
// - Priority: the order of groups with a budget. Members in several of them
//   use the budget of the highest one. Every group can be moved; one Save
//   applies both tabs.
// The groups table itself is read-only (Figma 148:6110).

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

interface Group {
  id: string;
  name: string;
  members: string[];
  // Group budget in credits/month (shared by all members), or null.
  budget: number | null;
  // Limit per member in credits/month, or null.
  memberLimit: number | null;
  // Credits the group's members already spent this cycle.
  used: number;
  // Highest model tier the group's members can use, or "none" to inherit the
  // workspace setting.
  modelTier: ModelTier;
}

// Same options as front's group picker (getGroupModelTierOptions).
type ModelTier = "none" | "cost_efficient" | "balanced" | "premium" | "ultra";
const MODEL_TIER_OPTIONS: {
  value: ModelTier;
  label: string;
  description?: string;
}[] = [
  { value: "none", label: "Inherited from workspace" },
  { value: "cost_efficient", label: "Up to Basic" },
  { value: "balanced", label: "Up to Standard", description: "Includes Basic" },
  {
    value: "premium",
    label: "Up to Premium",
    description: "Includes Basic and Standard",
  },
  {
    value: "ultra",
    label: "Up to Ultra",
    description: "Includes Basic, Standard, and Premium",
  },
];

// Mock workspace: 25 groups, 100 users. Group counts per user:
// 60 users in 1 group, 25 in 2, 6 in 3, 3 in 4, 3 in 5, 2 in 6, 1 in 10
// (177 memberships). Assignment is seeded so it is stable across reloads.

const GROUP_NAMES = [
  "Engineering",
  "Product",
  "Design",
  "Sales",
  "Marketing",
  "Support",
  "Finance",
  "Legal",
  "People",
  "Operations",
  "Data",
  "Security",
  "Platform",
  "Mobile",
  "Growth",
  "Partnerships",
  "Customer Success",
  "Recruiting",
  "IT",
  "Research",
  "Leadership",
  "Paris office",
  "London office",
  "New York office",
  "Contractors",
];

// Group budgets (credits/month) and credits used this cycle. Groups listed
// here are ranked, in this order; the others have no budget.
const BUDGETS: Record<string, { budget: number; used: number }> = {
  Engineering: { budget: 100, used: 12 },
  Leadership: { budget: 200, used: 64 },
  Sales: { budget: 80, used: 71 },
  Product: { budget: 50, used: 18 },
  Contractors: { budget: 20, used: 16 },
};

const MODEL_TIERS_BY_GROUP: Record<string, string> = {
  Engineering: "ultra",
  Research: "premium",
  Contractors: "cost_efficient",
  Support: "balanced",
};

const FIRST_NAMES = [
  "Ana",
  "Bilal",
  "Chloé",
  "Dario",
  "Emma",
  "Farid",
  "Grace",
  "Hugo",
  "Inès",
  "Jules",
  "Kenji",
  "Lina",
  "Marco",
  "Nora",
  "Omar",
  "Paula",
  "Quentin",
  "Rosa",
  "Samir",
  "Tara",
];
const LAST_NAMES = [
  "Lopez",
  "Haddad",
  "Martin",
  "Rossi",
  "Weber",
  "Benali",
  "Kim",
  "Bernard",
  "Moreau",
  "Petit",
  "Sato",
  "Bianchi",
  "Svensson",
  "Diallo",
  "Costa",
  "Roux",
  "Jiménez",
  "Frenoy",
  "Rogahn",
  "Okafor",
];

const GROUPS_PER_USER: [count: number, users: number][] = [
  [1, 60],
  [2, 25],
  [3, 6],
  [4, 3],
  [5, 3],
  [6, 2],
  [10, 1],
];

function seededRandom(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function buildWorkspace(): Group[] {
  const rand = seededRandom(42);
  const members: string[][] = GROUP_NAMES.map(() => []);
  let userIndex = 0;
  for (const [count, users] of GROUPS_PER_USER) {
    for (let u = 0; u < users; u++, userIndex++) {
      const name = `${FIRST_NAMES[userIndex % 20]} ${LAST_NAMES[(userIndex * 7 + Math.floor(userIndex / 20)) % 20]}`;
      // Single-group users go round-robin so every group has members.
      const picked = new Set<number>(
        count === 1 ? [userIndex % GROUP_NAMES.length] : []
      );
      while (picked.size < count) {
        picked.add(Math.floor(rand() * GROUP_NAMES.length));
      }
      picked.forEach((g) => members[g].push(name));
    }
  }
  const groups = GROUP_NAMES.map((name, i) => ({
    id: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    members: members[i],
    budget: BUDGETS[name]?.budget ?? null,
    memberLimit: i % 4 === 3 ? null : 200,
    modelTier: (MODEL_TIERS_BY_GROUP[name] ?? "none") as ModelTier,
    used: BUDGETS[name]?.used ?? Math.round(rand() * 40),
  }));
  const ranked = Object.keys(BUDGETS).map((n) =>
    groups.find((g) => g.name === n)!
  );
  return [...ranked, ...groups.filter((g) => g.budget === null)];
}

const INITIAL_GROUPS: Group[] = buildWorkspace();

function sharedMembers(a: Group, b: Group) {
  return a.members.filter((m) => b.members.includes(m));
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

// Groups with a budget first (ranked, in this order), then the others.
function applyOrder(groups: Group[], rankedIds: string[]) {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const ranked = rankedIds
    .map((id) => byId.get(id)!)
    .filter((g) => g.budget !== null);
  return [...ranked, ...groups.filter((g) => !ranked.includes(g))];
}

// ---------------------------------------------------------------------------
// Story
// ---------------------------------------------------------------------------

export default function GroupBudgets() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-muted-background">
      <Notification.Area>
        <AdminNav />
        <main className="m-2 ml-0 min-w-0 flex-1 overflow-y-auto rounded-xl bg-background shadow-sm">
          <CreditsPage />
        </main>
      </Notification.Area>
    </div>
  );
}

function AdminNav() {
  return (
    <aside className="flex w-64 shrink-0 flex-col gap-2 overflow-y-auto px-2 py-3">
      <NavigationList>
        <NavigationListLabel label="Organization" />
        <NavigationListItem label="Members" icon={Users01} />
        <NavigationListItem label="Security" icon={ShieldTick} />
        <NavigationListItem label="Governance" icon={Toggle01Left} />
        <NavigationListLabel label="Spend" />
        <NavigationListItem label="Credits" icon={CoinsStacked01} selected />
        <NavigationListItem label="Billing" icon={CreditCard01} />
        <NavigationListItem label="Analytics" icon={BarChart01} />
        <NavigationListLabel label="Platform" />
        <NavigationListItem label="Models" icon={Cube01} />
        <NavigationListItem label="Integrations" icon={PuzzlePiece01} />
        <NavigationListItem label="Automations" icon={Clock} />
        <NavigationListItem label="Developers" icon={Terminal} />
      </NavigationList>
    </aside>
  );
}

interface SavePayload {
  budget: number | null;
  memberLimit: number | null;
  // Ids of the groups with a budget, highest priority first.
  rankedIds: string[];
}

function CreditsPage() {
  const sendNotification = useSendNotification();
  // Array order = budget priority (groups with a budget first).
  const [groups, setGroups] = useState<Group[]>(INITIAL_GROUPS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const editing = groups.find((g) => g.id === editingId) ?? null;

  const save = (groupId: string, payload: SavePayload) => {
    setGroups((gs) =>
      applyOrder(
        gs.map((g) =>
          g.id === groupId
            ? { ...g, budget: payload.budget, memberLimit: payload.memberLimit }
            : g
        ),
        payload.rankedIds
      )
    );
    setEditingId(null);
    sendNotification({
      type: "success",
      title: "Credit rules saved",
      description: `Your changes to ${groups.find((g) => g.id === groupId)!.name} have been saved.`,
    });
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-8 py-10">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h1 className="heading-2xl text-foreground">Credits</h1>
          <Button
            variant="highlight-ghost"
            size="sm"
            label="Breakdown in analytics"
            icon={ArrowUpRight}
          />
        </div>
        <div className="flex justify-end">
          <Button variant="outline" size="sm" label="Add credits" icon={Plus} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Remaining credits in the pool" value="964" />
        <StatCard label="Used this cycle" value="36" sub="Day 2/25" />
        <StatCard
          label="Programmatic usage this cycle"
          value="0"
          sub="0% of the usage"
        />
      </div>

      <div className="flex flex-col gap-4">
        <Tabs value="groups">
          <TabsList>
            <TabsTrigger value="members" label="Members" />
            <TabsTrigger value="groups" label="Groups" />
            <TabsTrigger value="topups" label="Top-ups history" />
            <TabsTrigger value="settings" label="Settings" />
          </TabsList>
        </Tabs>

        {/* Same pattern as the Members tab in front (UsageMembersSection). */}
        <SearchInput
          name="search"
          placeholder="Search groups"
          value={search}
          onChange={setSearch}
          className="w-full"
        />

        <p className="copy-sm text-muted-foreground">
          A group budget caps what a group's members spend together. A limit per
          member caps each member, unless they have a personal limit.
        </p>

        <GroupsTable
          groups={groups}
          search={search}
          onOpen={setEditingId}
          onModelTierChange={(groupId, modelTier) =>
            setGroups((gs) =>
              gs.map((g) => (g.id === groupId ? { ...g, modelTier } : g))
            )
          }
        />
      </div>

      <SpendRulesDialog
        group={editing}
        groups={groups}
        onClose={() => setEditingId(null)}
        onSave={save}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border p-4">
      <span className="copy-xs font-medium text-foreground">{label}</span>
      <span className="heading-lg text-foreground">{value}</span>
      {sub && <span className="copy-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Groups table: read-only
// ---------------------------------------------------------------------------

const formatCredits = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 1 });

// Same bar as the Members tab's "Pool usage" column in front
// (PoolCreditUsageBar in MembersUsageTable.tsx): used on the left, max on the
// right, muted fill, amber at the limit, red over it.
function GroupBudgetBar({ used, budget }: { used: number; budget: number }) {
  const isOver = used > budget;
  const isAt = budget > 0 && used === budget;
  const percentage =
    budget > 0 ? Math.min(100, (used / budget) * 100) : used > 0 ? 100 : 0;
  return (
    <div className="flex w-full flex-col gap-1">
      <div className="flex justify-between text-xs tabular-nums text-foreground">
        <span>{formatCredits(used)}</span>
        <span>{formatCredits(budget)}</span>
      </div>
      <div className="flex h-3 w-full items-center">
        <ProgressBar
          aria-label="Group budget usage"
          aria-valuenow={percentage}
          aria-valuetext={`${formatCredits(used)} of ${formatCredits(budget)} credits used`}
          className="h-1 w-full gap-px"
          variant="transparent"
          values={[
            {
              value: percentage,
              className: isOver
                ? "bg-red-500"
                : isAt
                  ? "bg-warning-500"
                  : "bg-muted-foreground",
            },
            { value: 100 - percentage, className: "bg-muted-background" },
          ]}
        />
      </div>
    </div>
  );
}

// Same menu as front's ModelTierPickerDropdown, with a ghost trigger.
function ModelTierPicker({
  value,
  onChange,
}: {
  value: ModelTier;
  onChange: (tier: ModelTier) => void;
}) {
  const selected = MODEL_TIER_OPTIONS.find((o) => o.value === value)!;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost-secondary"
          size="sm"
          isSelect
          label={selected.label}
          className="min-w-48 justify-between"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width)">
        {MODEL_TIER_OPTIONS.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            label={option.label}
            description={option.description}
            checked={value === option.value}
            onCheckedChange={(checked) => {
              if (checked) {
                onChange(option.value);
              }
            }}
            onSelect={(event) => event.preventDefault()}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GroupsTable({
  groups,
  search,
  onOpen,
  onModelTierChange,
}: {
  groups: Group[];
  search: string;
  onOpen: (id: string) => void;
  onModelTierChange: (groupId: string, modelTier: ModelTier) => void;
}) {
  const rankedCount = groups.filter((g) => g.budget !== null).length;
  // Ranks come from the full list, so filtering never renumbers groups.
  const rows = groups
    .map((g, i) => ({ g, rank: i < rankedCount ? i + 1 : null }))
    .filter(({ g }) =>
      g.name.toLowerCase().includes(search.trim().toLowerCase())
    );
  const th = "heading-xs whitespace-nowrap py-2 px-2 text-left text-foreground";
  return (
    <table className="w-full table-fixed">
      <thead>
        <tr className="border-b border-border">
          <th className={`${th} w-12`} aria-label="Order" />
          <th className={`${th} w-[19%]`}>Group</th>
          <th className={`${th} w-[25%]`}>Group budget</th>
          <th className={`${th} w-[11%]`}>Members</th>
          <th className={`${th} w-[15%]`}>Limit per member</th>
          <th className={th}>
            <span className="flex items-center gap-1">
              Models tier
              <InfoCircle className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td
              colSpan={6}
              className="copy-sm px-2 py-8 text-center text-muted-foreground"
            >
              No groups match "{search.trim()}".
            </td>
          </tr>
        )}
        {rows.map(({ g, rank }) => (
          <tr
            key={g.id}
            data-group-row={g.id}
            onClick={() => onOpen(g.id)}
            className="cursor-pointer border-b border-border hover:bg-muted-background"
          >
            <td className="copy-sm px-2 py-3 font-medium tabular-nums text-muted-foreground">
              {rank ?? ""}
            </td>
            <td className="px-2 py-3">
              <span className="copy-sm flex items-center gap-2 font-medium text-foreground">
                <Users01 className="h-4 w-4 shrink-0" />
                {g.name}
              </span>
            </td>
            <td className="copy-sm px-2 py-3 text-foreground">
              {g.budget === null ? (
                "-"
              ) : (
                <div className="w-full pr-10">
                  <GroupBudgetBar used={g.used} budget={g.budget} />
                </div>
              )}
            </td>
            <td className="copy-sm px-2 py-3 text-foreground">
              {g.members.length}
            </td>
            <td className="copy-sm px-2 py-3 text-foreground">
              {g.memberLimit === null ? "-" : `${g.memberLimit} credits`}
            </td>
            <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
              <ModelTierPicker
                value={g.modelTier}
                onChange={(tier) => onModelTierChange(g.id, tier)}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

const toDraft = (n: number | null) => (n === null ? "" : String(n));
const fromDraft = (s: string) => (s === "" ? null : Number(s));

function RuleField({
  label,
  placeholder,
  value,
  onChange,
  message,
  messageStatus,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  message?: string;
  messageStatus?: "info" | "default" | "error";
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="heading-sm text-foreground">{label}</span>
        {value !== "" && (
          <Button
            variant="ghost-secondary"
            size="xs"
            label="Remove"
            onClick={() => onChange("")}
          />
        )}
      </div>
      <Input
        size="sm"
        inputMode="numeric"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        suffix="credits/month"
        isUnit
        message={message}
        messageStatus={messageStatus}
      />
    </div>
  );
}

type ModalTab = "limits" | "priority";

function SpendRulesDialog({
  group,
  groups,
  onClose,
  onSave,
}: {
  group: Group | null;
  groups: Group[];
  onClose: () => void;
  onSave: (groupId: string, payload: SavePayload) => void;
}) {
  const [tab, setTab] = useState<ModalTab>("limits");
  const [budget, setBudget] = useState("");
  const [memberLimit, setMemberLimit] = useState("");
  // Draft priority of the groups that already have a budget (excluding any
  // budget change on this group, which is applied on top).
  const [order, setOrder] = useState<string[]>([]);
  const [onlyShared, setOnlyShared] = useState(true);

  useEffect(() => {
    setTab("limits");
    setBudget(toDraft(group?.budget ?? null));
    setMemberLimit(toDraft(group?.memberLimit ?? null));
    setOrder(groups.filter((g) => g.budget !== null).map((g) => g.id));
    setOnlyShared(true);
    // Reset only when another group is opened.
  }, [group?.id]);

  const draftBudget = fromDraft(budget);
  const draftLimit = fromDraft(memberLimit);

  // The ranking as it will be after saving: this group joins the bottom when
  // it gets a budget, and leaves the ranking when its budget is removed.
  const rankedIds = useMemo(() => {
    if (!group) {
      return [];
    }
    const withoutMe = order.filter((id) => id !== group.id);
    if (draftBudget === null) {
      return withoutMe;
    }
    return order.includes(group.id) ? order : [...withoutMe, group.id];
  }, [order, group, draftBudget]);

  if (!group) {
    return <Dialog open={false} />;
  }

  const initialRanked = groups
    .filter((g) => g.budget !== null)
    .map((g) => g.id);
  const orderChanged = rankedIds.join() !== initialRanked.join();
  const isDirty =
    draftBudget !== group.budget ||
    draftLimit !== group.memberLimit ||
    orderChanged;

  const draftGroup: Group = {
    ...group,
    budget: draftBudget,
    memberLimit: draftLimit,
  };
  const byId = new Map(
    groups.map((g) => [g.id, g.id === group.id ? draftGroup : g])
  );
  const ranked = rankedIds.map((id) => byId.get(id)!);
  // Reorder within the visible list: hidden groups keep their slots.
  const moveVisible = (visibleIds: string[], from: number, to: number) => {
    if (to < 0 || to >= visibleIds.length) {
      return;
    }
    const nextVisible = [...visibleIds];
    const [moved] = nextVisible.splice(from, 1);
    nextVisible.splice(to, 0, moved);
    const slots = rankedIds
      .map((id, i) => (visibleIds.includes(id) ? i : -1))
      .filter((i) => i >= 0);
    const next = [...rankedIds];
    slots.forEach((slot, k) => (next[slot] = nextVisible[k]));
    setOrder(next);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Edit credit rules for {group.name}</DialogTitle>
          <DialogDescription>
            Set {group.name}
            {group.name.endsWith("s") ? "'" : "'s"} monthly budget and the order
            in which group budgets apply.
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as ModalTab)}
          className="flex min-h-0 flex-grow flex-col overflow-hidden"
        >
          {/* Pinned above the scrolling body; DialogContainer's fixedContent
              would add a separator under the tabs' own line. */}
          <div className="flex-none px-5 pt-4">
            <TabsList>
              <TabsTrigger value="limits" label="Limits" />
              <TabsTrigger value="priority" label="Order" />
            </TabsList>
          </div>
          <DialogContainer>
            {/* Both tabs share one grid cell and stay mounted, so the modal keeps
                the height of the taller one when switching. */}
            <div className="grid">
              <TabsContent
                value="limits"
                forceMount
                className="col-start-1 row-start-1 block pt-1 data-[state=inactive]:invisible"
              >
                <LimitsTab
                  group={group}
                  groups={groups}
                  budget={budget}
                  setBudget={setBudget}
                  memberLimit={memberLimit}
                  setMemberLimit={setMemberLimit}
                  draftBudget={draftBudget}
                  ranked={ranked}
                  onReviewOrder={() => setTab("priority")}
                />
              </TabsContent>
              <TabsContent
                value="priority"
                forceMount
                className="col-start-1 row-start-1 block pt-1 data-[state=inactive]:invisible"
              >
                <PriorityTab
                  group={draftGroup}
                  ranked={ranked}
                  isRanked={draftBudget !== null}
                  onlyShared={onlyShared}
                  setOnlyShared={setOnlyShared}
                  onMove={moveVisible}
                />
              </TabsContent>
            </div>
          </DialogContainer>
        </Tabs>
        <DialogFooter
          leftButtonProps={{
            variant: "outline",
            label: "Cancel",
            onClick: onClose,
          }}
          rightButtonProps={{
            variant: "highlight",
            label: "Save",
            disabled: !isDirty,
            onClick: () =>
              onSave(group.id, {
                budget: draftBudget,
                memberLimit: draftLimit,
                rankedIds,
              }),
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Tab 1: Limits
// ---------------------------------------------------------------------------

function LimitsTab({
  group,
  groups,
  budget,
  setBudget,
  memberLimit,
  setMemberLimit,
  draftBudget,
  ranked,
  onReviewOrder,
}: {
  group: Group;
  groups: Group[];
  ranked: Group[];
  onReviewOrder: () => void;
  budget: string;
  setBudget: (v: string) => void;
  memberLimit: string;
  setMemberLimit: (v: string) => void;
  draftBudget: number | null;
}) {
  const blocksNow = draftBudget !== null && draftBudget <= group.used;

  // Members who use another group's budget instead of this one: those also in
  // a group ranked above this one (or in any ranked group, when this group has
  // no budget). Groups in priority order.
  const myRank = ranked.findIndex((g) => g.id === group.id);
  const higher = (myRank === -1 ? ranked : ranked.slice(0, myRank))
    .map((o) => ({
      group: o,
      rank: ranked.indexOf(o) + 1,
      shared: sharedMembers(group, o),
    }))
    .filter((o) => o.shared.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <RuleField
        label="Group budget"
        placeholder="No budget"
        value={budget}
        onChange={setBudget}
        message={
          blocksNow
            ? `Members have already used ${group.used} credits this cycle, so they'll be blocked until the next one. Set a higher budget to avoid this.`
            : `Shared by all members. ${group.used} credits used so far this cycle.`
        }
        messageStatus={blocksNow ? "error" : "default"}
      />
      <RuleField
        label="Limit per member"
        placeholder="No limit"
        value={memberLimit}
        onChange={setMemberLimit}
        message="Caps what each member can spend."
        messageStatus="default"
      />

      {higher.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-highlight-100 bg-highlight-50 px-4 py-3 dark:border-highlight-100-night dark:bg-highlight-50-night">
          <span className="copy-sm min-w-0 flex-1 text-highlight-800">
            {group.name} shares members with{" "}
            {plural(higher.length, "group", "groups")} whose budget applies
            first.
          </span>
          {/* Same placement as a ContentMessage action. */}
          <Button
            variant="ghost"
            size="xs"
            label="Review"
            className="shrink-0"
            onClick={onReviewOrder}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2: Priority
// ---------------------------------------------------------------------------

// Extends DataTable's base row shape (rows are not clickable here).
interface OrderRow {
  onClick?: () => void;
  id: string;
  rank: number;
  name: string;
  isMe: boolean;
  budget: number | null;
  memberLimit: number | null;
  shared: number | null;
  index: number;
}

function orderColumns(
  visibleIds: string[],
  count: number,
  onMove: (visibleIds: string[], from: number, to: number) => void
): ColumnDef<OrderRow>[] {
  return [
    {
      id: "rank",
      header: "",
      enableSorting: false,
      meta: { className: "w-8" },
      cell: ({ row }) => (
        <DataTable.BasicCellContent
          label={String(row.original.rank)}
          className="text-muted-foreground"
        />
      ),
    },
    {
      id: "name",
      header: "Group",
      enableSorting: false,
      cell: ({ row }) => (
        <DataTable.CellContent>
          <span className="flex items-center gap-2">
            {row.original.name}
            {row.original.isMe && (
              <Chip size="mini" color="highlight" label="This group" />
            )}
          </span>
        </DataTable.CellContent>
      ),
    },
    {
      id: "budget",
      header: "Group budget",
      enableSorting: false,
      meta: { className: "w-32" },
      cell: ({ row }) => (
        <DataTable.BasicCellContent label={`${row.original.budget} credits`} />
      ),
    },
    {
      id: "memberLimit",
      header: "Limit per member",
      enableSorting: false,
      meta: { className: "w-36" },
      cell: ({ row }) => (
        <DataTable.BasicCellContent
          label={
            row.original.memberLimit === null
              ? "-"
              : `${row.original.memberLimit} credits`
          }
        />
      ),
    },
    {
      id: "shared",
      header: "Shared members",
      enableSorting: false,
      meta: { className: "w-36" },
      cell: ({ row }) => (
        <DataTable.BasicCellContent
          label={
            row.original.shared === null ? "-" : String(row.original.shared)
          }
        />
      ),
    },
    {
      id: "move",
      header: "",
      enableSorting: false,
      meta: { className: "w-16" },
      cell: ({ row }) => (
        <DataTable.CellContent>
          <div className="flex">
            <Button
              variant="ghost-secondary"
              size="xs"
              icon={ArrowUp}
              tooltip="Move up"
              disabled={row.original.index === 0}
              onClick={() =>
                onMove(visibleIds, row.original.index, row.original.index - 1)
              }
            />
            <Button
              variant="ghost-secondary"
              size="xs"
              icon={ArrowDown}
              tooltip="Move down"
              disabled={row.original.index === count - 1}
              onClick={() =>
                onMove(visibleIds, row.original.index, row.original.index + 1)
              }
            />
          </div>
        </DataTable.CellContent>
      ),
    },
  ];
}

function PriorityTab({
  group,
  ranked,
  isRanked,
  onlyShared,
  setOnlyShared,
  onMove,
}: {
  group: Group;
  ranked: Group[];
  isRanked: boolean;
  onlyShared: boolean;
  setOnlyShared: (v: boolean) => void;
  onMove: (visibleIds: string[], from: number, to: number) => void;
}) {
  const visible = ranked.filter(
    (g) =>
      !onlyShared || g.id === group.id || sharedMembers(group, g).length > 0
  );
  const visibleIds = visible.map((g) => g.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        {/* Same chips as front's filter summary (FilterSummaryChips): an
            active filter can be removed; once removed it stays as a faded
            preset that re-applies it on click. */}
        <Chip
          size="xs"
          color={onlyShared ? "highlight" : "primary"}
          className={[
            "max-w-full border border-dashed transition duration-200 motion-reduce:transition-none",
            onlyShared
              ? "border-transparent"
              : "border-primary-300 opacity-70 hover:opacity-100",
          ].join(" ")}
          icon={onlyShared ? undefined : Plus}
          onClick={onlyShared ? undefined : () => setOnlyShared(true)}
          onRemove={onlyShared ? () => setOnlyShared(false) : undefined}
        >
          <span className="min-w-0 truncate text-xs font-medium">
            Shares members with <span className="font-bold">{group.name}</span>
          </span>
        </Chip>
        <span className="copy-xs text-muted-foreground">
          {visible.length} of {ranked.length} groups
        </span>
      </div>

      {!isRanked && (
        <ContentMessage variant="blue" size="lg" icon={InfoCircle}>
          {group.name} isn't in the order because it has no group budget. Add
          one in Limits to place it.
        </ContentMessage>
      )}

      {visible.length === 0 ? (
        <div className="copy-sm rounded-xl border border-dashed border-border px-4 py-6 text-center text-muted-foreground">
          No group with a budget shares members with {group.name}.
        </div>
      ) : (
        <DataTable
          data={visible.map((g, i): OrderRow => ({
            id: g.id,
            rank: ranked.indexOf(g) + 1,
            name: g.name,
            isMe: g.id === group.id,
            budget: g.budget,
            memberLimit: g.memberLimit,
            shared: g.id === group.id ? null : sharedMembers(group, g).length,
            index: i,
          }))}
          columns={orderColumns(visibleIds, visible.length, onMove)}
          getRowId={(row) => row.id}
          density="compact"
          // Scroll inside the table so the modal keeps its height, even with
          // every group shown.
          maxHeight="max-h-52"
          stickyHeader
        />
      )}
    </div>
  );
}
