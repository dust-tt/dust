import {
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useSendNotification,
} from "@dust-tt/sparkle";
import type { RowSelectionState } from "@tanstack/react-table";
import { useState } from "react";

import { EditMemberLimitDialog } from "../components/EditMemberLimitDialog";
import {
  GroupLimitDialog,
  type GroupLimitDialogMode,
} from "../components/GroupLimitDialog";
import { GroupLimitGroupsTab } from "../components/GroupLimitGroupsTab";
import { GroupLimitMembersTab } from "../components/GroupLimitMembersTab";
import {
  GroupLimitMemberView,
  type MemberViewRole,
} from "../components/GroupLimitMemberView";
import {
  BulkLimitGroupDialog,
  ChangeSeatDialog,
  LimitGroupMembersDialog,
} from "../components/GroupLimitSmallDialogs";
import { PlaygroundScreen } from "../components/PlaygroundScreen";
import {
  BILLING_CYCLE_RESET_LABEL,
  createInitialGroupLimitsState,
  formatCreditAmount,
  getBlockedReason,
  getMemberIds,
  getMemberPoolSpend,
  type GroupLimitPlan,
  type GroupLimitsState,
  setGroupUsageForDemo,
  setPerMemberLimit,
} from "../data/groupLimits";

type DialogState =
  | {
      kind: "groupLimit";
      groupId: string;
      mode: GroupLimitDialogMode;
      initialDraft?: string;
    }
  | { kind: "whoDraws"; groupId: string }
  | { kind: "member"; userId: string; focusLimitGroup?: boolean }
  | { kind: "bulkLimitGroup"; userIds: string[] }
  | { kind: "changeSeat"; userId: string };

interface StoryState {
  data: GroupLimitsState;
  plan: GroupLimitPlan;
  view: "admin" | "member";
  tab: "members" | "groups";
  dialog: DialogState | null;
  rowSelection: RowSelectionState;
  persona: string;
  role: MemberViewRole;
}

function initialStoryState(): StoryState {
  return {
    data: createInitialGroupLimitsState(),
    plan: "pooled",
    view: "admin",
    tab: "groups",
    dialog: null,
    rowSelection: {},
    persona: "9",
    role: "member",
  };
}

function withSupportAt(ratio: number): GroupLimitsState {
  return setGroupUsageForDemo(
    createInitialGroupLimitsState(),
    "support",
    3_000 * ratio
  );
}

interface Scenario {
  id: string;
  title: string;
  description: string;
  setup: (base: StoryState) => StoryState;
}

const SCENARIOS: Scenario[] = [
  {
    id: "1",
    title: "1. Add a limit, no conflict",
    description: "EMEA: no member draws from another group",
    setup: (s) => ({
      ...s,
      tab: "groups",
      dialog: {
        kind: "groupLimit",
        groupId: "emea",
        mode: "add",
        initialDraft: "4000",
      },
    }),
  },
  {
    id: "2",
    title: "2. Add a limit, with conflicts",
    description: "Sales: 3 members already draw from Engineering or Marketing",
    setup: (s) => ({
      ...s,
      tab: "groups",
      dialog: {
        kind: "groupLimit",
        groupId: "sales",
        mode: "add",
        initialDraft: "8000",
      },
    }),
  },
  {
    id: "3a",
    title: "3. Move a member to another limit group",
    description: "Edit member limit modal, Limit group picker",
    setup: (s) => ({
      ...s,
      tab: "members",
      dialog: { kind: "member", userId: "3", focusLimitGroup: true },
    }),
  },
  {
    id: "3b",
    title: "3. Move several members (bulk)",
    description: "Members tab selection, Set limit group",
    setup: (s) => {
      const userIds = ["3", "8", "9", "10", "14"];
      return {
        ...s,
        tab: "members",
        rowSelection: Object.fromEntries(userIds.map((id) => [id, true])),
        dialog: { kind: "bulkLimitGroup", userIds },
      };
    },
  },
  {
    id: "4",
    title: "4. See who counts in a limit group",
    description: "Engineering: members drawing from it vs elsewhere",
    setup: (s) => ({
      ...s,
      tab: "groups",
      dialog: { kind: "whoDraws", groupId: "eng" },
    }),
  },
  {
    id: "5",
    title: "5. Lower a limit below current usage",
    description: "Engineering at 8,120, lowered to 7,500",
    setup: (s) => ({
      ...s,
      tab: "groups",
      dialog: {
        kind: "groupLimit",
        groupId: "eng",
        mode: "edit",
        initialDraft: "7500",
      },
    }),
  },
  {
    id: "6",
    title: "6. Remove a limit",
    description: "Marketing: where its members draw from next",
    setup: (s) => ({
      ...s,
      tab: "groups",
      dialog: { kind: "groupLimit", groupId: "mkt", mode: "remove" },
    }),
  },
  {
    id: "7",
    title: "7. Limit per member side effect",
    description: "EMEA has no limit per member: members fall to the default",
    setup: (s) => ({
      ...s,
      tab: "groups",
      dialog: {
        kind: "groupLimit",
        groupId: "emea",
        mode: "add",
        initialDraft: "4000",
      },
    }),
  },
  {
    id: "8",
    title: "8. Member on the default limit group",
    description: "In Support and Engineering, no explicit choice",
    setup: (s) => ({
      ...s,
      tab: "members",
      dialog: { kind: "member", userId: "9" },
    }),
  },
  {
    id: "9a",
    title: "9. Blocked: Members tab (Enterprise Pooled)",
    description: "Support at its limit, no seat allowance",
    setup: (s) => ({
      ...s,
      data: withSupportAt(1),
      plan: "pooled",
      tab: "members",
    }),
  },
  {
    id: "9b",
    title: "9. Blocked: Members tab (seat allowances)",
    description: "Support at its limit, seat change offered",
    setup: (s) => ({
      ...s,
      data: withSupportAt(1),
      plan: "seats",
      tab: "members",
    }),
  },
  {
    id: "9c",
    title: "9. Member view at 80%",
    description: "Input bar banner",
    setup: (s) => ({
      ...s,
      data: withSupportAt(0.8),
      view: "member",
      persona: "9",
      role: "member",
    }),
  },
  {
    id: "9d",
    title: "9. Member view at 100%",
    description: "Banner and limit reached popup (send a message)",
    setup: (s) => ({
      ...s,
      data: withSupportAt(1),
      view: "member",
      persona: "9",
      role: "member",
    }),
  },
  {
    id: "10",
    title: "10. Groups without a limit",
    description: "Members' pool usage next to limited groups' bars",
    setup: (s) => ({ ...s, tab: "groups" }),
  },
];

