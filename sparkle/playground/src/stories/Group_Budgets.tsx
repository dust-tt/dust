import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Avatar,
  BarChart01,
  Button,
  CheckboxWithText,
  Chip,
  Clock,
  CoinsStacked01,
  ContentMessage,
  CreditCard01,
  Cube01,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InfoCircle,
  Input,
  NavigationList,
  NavigationListItem,
  NavigationListLabel,
  Notification,
  Plus,
  PuzzlePiece01,
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
}

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

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
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

        <p className="copy-sm text-muted-foreground">
          A limit per member caps what each member can spend. A group budget
          caps what a group's members spend together. When someone is in several
          groups, their highest limit per member applies, along with the budget
          of their highest-priority group.
        </p>

        <GroupsTable groups={groups} onOpen={setEditingId} />
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

function GroupsTable({
  groups,
  onOpen,
}: {
  groups: Group[];
  onOpen: (id: string) => void;
}) {
  const rankedCount = groups.filter((g) => g.budget !== null).length;
  const th = "heading-xs py-2 px-2 text-left text-foreground";
  return (
    <table className="w-full table-fixed">
      <thead>
        <tr className="border-b border-border">
          <th className={`${th} w-12`}>#</th>
          <th className={`${th} w-[22%]`}>Group</th>
          <th className={`${th} w-[18%]`}>Group budget</th>
          <th className={`${th} w-[11%]`}>Members</th>
          <th className={`${th} w-[18%]`}>Limit per member</th>
          <th className={th}>
            <span className="flex items-center gap-1">
              Models tier
              <InfoCircle className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g, i) => (
          <tr
            key={g.id}
            data-group-row={g.id}
            onClick={() => onOpen(g.id)}
            className="cursor-pointer border-b border-border hover:bg-muted-background"
          >
            <td className="copy-sm px-2 py-3 font-medium tabular-nums text-muted-foreground">
              {i < rankedCount ? i + 1 : ""}
            </td>
            <td className="px-2 py-3">
              <span className="copy-sm flex items-center gap-2 font-medium text-foreground">
                <Users01 className="h-4 w-4 shrink-0" />
                {g.name}
              </span>
            </td>
            <td className="copy-sm px-2 py-3 tabular-nums text-foreground">
              {g.budget === null ? (
                "-"
              ) : (
                <span>
                  {g.used}{" "}
                  <span className="text-muted-foreground">
                    / {g.budget} credits
                  </span>
                </span>
              )}
            </td>
            <td className="copy-sm px-2 py-3 text-foreground">
              {g.members.length}
            </td>
            <td className="copy-sm px-2 py-3 text-foreground">
              {g.memberLimit === null ? "-" : `${g.memberLimit} credits`}
            </td>
            <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost-secondary"
                size="sm"
                isSelect
                label="Inherited from workspace"
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

function GripIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
    >
      {[4, 8, 12].map((y) =>
        [6, 10].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.2" />)
      )}
    </svg>
  );
}

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
  // Group card to point at when arriving on Priority from a chip.
  const [focusId, setFocusId] = useState<string | null>(null);
  useEffect(() => {
    if (!focusId) {
      return;
    }
    const t = window.setTimeout(() => setFocusId(null), 2400);
    return () => window.clearTimeout(t);
  }, [focusId]);

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

  const draftGroup: Group = { ...group, budget: draftBudget };
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
      <DialogContent size="lg" height="lg">
        <DialogHeader>
          <DialogTitle>Edit credit rules for {group.name}</DialogTitle>
          <DialogDescription>
            Set how many credits {group.name} can spend each month, and which
            budget applies to members in several groups.
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
              <TabsTrigger value="priority" label="Priority" />
            </TabsList>
          </div>
          <DialogContainer>
            <TabsContent value="limits" className="block pt-1">
              <LimitsTab
                group={group}
                groups={groups}
                budget={budget}
                setBudget={setBudget}
                memberLimit={memberLimit}
                setMemberLimit={setMemberLimit}
                draftBudget={draftBudget}
                ranked={ranked}
                onOpenPriority={(id) => {
                  setFocusId(id);
                  setTab("priority");
                }}
              />
            </TabsContent>
            <TabsContent value="priority" className="block pt-1">
              <PriorityTab
                group={draftGroup}
                ranked={ranked}
                isRanked={draftBudget !== null}
                onlyShared={onlyShared}
                setOnlyShared={setOnlyShared}
                onMove={moveVisible}
                focusId={focusId}
              />
            </TabsContent>
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
  onOpenPriority,
}: {
  group: Group;
  groups: Group[];
  ranked: Group[];
  onOpenPriority: (groupId: string) => void;
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
  const sharedPeople = [...new Set(higher.flatMap((o) => o.shared))];

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
        messageStatus={blocksNow ? "error" : "info"}
      />
      <RuleField
        label="Limit per member"
        placeholder="No limit"
        value={memberLimit}
        onChange={setMemberLimit}
        message="Caps what each member can spend."
        messageStatus="default"
      />

      <div className="flex flex-col gap-3 border-t border-border pt-5">
        <div className="flex flex-col gap-1">
          <span className="heading-sm text-foreground">
            {higher.length === 0
              ? `No higher-priority group shares members with ${group.name}`
              : `${higher.length} higher-priority ${higher.length === 1 ? "group shares" : "groups share"} members with ${group.name}`}
          </span>
          {higher.length === 0 && (
            <span className="copy-xs text-muted-foreground">
              All of {group.name}'s members use this budget.
            </span>
          )}
        </div>
        {higher.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {higher.map((o) => (
              <Chip
                key={o.group.id}
                size="xs"
                color="highlight"
                label={`${o.rank}. ${o.group.name} · ${plural(o.shared.length, "member", "members")}`}
                onClick={() => onOpenPriority(o.group.id)}
              />
            ))}
          </div>
        )}
        {sharedPeople.length > 0 && (
          <div className="flex items-center gap-2">
            <Avatar.Stack
              size="sm"
              nbVisibleItems={8}
              hasMagnifier={false}
              avatars={sharedPeople.map((name) => ({
                name,
                isRounded: true,
              }))}
            />
            <span className="copy-xs truncate text-muted-foreground">
              {plural(sharedPeople.length, "member", "members")}:{" "}
              {sharedPeople.slice(0, 3).join(", ")}
              {sharedPeople.length > 3 &&
                ` and ${sharedPeople.length - 3} more`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2: Priority
// ---------------------------------------------------------------------------

function PriorityTab({
  group,
  ranked,
  isRanked,
  onlyShared,
  setOnlyShared,
  onMove,
  focusId,
}: {
  group: Group;
  ranked: Group[];
  focusId: string | null;
  isRanked: boolean;
  onlyShared: boolean;
  setOnlyShared: (v: boolean) => void;
  onMove: (visibleIds: string[], from: number, to: number) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const visible = ranked.filter(
    (g) =>
      !onlyShared || g.id === group.id || sharedMembers(group, g).length > 0
  );
  const visibleIds = visible.map((g) => g.id);
  const endDrag = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="copy-sm text-muted-foreground">
        When someone is in several of these groups, the highest group's budget
        applies. Drag groups to reorder them.
      </p>
      <div className="flex items-center justify-between">
        <CheckboxWithText
          text={`Only show groups that share members with ${group.name}`}
          checked={onlyShared}
          onCheckedChange={(v) => setOnlyShared(v === true)}
        />
        <span className="copy-xs text-muted-foreground">
          {visible.length} of {ranked.length} groups
        </span>
      </div>

      {!isRanked && (
        <ContentMessage variant="blue" size="lg" icon={InfoCircle}>
          {group.name} isn't in this list because it has no group budget. Add
          one in Limits to set its priority.
        </ContentMessage>
      )}

      {visible.length === 0 ? (
        <div className="copy-sm rounded-xl border border-dashed border-border px-4 py-6 text-center text-muted-foreground">
          No group with a budget shares members with {group.name}.
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {visible.map((g, i) => {
            const isMe = g.id === group.id;
            const isFocused = focusId === g.id;
            const shared = isMe ? 0 : sharedMembers(group, g).length;
            const rank = ranked.indexOf(g) + 1;
            const isDropTarget =
              dragIndex !== null && overIndex === i && dragIndex !== i;
            return (
              <li
                key={g.id}
                ref={(el) => {
                  if (el && isFocused) {
                    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
                  }
                }}
                onDragOver={(e) => {
                  if (dragIndex === null) {
                    return;
                  }
                  e.preventDefault();
                  setOverIndex(i);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null) {
                    onMove(visibleIds, dragIndex, i);
                  }
                  endDrag();
                }}
                className={[
                  "flex items-center gap-2 rounded-xl border px-2 py-2",
                  isMe
                    ? "border-highlight-300 bg-highlight-50 dark:bg-highlight-50-night"
                    : "border-border bg-background",
                  isDropTarget || isFocused ? "ring-2 ring-highlight" : "",
                  "transition-shadow duration-500",
                  dragIndex === i ? "opacity-40" : "",
                ].join(" ")}
              >
                <button
                  type="button"
                  draggable
                  aria-label={`Reorder ${g.name}. Press the up or down arrow to move it.`}
                  title="Drag to reorder"
                  onDragStart={(e) => {
                    setDragIndex(i);
                    e.dataTransfer.effectAllowed = "move";
                    const row = e.currentTarget.closest("li");
                    if (row) {
                      e.dataTransfer.setDragImage(row, 16, 20);
                    }
                  }}
                  onDragEnd={endDrag}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      onMove(visibleIds, i, i - 1);
                    } else if (e.key === "ArrowDown") {
                      e.preventDefault();
                      onMove(visibleIds, i, i + 1);
                    }
                  }}
                  className="flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-lg text-muted-foreground hover:bg-muted-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-highlight active:cursor-grabbing"
                >
                  <GripIcon />
                </button>
                <span className="copy-sm w-6 shrink-0 text-center font-medium tabular-nums text-muted-foreground">
                  {rank}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="copy-sm flex items-center gap-2 font-medium text-foreground">
                    {g.name}
                    {isMe && (
                      <Chip size="mini" color="highlight" label="This group" />
                    )}
                  </span>
                  <span className="copy-xs text-muted-foreground">
                    {isMe
                      ? `${g.budget} credits/month`
                      : `${g.budget} credits/month · ${shared === 0 ? "no shared members" : plural(shared, "shared member", "shared members")}`}
                  </span>
                </div>
                <div className="flex shrink-0">
                  <Button
                    variant="ghost-secondary"
                    size="xs"
                    icon={ArrowUp}
                    tooltip="Move up"
                    disabled={i === 0}
                    onClick={() => onMove(visibleIds, i, i - 1)}
                  />
                  <Button
                    variant="ghost-secondary"
                    size="xs"
                    icon={ArrowDown}
                    tooltip="Move down"
                    disabled={i === visible.length - 1}
                    onClick={() => onMove(visibleIds, i, i + 1)}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {isRanked && (
        <p className="copy-xs text-muted-foreground">
          {group.name} is {ordinal(ranked.indexOf(group) + 1)} of{" "}
          {ranked.length}.
        </p>
      )}
    </div>
  );
}
