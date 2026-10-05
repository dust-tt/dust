import { LightUserFactory } from "@app/tests/utils/LightUserFactory";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import type { GroupWithAllowedActions } from "@app/types/api/groups";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChangeMemberModal } from "./ChangeMemberModal";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);
Element.prototype.scrollIntoView = vi.fn();

const workspace = LightWorkspaceFactory.build();
const member = {
  ...LightUserFactory.build({ fullName: "Ada Lovelace" }),
  workspace: { ...workspace, role: "user" as const },
};

let isManager = false;
vi.mock("@app/lib/auth/AuthContext", () => ({
  useAuth: () => ({ isManager }),
  useWorkspace: () => workspace,
}));

vi.mock("@app/hooks/useNotification", () => ({
  useSendNotification: () => vi.fn(),
}));

const editableGroup: GroupWithAllowedActions = {
  id: 1,
  sId: "engineering",
  name: "Engineering",
  kind: "regular_manual",
  workspaceId: workspace.id,
  memberCount: 2,
  poolCapAwuCredits: null,
  grantedRole: null,
  grantedSeatType: null,
  allowedActions: {
    canEditMembers: true,
    canEditDetails: false,
    canReadUsage: false,
    canSetUsageLimits: false,
    canAssignManagers: false,
  },
};
const groups: GroupWithAllowedActions[] = [
  editableGroup,
  {
    ...editableGroup,
    sId: "finance",
    name: "Finance",
    id: 2,
    memberCount: 3,
    allowedActions: undefined,
  },
];

vi.mock("@app/lib/swr/groups", () => ({
  useWorkspaceGrantedRoles: () => ({ grantedRoles: [] }),
  useMemberGroups: () => ({ memberGroups: [], isMemberGroupsLoading: false }),
  useGroups: () => ({ groups }),
  useAddMemberToGroup: () => ({ doAddMemberToGroup: vi.fn() }),
  useRemoveMemberFromGroup: () => ({ doRemoveMemberFromGroup: vi.fn() }),
}));

function renderModal() {
  render(
    <ChangeMemberModal
      onClose={vi.fn()}
      member={member}
      mutateMembers={vi.fn()}
      workspace={workspace}
    />
  );
}

describe("ChangeMemberModal", () => {
  beforeEach(() => {
    isManager = false;
  });

  it("lets a group manager manage only allowed groups without workspace controls", async () => {
    renderModal();

    expect(screen.getByText("Groups")).toBeInTheDocument();
    expect(screen.queryByText("Role:")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Update role" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Revoke member access" })
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Add to group" }));
    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(screen.queryByText("Finance")).not.toBeInTheDocument();
  });

  it("shows workspace controls to a workspace manager", () => {
    isManager = true;
    renderModal();

    expect(screen.getByText("Role:")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Update role" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Revoke member access" })
    ).toBeInTheDocument();
  });
});
