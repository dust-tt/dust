import type { SandboxStatus } from "@app/lib/resources/storage/models/sandbox";

export type GetConversationSandboxResponseBody = {
  sandboxStatus: SandboxStatus | null;
};
