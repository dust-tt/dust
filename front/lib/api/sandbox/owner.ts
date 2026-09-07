import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

export type SandboxRuntimeOwner =
  // `spaceId` is the space the conversation lives in (a pod when it is a
  // project space). Pod-level sandbox config — egress policy, env vars,
  // HTTPS secrets — applies to every Computer running in the Pod, so
  // conversation-owned sandboxes carry their pod alongside pod-owned ones.
  | { kind: "conversation"; conversationId: string; spaceId: string | null }
  | { kind: "frame"; frameId: string; spaceId: string | null }
  | { kind: "pod"; spaceId: string };

// Resolves the pod a sandbox runs in, if any. Pod-level config (env vars,
// HTTPS secrets, egress policy) applies to every Computer running in the
// Pod, so every consumer of pod-scoped config resolves through this one
// rule: a pod-owned sandbox without its pod space is nonsense and errors; a
// conversation whose space is missing or not a project simply has no pod
// (workspace config only).
export async function resolvePodForRuntimeOwner(
  auth: Authenticator,
  owner: SandboxRuntimeOwner
): Promise<Result<SpaceResource | null, Error>> {
  // SpaceResource.fetchById is workspace-scoped but intentionally does not
  // permission-filter. Runtime configuration belongs to the owner and must
  // not vary with the caller who triggered execution.
  switch (owner.kind) {
    case "conversation": {
      if (!owner.spaceId) {
        return new Ok(null);
      }
      const pod = await SpaceResource.fetchById(auth, owner.spaceId);
      return new Ok(pod?.isProject() ? pod : null);
    }

    case "frame": {
      if (!owner.spaceId) {
        return new Ok(null);
      }
      const pod = await SpaceResource.fetchById(auth, owner.spaceId);
      return new Ok(pod?.isProject() ? pod : null);
    }

    case "pod": {
      const pod = await SpaceResource.fetchById(auth, owner.spaceId);
      if (!pod || !pod.isProject()) {
        return new Err(
          new Error(`Pod space ${owner.spaceId} not found for sandbox owner.`)
        );
      }
      return new Ok(pod);
    }

    default:
      assertNever(owner);
  }
}

export function getSandboxOwnerEnvVars(
  owner: SandboxRuntimeOwner
): Record<string, string> {
  switch (owner.kind) {
    case "conversation":
      return { CONVERSATION_ID: owner.conversationId };

    case "frame":
      return { FRAME_ID: owner.frameId };

    case "pod":
      return { SPACE_ID: owner.spaceId };

    default:
      assertNever(owner);
  }
}

export function getSandboxOwnerLogContext(
  owner: SandboxRuntimeOwner
): Record<string, string> {
  switch (owner.kind) {
    case "conversation":
      return { conversationId: owner.conversationId };

    case "frame":
      return { frameId: owner.frameId };

    case "pod":
      return { spaceId: owner.spaceId };

    default:
      assertNever(owner);
  }
}

export function getSandboxOwnerEnvManifestEntries(
  owner: SandboxRuntimeOwner
): { name: string; description: string }[] {
  switch (owner.kind) {
    case "conversation":
      return [
        {
          name: "CONVERSATION_ID",
          description: "current conversation sId",
        },
      ];

    case "frame":
      return [
        {
          name: "FRAME_ID",
          description: "current Frame sId",
        },
      ];

    case "pod":
      return [
        {
          name: "SPACE_ID",
          description: "current pod space sId",
        },
      ];

    default:
      assertNever(owner);
  }
}
