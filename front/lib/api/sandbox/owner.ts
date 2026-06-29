import { assertNever } from "@app/types/shared/utils/assert_never";

export type SandboxRuntimeOwner =
  | { kind: "conversation"; conversationId: string }
  | { kind: "pod"; spaceId: string };

export function getSandboxOwnerEnvVars(
  owner: SandboxRuntimeOwner
): Record<string, string> {
  switch (owner.kind) {
    case "conversation":
      return { CONVERSATION_ID: owner.conversationId };

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
