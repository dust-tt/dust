import type { Authenticator } from "@app/lib/auth";
import { ConversationSandboxAdapter } from "@app/lib/resources/conversation_sandbox_adapter";
import { PodSandboxAdapter } from "@app/lib/resources/pod_sandbox_adapter";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { SandboxStatus } from "@app/lib/resources/storage/models/sandbox";
import {
  SandboxModel,
  SandboxOwnerModel,
} from "@app/lib/resources/storage/models/sandbox";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";

export class SandboxFactory {
  private static async linkSandboxOwner(
    workspaceId: number,
    sandboxId: number,
    conversationId?: number,
    spaceId?: number
  ): Promise<void> {
    await withTransaction(async () => {
      await SandboxOwnerModel.create({
        workspaceId,
        conversationId,
        spaceId,
        sandboxId,
      });
    });
  }
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
      providerId: `test-provider-${Date.now()}`,
      status: opts?.status ?? "running",
      baseImage: opts?.baseImage ?? "dust-base",
      version: opts?.version ?? "0.0.0-test",
    });

    await this.linkSandboxOwner(
      auth.getNonNullableWorkspace().id,
      sandbox.id,
      conversation.id
    );

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

    const result = await ConversationSandboxAdapter.fetchSandbox(
      auth,
      conversation
    );
    if (!result) {
      throw new Error("Sandbox not found after creation");
    }
    return result;
  }

  static async createForPod(
    auth: Authenticator,
    pod: SpaceResource,
    opts?: {
      status?: SandboxStatus;
      baseImage?: string;
      version?: string;
    }
  ): Promise<SandboxResource> {
    const sandbox = await SandboxResource.makeNew(auth, {
      providerId: `test-provider-${Date.now()}`,
      status: opts?.status ?? "running",
      baseImage: opts?.baseImage ?? "dust-base",
      version: opts?.version ?? "0.0.0-test",
    });

    await this.linkSandboxOwner(
      auth.getNonNullableWorkspace().id,
      sandbox.id,
      undefined,
      pod.id
    );

    const result = await PodSandboxAdapter.fetchSandbox(auth, pod);
    if (!result) {
      throw new Error("Pod sandbox not found after creation");
    }
    return result;
  }
}
