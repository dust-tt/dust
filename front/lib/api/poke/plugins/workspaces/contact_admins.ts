import { createPlugin } from "@app/lib/api/poke/types";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { Err, Ok } from "@app/types/shared/result";

export const contactAdminsPlugin = createPlugin({
  manifest: {
    id: "contact-admins",
    name: "Contact Admins",
    description: "Generate a mailto link for the workspace admins.",
    resourceTypes: ["workspaces"],
    readonly: true,
    args: {},
  },
  execute: async (auth, resource) => {
    const workspace =
      resource ??
      (auth.workspace()
        ? renderLightWorkspaceType({
            workspace: auth.getNonNullableWorkspace(),
          })
        : null);

    if (!workspace) {
      return new Err(new Error("Workspace not found."));
    }

    const { memberships } = await MembershipResource.getActiveMemberships({
      workspace,
      roles: ["admin"],
    });

    const adminEmails = [
      ...new Set(
        memberships
          .map((membership) => membership.user?.email)
          .filter((email): email is string => Boolean(email))
      ),
    ].sort((a, b) => a.localeCompare(b));

    if (adminEmails.length === 0) {
      return new Err(new Error("No active workspace admin found."));
    }

    const gmailComposeUrl = new URL("https://mail.google.com/mail/");
    gmailComposeUrl.searchParams.set("view", "cm");
    gmailComposeUrl.searchParams.set("fs", "1");
    gmailComposeUrl.searchParams.set("to", adminEmails.join(","));
    gmailComposeUrl.searchParams.set("su", "[Dust]");

    return new Ok({
      display: "textWithLink",
      value: `Found ${adminEmails.length} admin${adminEmails.length === 1 ? "" : "s"}: ${adminEmails.join(", ")}`,
      link: gmailComposeUrl.toString(),
      linkText: "Contact Admins",
    });
  },
});
