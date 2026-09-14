import { useRunPokePlugin } from "@app/poke/swr/plugins";
import type { MembershipSeatType } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { ActiveRoleType, WorkspaceType } from "@app/types/user";

// All member mutations (per-row and bulk) go through the "batch-update-members"
// poke plugin, so they share one code path, one permission gate, and one run
// history — instead of bespoke poke endpoints.
const PLUGIN_ID = "batch-update-members";

export type BatchMemberUpdate =
  | { action: "update_role"; role: ActiveRoleType }
  | { action: "update_seat"; seatType: MembershipSeatType }
  | { action: "revoke" };

interface BatchMemberResultRow {
  identifier: string;
  email?: string;
  status: string;
  error?: string;
}

function isResultRow(row: unknown): row is BatchMemberResultRow {
  return (
    typeof row === "object" &&
    row !== null &&
    "identifier" in row &&
    "status" in row
  );
}

export function useBatchUpdateMembers({ owner }: { owner: WorkspaceType }) {
  const { doRunPlugin } = useRunPokePlugin({
    pluginId: PLUGIN_ID,
    pluginResourceTarget: {
      resourceType: "workspaces",
      resourceId: owner.sId,
      workspace: owner,
    },
  });

  // Runs the plugin for the given user IDs and returns the per-member outcomes,
  // or an Err with the plugin-level error message. Passing user IDs (rather than
  // emails) targets the exact account even when several share an email.
  const runBatchUpdate = async (
    update: BatchMemberUpdate,
    userIds: string[]
  ): Promise<Result<BatchMemberResultRow[], string>> => {
    const res = await doRunPlugin({
      action: [update.action],
      role: update.action === "update_role" ? [update.role] : [],
      seatType: update.action === "update_seat" ? [update.seatType] : [],
      members: userIds.join("\n"),
      immediate: true,
    });
    if (res.isErr()) {
      return new Err(res.error);
    }

    const result = res.value;
    const rows =
      result.display === "json" && Array.isArray(result.value.results)
        ? result.value.results
        : [];
    return new Ok(rows.filter(isResultRow));
  };

  return { runBatchUpdate };
}
