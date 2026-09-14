import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

export type SandboxRuntimeOwner =
  // `spaceId` is the space the owner lives in (a pod when it is a project
  // space). Pod-level sandbox config — egress policy, env vars, HTTPS
  // secrets — applies to every Computer running in the Pod, so every
  // sandbox carries its pod alongside its own identity.
  | { kind: "conversation"; conversationId: string; spaceId: string | null }
  | { kind: "frame"; frameId: string; spaceId: string | null };

// Resolves the pod a sandbox runs in, if any. Pod-level config (env vars,
// HTTPS secrets, egress policy) applies to every Computer running in the
// Pod, so every consumer of pod-scoped config resolves through this one
// rule: an owner whose space is missing or not a project simply has no pod
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

    default:
      assertNever(owner);
  }
}
