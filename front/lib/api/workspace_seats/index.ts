import { getCachedWorkspaceActiveSeats } from "@app/lib/api/workspace_seats/cache";

export async function countActiveSeatsForWorkspace(
  workspaceId: string
): Promise<number> {
  return getCachedWorkspaceActiveSeats(workspaceId);
}
