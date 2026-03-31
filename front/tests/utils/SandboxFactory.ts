import type { Authenticator } from "@app/lib/auth";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import type { SandboxStatus } from "@app/lib/resources/storage/models/sandbox";
import { SandboxModel } from "@app/lib/resources/storage/models/sandbox";
import type { ConversationType } from "@app/types/assistant/conversation";

export class SandboxFactory {
  static async create(
    auth: Authenticator,
    conversation: ConversationType,
    opts?: {
      status?: SandboxStatus;
      statusChangedAt?: Date | null;
    }
  ): Promise<SandboxResource> {
    const sandbox = await SandboxResource.makeNew(auth, {
      conversationId: conversation.id,
      providerId: `test-provider-${Date.now()}`,
      status: opts?.status ?? "running",
    });

    if (opts?.statusChangedAt !== undefined) {
      await SandboxModel.update(
        { statusChangedAt: opts.statusChangedAt } as Partial<SandboxModel>,
        { where: { id: sandbox.id } }
      );
    }

    const result = await SandboxResource.fetchByConversationId(
      auth,
      conversation.sId
    );
    if (!result) {
      throw new Error("Sandbox not found after creation");
    }
    return result;
  }
}
