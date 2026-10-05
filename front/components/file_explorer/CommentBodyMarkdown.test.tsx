import { CommentBodyMarkdown } from "@app/components/file_explorer/CommentBodyMarkdown";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { AuthContext } from "@app/lib/auth/AuthContext";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("CommentBodyMarkdown", () => {
  it("renders agent and user mentions as mention chips", async () => {
    const { authenticator, user } = await createResourceTest({ role: "user" });
    const owner = authenticator.getNonNullableWorkspace();
    const context: AuthContextValue = {
      workspace: owner,
      user: user.toJSON(),
      subscription: authenticator.getNonNullableSubscription(),
      isAdmin: false,
      isManager: false,
      featureFlags: [],
      vizUrl: "http://localhost",
      providersHealth: null,
      workspacePermissions: await authenticator.getWorkspacePermissions(),
    };

    render(
      <AuthContext.Provider value={context}>
        <CommentBodyMarkdown
          owner={owner}
          body="Can :mention[dust]{sId=dust} ask :mention_user[Yuka]{sId=usr_yuka} about **this**?"
        />
      </AuthContext.Provider>
    );

    expect(screen.getByText("@dust")).toBeDefined();
    expect(screen.getByText("@Yuka")).toBeDefined();
    expect(screen.queryByText(/:mention/)).toBeNull();
    expect(screen.getByText("this").tagName).toBe("STRONG");
  });
});
