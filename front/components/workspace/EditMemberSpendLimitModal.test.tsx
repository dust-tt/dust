import { makeMemberUsage } from "@app/tests/utils/MemberUsageFactory";
import type { GroupType } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EditMemberSpendLimitModal } from "./EditMemberSpendLimitModal";

vi.mock("@app/lib/swr/usage_settings", () => ({
  useUpdateDefaultUserSpendLimit: () => ({
    doUpdateDefaultUserSpendLimit: vi.fn(),
  }),
}));

vi.mock("@app/lib/swr/memberships", () => ({
  useUpdateUserSpendLimit: () => ({ doUpdateSpendLimit: vi.fn() }),
}));

vi.mock("@app/lib/swr/groups", () => ({
  useUpdateGroupSpendLimit: () => ({ doUpdateGroupSpendLimit: vi.fn() }),
}));

const owner = { sId: "wId_1" } as LightWorkspaceType;
const groups: GroupType[] = [];

function makeMember(
  spendLimitSource: "default" | "override" | "group" | "none"
) {
  return makeMemberUsage({
    sId: "user_1",
    name: "Ada Lovelace",
    memberUsageLimit: 1000,
    spendLimitAwuCredits: 1000,
    spendLimitSource,
  });
}

function queryLimitInput(labelText: string): HTMLElement | null {
  const label = screen.queryByText(labelText);
  const container = label?.closest("div")?.parentElement;
  return container?.querySelector("input") ?? null;
}

function queryDefaultLimitInput(): HTMLElement | null {
  return queryLimitInput("Workspace default limit");
}

function getPersonalLimitInput(): HTMLElement {
  const input = queryLimitInput("Personal limit");
  if (!input) {
    throw new Error("Personal limit input not found");
  }
  return input;
}

function getDefaultLimitInput(): HTMLElement {
  const input = queryDefaultLimitInput();
  if (!input) {
    throw new Error("Workspace default limit input not found");
  }
  return input;
}

describe("EditMemberSpendLimitModal", () => {
  it("lets admins edit the workspace default limit when it's the member's applicable source", () => {
    render(
      <EditMemberSpendLimitModal
        isOpen
        onClose={vi.fn()}
        member={makeMember("default")}
        owner={owner}
        groups={groups}
        readOnly={false}
        canEditDefaultLimit
        defaultUserSpendLimitAwuCredits={500}
        isDefaultUserSpendLimitLoading={false}
      />
    );

    expect(getDefaultLimitInput()).not.toBeDisabled();
    expect(getDefaultLimitInput()).toHaveValue("500");
  });

  it("locks the workspace default limit for managers while leaving the personal limit editable", () => {
    render(
      <EditMemberSpendLimitModal
        isOpen
        onClose={vi.fn()}
        member={makeMember("default")}
        owner={owner}
        groups={groups}
        readOnly={false}
        canEditDefaultLimit={false}
        defaultUserSpendLimitAwuCredits={500}
        isDefaultUserSpendLimitLoading={false}
      />
    );

    expect(getDefaultLimitInput()).toBeDisabled();
    expect(getDefaultLimitInput()).toHaveValue("500");
    expect(getPersonalLimitInput()).not.toBeDisabled();
  });

  it("does not block a manager's save while the workspace default is still loading", () => {
    render(
      <EditMemberSpendLimitModal
        isOpen
        onClose={vi.fn()}
        member={makeMember("default")}
        owner={owner}
        groups={groups}
        readOnly={false}
        canEditDefaultLimit={false}
        defaultUserSpendLimitAwuCredits={undefined}
        isDefaultUserSpendLimitLoading
      />
    );

    expect(screen.getByRole("button", { name: "Validate" })).not.toBeDisabled();
  });

  it("blocks an admin's save while the workspace default is still loading", () => {
    render(
      <EditMemberSpendLimitModal
        isOpen
        onClose={vi.fn()}
        member={makeMember("default")}
        owner={owner}
        groups={groups}
        readOnly={false}
        canEditDefaultLimit
        defaultUserSpendLimitAwuCredits={undefined}
        isDefaultUserSpendLimitLoading
      />
    );

    expect(screen.getByRole("button", { name: "Validate" })).toBeDisabled();
  });

  it("shows the caller-supplied default limit but disables editing for read-only viewers", () => {
    render(
      <EditMemberSpendLimitModal
        isOpen
        onClose={vi.fn()}
        member={makeMember("default")}
        owner={owner}
        groups={groups}
        readOnly
        defaultUserSpendLimitAwuCredits={750}
        isDefaultUserSpendLimitLoading={false}
      />
    );

    expect(getDefaultLimitInput()).toBeDisabled();
    expect(getDefaultLimitInput()).toHaveValue("750");
  });

  it("shows a placeholder instead of a real value while the caller's fetch hasn't resolved yet", () => {
    render(
      <EditMemberSpendLimitModal
        isOpen
        onClose={vi.fn()}
        member={makeMember("default")}
        owner={owner}
        groups={groups}
        readOnly
        defaultUserSpendLimitAwuCredits={undefined}
        isDefaultUserSpendLimitLoading
      />
    );

    expect(getDefaultLimitInput()).toHaveValue("");
    expect(getDefaultLimitInput()).toHaveAttribute("placeholder", "--");
  });

  it.each([
    "override",
    "group",
    "none",
  ] as const)("hides the workspace default limit when the member's applicable source is %s", (spendLimitSource) => {
    render(
      <EditMemberSpendLimitModal
        isOpen
        onClose={vi.fn()}
        member={makeMember(spendLimitSource)}
        owner={owner}
        groups={groups}
        readOnly={false}
        defaultUserSpendLimitAwuCredits={500}
        isDefaultUserSpendLimitLoading={false}
      />
    );

    expect(queryDefaultLimitInput()).toBeNull();
  });
});