function UsageGroupLimitsPrototype() {
  const [story, setStory] = useState<StoryState>(initialStoryState);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const sendNotification = useSendNotification();
  const { data, plan, dialog } = story;

  const update = (patch: Partial<StoryState>) =>
    setStory((prev) => ({ ...prev, ...patch }));
  const openDialog = (next: DialogState | null) => update({ dialog: next });
  const apply = (next: GroupLimitsState, message: string) => {
    update({ data: next, dialog: null });
    sendNotification({ type: "success", title: message });
  };

  const scenario = SCENARIOS.find((s) => s.id === scenarioId);
  const totalPoolSpend = getMemberIds(data).reduce(
    (sum, id) => sum + getMemberPoolSpend(data, id),
    0
  );
  const blockedCount = getMemberIds(data).filter(
    (id) => getBlockedReason(data, id, plan) !== null
  ).length;

  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted-background px-6 py-2">
        <span className="text-sm font-semibold text-foreground">
          Group limits prototype
        </span>
        <ButtonsSwitchList
          size="xs"
          value={story.view}
          onValueChange={(value) =>
            update({ view: value as StoryState["view"], dialog: null })
          }
        >
          <ButtonsSwitch value="admin" label="Usage page (admin)" />
          <ButtonsSwitch value="member" label="Member view" />
        </ButtonsSwitchList>
        <ButtonsSwitchList
          size="xs"
          value={plan}
          onValueChange={(value) => update({ plan: value as GroupLimitPlan })}
        >
          <ButtonsSwitch value="pooled" label="Enterprise Pooled" />
          <ButtonsSwitch value="seats" label="Plan with seat allowances" />
        </ButtonsSwitchList>
        <div className="ml-auto flex items-center gap-2">
          {scenario && (
            <span className="text-xs text-muted-foreground">
              {scenario.title}
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="xs" variant="outline" label="Scenarios" isSelect />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[80vh]">
              <DropdownMenuLabel label="Resets the mock data" />
              {SCENARIOS.map((s) => (
                <DropdownMenuItem
                  key={s.id}
                  label={s.title}
                  description={s.description}
                  onClick={() => {
                    setScenarioId(s.id);
                    setStory(s.setup(initialStoryState()));
                  }}
                />
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                label="Reset everything"
                onClick={() => {
                  setScenarioId(null);
                  setStory(initialStoryState());
                }}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {story.view === "member" ? (
          <GroupLimitMemberView
            state={data}
            plan={plan}
            userId={story.persona}
            role={story.role}
            onUserChange={(persona) => update({ persona })}
            onRoleChange={(role) => update({ role })}
            onStateChange={(next) => update({ data: next })}
            onManageGroupLimits={() =>
              update({ view: "admin", tab: "groups", dialog: null })
            }
          />
        ) : (
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
            <div className="flex flex-col gap-1">
              <h1 className="heading-2xl text-foreground">Usage</h1>
              <span className="copy-sm text-muted-foreground">
                Billing cycle Sep 1 – Sep 30, resets on{" "}
                {BILLING_CYCLE_RESET_LABEL}.{" "}
                {formatCreditAmount(totalPoolSpend)} credits used from the
                workspace pool · {blockedCount} member
                {blockedCount === 1 ? "" : "s"} blocked.
              </span>
            </div>
            <Tabs
              value={story.tab}
              onValueChange={(value) =>
                update({ tab: value as StoryState["tab"] })
              }
            >
              <TabsList>
                <TabsTrigger value="members" label="Members" />
                <TabsTrigger value="groups" label="Groups" />
              </TabsList>
              <TabsContent value="members" className="pt-4">
                <GroupLimitMembersTab
                  state={data}
                  plan={plan}
                  rowSelection={story.rowSelection}
                  setRowSelection={(rowSelection) => update({ rowSelection })}
                  onOpenMember={(userId, focusLimitGroup) =>
                    openDialog({ kind: "member", userId, focusLimitGroup })
                  }
                  onEditGroupLimit={(groupId) =>
                    openDialog({ kind: "groupLimit", groupId, mode: "edit" })
                  }
                  onChangeSeat={(userId) =>
                    openDialog({ kind: "changeSeat", userId })
                  }
                  onBulkSetLimitGroup={(userIds) =>
                    openDialog({ kind: "bulkLimitGroup", userIds })
                  }
                />
              </TabsContent>
              <TabsContent value="groups" className="pt-4">
                <GroupLimitGroupsTab
                  state={data}
                  onSavePerMemberLimit={(groupId, value) =>
                    apply(
                      setPerMemberLimit(data, groupId, value),
                      "Limit per member updated"
                    )
                  }
                  onAddGroupLimit={(groupId) =>
                    openDialog({ kind: "groupLimit", groupId, mode: "add" })
                  }
                  onEditGroupLimit={(groupId) =>
                    openDialog({ kind: "groupLimit", groupId, mode: "edit" })
                  }
                  onRemoveGroupLimit={(groupId) =>
                    openDialog({ kind: "groupLimit", groupId, mode: "remove" })
                  }
                  onShowMembers={(groupId) =>
                    openDialog({ kind: "whoDraws", groupId })
                  }
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>

      {dialog?.kind === "groupLimit" && (
        <GroupLimitDialog
          key={JSON.stringify(dialog)}
          state={data}
          plan={plan}
          groupId={dialog.groupId}
          mode={dialog.mode}
          initialDraft={dialog.initialDraft}
          onClose={() => openDialog(null)}
          onApply={apply}
          onShowMembers={(groupId) => openDialog({ kind: "whoDraws", groupId })}
        />
      )}
      {dialog?.kind === "whoDraws" && (
        <LimitGroupMembersDialog
          key={JSON.stringify(dialog)}
          state={data}
          groupId={dialog.groupId}
          onClose={() => openDialog(null)}
          onOpenMember={(userId) => openDialog({ kind: "member", userId })}
          onEditGroupLimit={(groupId) =>
            openDialog({ kind: "groupLimit", groupId, mode: "edit" })
          }
        />
      )}
      {dialog?.kind === "member" && (
        <EditMemberLimitDialog
          key={JSON.stringify(dialog)}
          state={data}
          plan={plan}
          userId={dialog.userId}
          focusLimitGroup={dialog.focusLimitGroup}
          onClose={() => openDialog(null)}
          onApply={apply}
          onEditGroupLimit={(groupId) =>
            openDialog({ kind: "groupLimit", groupId, mode: "edit" })
          }
          onChangeSeat={(userId) => openDialog({ kind: "changeSeat", userId })}
        />
      )}
      {dialog?.kind === "bulkLimitGroup" && (
        <BulkLimitGroupDialog
          key={JSON.stringify(dialog)}
          state={data}
          plan={plan}
          userIds={dialog.userIds}
          onClose={() => openDialog(null)}
          onApply={(next, message) => {
            apply(next, message);
            update({ rowSelection: {} });
          }}
        />
      )}
      {dialog?.kind === "changeSeat" && (
        <ChangeSeatDialog
          key={JSON.stringify(dialog)}
          state={data}
          plan={plan}
          userId={dialog.userId}
          onClose={() => openDialog(null)}
          onApply={apply}
        />
      )}
    </div>
  );
}

export default function UsageGroupLimits() {
  return (
    <PlaygroundScreen>
      <UsageGroupLimitsPrototype />
    </PlaygroundScreen>
  );
}
