import type { Authenticator } from "@app/lib/auth";
import {
  type EnsureSandboxResult,
  type SandboxCreateBlob,
  type SandboxDeleteOwner,
  type SandboxLifecycleOwner,
  SandboxResource,
} from "@app/lib/resources/sandbox_resource";
import { SandboxOwnerModel } from "@app/lib/resources/storage/models/sandbox";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import type { Transaction } from "sequelize";

type ConversationSandboxOwner = Pick<
  ConversationWithoutContentType,
  "id" | "sId"
>;

type ConversationSandboxLifecycleOwner = ConversationSandboxOwner & {
  workspaceId: ModelId;
};

export class ConversationSandboxAdapter {
  private static async fetchSandboxByConversation(
    auth: Authenticator,
    conversation: ConversationSandboxOwner
  ): Promise<SandboxResource | null> {
    const workspaceModelId = auth.getNonNullableWorkspace().id;
    const link = await SandboxOwnerModel.findOne({
      where: {
        conversationId: conversation.id,
        workspaceId: workspaceModelId,
      },
    });

    if (!link) {
      return null;
    }

    return SandboxResource.fetchByModelIdForWorkspace(auth, link.sandboxId);
  }

  private static async dangerouslyFetchSandboxByConversation(
    conversation: ConversationSandboxLifecycleOwner
  ): Promise<SandboxResource | null> {
    const link = await SandboxOwnerModel.findOne({
      where: {
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
      },
    });

    if (!link) {
      return null;
    }

    return SandboxResource.dangerouslyFetchByModelIdForWorkspace({
      sandboxModelId: link.sandboxId,
      workspaceModelId: conversation.workspaceId,
    });
  }

  private static async createSandboxRecordForConversation(
    auth: Authenticator,
    conversation: ConversationSandboxOwner,
    blob: SandboxCreateBlob
  ): Promise<SandboxResource> {
    const workspaceModelId = auth.getNonNullableWorkspace().id;

    return withTransaction(async (transaction) => {
      const sandbox = await SandboxResource.makeNew(auth, blob, {
        transaction,
      });

      await SandboxOwnerModel.create(
        {
          workspaceId: workspaceModelId,
          conversationId: conversation.id,
          sandboxId: sandbox.id,
        },
        { transaction }
      );

      return sandbox;
    });
  }

  private static toSandboxLifecycleOwner(
    conversation: ConversationSandboxLifecycleOwner
  ): SandboxLifecycleOwner {
    return {
      lockKey: conversation.sId,
      fetchSandbox: () =>
        this.dangerouslyFetchSandboxByConversation(conversation),
    };
  }

  private static toSandboxDeleteOwner(
    auth: Authenticator,
    conversation: ConversationSandboxOwner
  ): SandboxDeleteOwner {
    return {
      lockKey: conversation.sId,
      fetchSandbox: () => this.fetchSandboxByConversation(auth, conversation),
      deleteSandbox: async (
        sandbox: SandboxResource,
        transaction: Transaction
      ) => {
        await SandboxOwnerModel.destroy({
          where: {
            conversationId: conversation.id,
            sandboxId: sandbox.id,
            workspaceId: auth.getNonNullableWorkspace().id,
          },
          transaction,
        });
      },
    };
  }

  static async fetchSandbox(
    auth: Authenticator,
    conversation: ConversationSandboxOwner
  ): Promise<SandboxResource | null> {
    return this.fetchSandboxByConversation(auth, conversation);
  }

  static async ensureSandboxActive(
    auth: Authenticator,
    conversation: ConversationSandboxOwner
  ): Promise<Result<EnsureSandboxResult, Error>> {
    return SandboxResource.ensureActive(auth, {
      lockKey: conversation.sId,
      envVars: { CONVERSATION_ID: conversation.sId },
      logLabel: "conversation",
      fetchSandbox: () => this.fetchSandbox(auth, conversation),
      createSandbox: (blob) =>
        this.createSandboxRecordForConversation(auth, conversation, blob),
    });
  }

  static async pauseSandboxForApproval(
    auth: Authenticator,
    conversation: ConversationSandboxOwner
  ): Promise<Result<void, Error>> {
    return SandboxResource.pauseForApproval(auth, {
      lockKey: conversation.sId,
      fetchSandbox: () => this.fetchSandboxByConversation(auth, conversation),
    });
  }

  static async deleteSandbox(
    auth: Authenticator,
    conversation: ConversationSandboxOwner
  ): Promise<Result<void, Error>> {
    return SandboxResource.deleteByOwner(
      auth,
      this.toSandboxDeleteOwner(auth, conversation)
    );
  }

  static async dangerouslySleepSandboxIfRunning(
    auth: Authenticator,
    conversation: ConversationSandboxLifecycleOwner
  ): Promise<Result<void, Error>> {
    return SandboxResource.dangerouslySleepIfRunning(
      auth,
      this.toSandboxLifecycleOwner(conversation)
    );
  }

  static async dangerouslySleepSandboxIfPendingApproval(
    auth: Authenticator,
    conversation: ConversationSandboxLifecycleOwner
  ): Promise<Result<void, Error>> {
    return SandboxResource.dangerouslySleepIfPendingApproval(
      auth,
      this.toSandboxLifecycleOwner(conversation)
    );
  }

  static async dangerouslyDestroySandboxIfSleeping(
    auth: Authenticator,
    conversation: ConversationSandboxLifecycleOwner
  ): Promise<Result<void, Error>> {
    return SandboxResource.dangerouslyDestroyIfSleeping(
      auth,
      this.toSandboxLifecycleOwner(conversation)
    );
  }

  static async dangerouslyDestroySandboxIfKillRequested(
    auth: Authenticator,
    conversation: ConversationSandboxLifecycleOwner
  ): Promise<Result<void, Error>> {
    return SandboxResource.dangerouslyDestroyIfKillRequested(
      auth,
      this.toSandboxLifecycleOwner(conversation)
    );
  }
}
