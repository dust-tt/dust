import type { Authenticator } from "@app/lib/auth";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { SandboxOwnerModel } from "@app/lib/resources/storage/models/sandbox";
import type { Result } from "@app/types/shared/result";

/**
 * Teardown for pod-owned sandboxes, which no longer exist as an owner kind.
 *
 * Nothing creates one any more, but a pod that booted a sandbox before the kind was removed still
 * holds the provider sandbox and its `sandbox_owners` row. Destroying the provider sandbox is what
 * stops it being stranded: with no owner adapter left, the reaper skips it forever.
 *
 * `dropOwnerLink` says who removes the `sandbox_owners` row. Pod deletion leaves it to
 * `SpaceResource.delete`, which has to drop it anyway (the FK is `onDelete: "RESTRICT"`); the
 * backfill script keeps the pod, so it drops the row itself.
 *
 * Delete this module once production holds no `sandbox_owners` row with a `spaceId`.
 */
export async function deleteLegacyPodOwnedSandbox(
  auth: Authenticator,
  pod: SpaceResource,
  { dropOwnerLink = false }: { dropOwnerLink?: boolean } = {}
): Promise<Result<undefined, Error>> {
  const workspaceModelId = auth.getNonNullableWorkspace().id;

  return SandboxResource.deleteByOwner(auth, {
    lockKey: pod.sId,
    fetchSandbox: async () => {
      const link = await SandboxOwnerModel.findOne({
        where: { spaceId: pod.id, workspaceId: workspaceModelId },
      });
      if (!link) {
        return null;
      }
      return SandboxResource.fetchByModelIdForWorkspace(auth, link.sandboxId);
    },
    deleteSandbox: async (sandbox, transaction) => {
      if (!dropOwnerLink) {
        return;
      }
      await SandboxOwnerModel.destroy({
        where: {
          spaceId: pod.id,
          sandboxId: sandbox.id,
          workspaceId: workspaceModelId,
        },
        transaction,
      });
    },
  });
}
