import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import type { SandboxStatus } from "@app/lib/resources/storage/models/sandbox";
import { SandboxModel } from "@app/lib/resources/storage/models/sandbox";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";

export class SandboxFactory {
  static async create(
    auth: Authenticator,
    conversation: ConversationWithoutContentType,
    opts?: {
      status?: SandboxStatus;
      statusChangedAt?: Date | null;
      baseImage?: string;
      version?: string;
      killRequestedAt?: Date | null;
    }
  ): Promise<SandboxResource> {
    const sandbox = await SandboxResource.makeNew(auth, {
      conversationId: conversation.id,
      providerId: `test-provider-${Date.now()}`,
      status: opts?.status ?? "running",
      baseImage: opts?.baseImage ?? "dust-base",
      version: opts?.version ?? "0.0.0-test",
    });

    if (opts?.statusChangedAt !== undefined) {
      await SandboxModel.update(
        { statusChangedAt: opts.statusChangedAt } as Partial<SandboxModel>,
        { where: { id: sandbox.id } }
      );
    }

    if (opts?.killRequestedAt !== undefined) {
      await SandboxModel.update(
        { killRequestedAt: opts.killRequestedAt } as Partial<SandboxModel>,
        { where: { id: sandbox.id } }
      );
    }

    const result = await ConversationResource.fetchSandbox(auth, conversation);
    if (!result) {
      throw new Error("Sandbox not found after creation");
    }
    return result;
  }
}
