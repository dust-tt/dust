import { createPlugin } from "@app/lib/api/poke/types";
import { syncWorkOSITContacts } from "@app/lib/api/workos/it_contacts";
import { getActiveAdminEmails } from "@app/lib/api/workspace";
import { Err, Ok } from "@app/types/shared/result";

export const syncWorkOSITContactsPlugin = createPlugin({
  manifest: {
    id: "sync-workos-it-contacts",
    name: "Sync WorkOS IT Contacts",
    description:
      "Register the workspace's active admins as WorkOS IT contacts.",
    resourceTypes: ["workspaces"],
    args: {},
    requiredRoles: ["support"],
  },
  execute: async (auth) => {
    const workspace = auth.getNonNullableWorkspace();

    if (!workspace.workOSOrganizationId) {
      return new Err(
        new Error("No WorkOS organization associated with this workspace.")
      );
    }

    const emails = await getActiveAdminEmails(auth);
    if (emails.length === 0) {
      return new Err(new Error("No active workspace admin found."));
    }

    const syncRes = await syncWorkOSITContacts({ workspace, emails });
    if (syncRes.isErr()) {
      return new Err(syncRes.error);
    }

    const { created, deleted, unchanged, skippedForCap } = syncRes.value;

    const parts = [
      `created ${created.length}${created.length ? ` (${created.join(", ")})` : ""}`,
      `deleted ${deleted.length}${deleted.length ? ` (${deleted.join(", ")})` : ""}`,
      `${unchanged} unchanged`,
    ];
    if (skippedForCap.length > 0) {
      parts.push(`${skippedForCap.length} skipped (20-contact cap)`);
    }

    return new Ok({
      display: "text",
      value: `Synced ${emails.length} admin${emails.length === 1 ? "" : "s"} as WorkOS IT contacts: ${parts.join("; ")}.`,
    });
  },
});
