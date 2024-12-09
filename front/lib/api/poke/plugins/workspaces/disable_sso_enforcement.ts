import { Err, Ok } from "@dust-tt/types";

import { createPlugin } from "@app/lib/api/poke/types";
import { disableSSOEnforcement } from "@app/lib/api/workspace";

export const disableSSOPlugin = createPlugin(
  {
    id: "disable-sso",
    name: "Disable SSO Enforcement",
    description: "Disable SSO enforcement on a workspace",
    resourceTypes: ["workspaces"],
    args: {
      force: {
        type: "boolean",
        label: "Force",
        description: "Are you sure?",
      },
    },
  },
  async (auth, _, args) => {
    const workspace = auth.workspace();
    if (!workspace) {
      return new Err(new Error("Cannot find workspace."));
    }

    const { force } = args;
    if (!force) {
      return new Err(
        new Error("You must confirm that you want to disable SSO enforcement.")
      );
    }

    const res = await disableSSOEnforcement(workspace);

    if (res.isErr()) {
      return new Err(res.error);
    }

    return new Ok({
      display: "text",
      value: "SSO enforcement disabled.",
    });
  }
);
