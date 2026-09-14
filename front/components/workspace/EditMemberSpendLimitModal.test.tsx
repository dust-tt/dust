import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { makeMemberUsage } from "@app/tests/utils/MemberUsageFactory";
import type { GroupType } from "@app/types/groups";
import type { MembershipSeatType } from "@app/types/memberships";
import { fireEvent, render, screen } from "@testing-library/react";
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

const owner = LightWorkspaceFactory.build({ sId: "wId_1" });
const groups: GroupType[] = [];

function makeMember(
  spendLimitSource: "default" | "override" | "group" | "none",
  seatType: MembershipSeatType = "max"
) {
  return makeMemberUsage({
    sId: "user_1",
    name: "Ada Lovelace",
    memberUsageLimit: 1000,
    spendLimitAwuCredits: 1000,
    spendLimitSource,
    seatType,
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
        defaultUserSpendLimit={{ status: "ready", awuCredits: 500 }}
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
        defaultUserSpendLimit={{ status: "ready", awuCredits: 500 }}
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
        defaultUserSpendLimit={{ status: "loading" }}
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
        defaultUserSpendLimit={{ status: "loading" }}
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
        defaultUserSpendLimit={{ status: "ready", awuCredits: 750 }}
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
        defaultUserSpendLimit={{ status: "loading" }}
      />
    );

    expect(getDefaultLimitInput()).toHaveValue("");
    expect(getDefaultLimitInput()).toHaveAttribute("placeholder", "--");
  });

  it("keeps a value typed in another field when the workspace default finishes loading", () => {
    const { rerender } = render(
      <EditMemberSpendLimitModal
        isOpen
        onClose={vi.fn()}
        member={makeMember("default")}
        owner={owner}
        groups={groups}
        readOnly={false}
        canEditDefaultLimit={false}
        defaultUserSpendLimit={{ status: "loading" }}
      />
    );
    fireEvent.change(getPersonalLimitInput(), { target: { value: "2000" } });

    rerender(
      <EditMemberSpendLimitModal
        isOpen
        onClose={vi.fn()}
        member={makeMember("default")}
        owner={owner}
        groups={groups}
        readOnly={false}
        canEditDefaultLimit={false}
        defaultUserSpendLimit={{ status: "ready", awuCredits: 500 }}
      />
    );

    expect(getPersonalLimitInput()).toHaveValue("2,000");
    expect(getDefaultLimitInput()).toHaveValue("500");
  });

  it("locks only the workspace default field and shows a message when its fetch failed", () => {
    render(
      <EditMemberSpendLimitModal
        isOpen
        onClose={vi.fn()}
        member={makeMember("default")}
        owner={owner}
        groups={groups}
        readOnly={false}
        canEditDefaultLimit
        defaultUserSpendLimit={{ status: "error" }}
      />
    );

    expect(getDefaultLimitInput()).toBeDisabled();
    expect(
      screen.getByText("The workspace default limit could not be loaded.")
    ).toBeInTheDocument();
    expect(getPersonalLimitInput()).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Validate" })).not.toBeDisabled();
  });

  it("hides the workspace default limit when the workspace has none", () => {
    render(
      <EditMemberSpendLimitModal
        isOpen
        onClose={vi.fn()}
        member={makeMember("default")}
        owner={owner}
        groups={groups}
        readOnly
        defaultUserSpendLimit={{ status: "unavailable" }}
      />
    );

    expect(queryDefaultLimitInput()).toBeNull();
  });

  it.each([
    "free",
    "none",
  ] as const)("hides the workspace default limit for %s seats even when their source is default", (seatType) => {
    render(
      <EditMemberSpendLimitModal
        isOpen
        onClose={vi.fn()}
        member={makeMember("default", seatType)}
        owner={owner}
        groups={groups}
        readOnly={false}
        canEditDefaultLimit
        defaultUserSpendLimit={{ status: "ready", awuCredits: 500 }}
      />
    );

    expect(queryDefaultLimitInput()).toBeNull();
    expect(screen.getByRole("button", { name: "Validate" })).not.toBeDisabled();
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
        defaultUserSpendLimit={{ status: "ready", awuCredits: 500 }}
      />
    );

    expect(queryDefaultLimitInput()).toBeNull();
  });
});
