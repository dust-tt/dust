import { resolvePodForRuntimeOwner } from "@app/lib/api/sandbox/owner";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { PodSandboxAdapter } from "@app/lib/resources/pod_sandbox_adapter";
import type {
  EnsureSandboxResult,
  SandboxCreateBlob,
  SandboxDeleteOwner,
  SandboxLifecycleOwner,
  ScopeTransitionDestroyError,
} from "@app/lib/resources/sandbox_resource";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { SandboxOwnerModel } from "@app/lib/resources/storage/models/sandbox";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

type ConversationSandboxOwner = Pick<
  ConversationWithoutContentType,
  "id" | "sId"
>;

// The conversation's authorization scope, resolved from the database inside
// the lifecycle lock — never from the caller's conversation object, which is
// typically an agent-loop snapshot that a concurrent move can invalidate.
export type ConversationSandboxScope = {
  // The pod's space sId when the conversation lives in one.
  spaceId: string | null;
};

// The conversation vanished between the caller's read and the lock-held
// re-fetch (deleted, or no longer visible to this Authenticator). Typed so
// move callers can map it to their not-found error rather than a 500.
export class ConversationGoneError extends Error {}

type ConversationSandboxLifecycleOwner = Pick<
  ConversationResource,
  "id" | "sId" | "workspaceId"
>;

const SANDBOX_OWNER_LOOKUP_CONCURRENCY = 4;

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
  ): Promise<Result<EnsureSandboxResult<ConversationSandboxScope>, Error>> {
    return SandboxResource.ensureActive(auth, {
      lockKey: conversation.sId,
      // Runs under the lifecycle lock: the conversation's pod association is
      // an authorization input (egress claims, pod env vars, pod mounts) and
      // a move — which holds the same lock — can change it at any time
      // before the lock is acquired. Only the conversation's identity is
      // trusted from the caller.
      resolveScope: async () => {
        const fresh = await ConversationResource.fetchById(
          auth,
          conversation.sId
        );
        if (!fresh) {
          return new Err(
            new Error(`Conversation ${conversation.sId} not found.`)
          );
        }
        return new Ok({ spaceId: fresh.spaceSId });
      },
      // Factory form: the pod-scope loads only run when a sandbox is
      // actually created.
      envVars: (scope) =>
        this.buildConversationEnvVars(auth, conversation, scope),
      logLabel: "conversation",
      fetchSandbox: () => this.fetchSandbox(auth, conversation),
      createSandbox: (blob) =>
        this.createSandboxRecordForConversation(auth, conversation, blob),
    });
  }

  // Pod-level sandbox config applies to every Computer running in the Pod:
  // a conversation inside a pod receives the pod's config vars and DSEC
  // placeholders alongside its own env, same layering as pod-owned
  // sandboxes (owner layer beats the workspace layer, pod wins on name
  // collision). A conversation whose space is missing or not a project gets
  // workspace vars only — the egress-secrets file build applies the same
  // rule, keeping the file and the env consistent.
  private static async buildConversationEnvVars(
    auth: Authenticator,
    conversation: ConversationSandboxOwner,
    scope: ConversationSandboxScope
  ): Promise<Result<Record<string, string>, Error>> {
    const baseEnv = { CONVERSATION_ID: conversation.sId };

    const runtimeOwner = {
      kind: "conversation" as const,
      conversationId: conversation.sId,
      spaceId: scope.spaceId,
    };
    const podResult = await resolvePodForRuntimeOwner(auth, runtimeOwner);
    if (podResult.isErr()) {
      return podResult;
    }
    if (!podResult.value) {
      return new Ok(baseEnv);
    }

    const podScopedResult = await PodSandboxAdapter.buildPodScopedEnvVars(
      auth,
      podResult.value,
      runtimeOwner
    );
    if (podScopedResult.isErr()) {
      return podScopedResult;
    }

    return new Ok({
      ...podScopedResult.value,
      ...baseEnv,
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

  // Wraps a conversation scope transition (a move between/out of pods):
  // one lifecycle-lock hold covers re-reading the conversation, the caller's
  // validation (`prepare`), the strict sandbox destroy, and the database
  // transition (`commit`) — so a concurrent Computer command can neither
  // keep a pre-move sandbox alive nor create one from the pre-move scope,
  // and a concurrent move cannot validate against state this one changes.
  // Both callbacks receive the conversation as re-fetched UNDER the lock;
  // the caller's own conversation object is trusted for identity only. A
  // `prepare` Err aborts with the runtime untouched. See
  // SandboxResource.runScopeTransition for ordering and crash recovery.
  static async withScopeTransition<TPrep, T, E extends Error>(
    auth: Authenticator,
    conversation: ConversationSandboxOwner,
    {
      prepare,
      commit,
    }: {
      prepare: (
        freshConversation: ConversationResource
      ) => Promise<Result<TPrep, E>>;
      commit: (
        freshConversation: ConversationResource,
        prep: TPrep
      ) => Promise<Result<T, E>>;
    }
  ): Promise<
    Result<T, E | ConversationGoneError | ScopeTransitionDestroyError>
  > {
    return SandboxResource.runScopeTransition<
      { freshConversation: ConversationResource; prep: TPrep },
      T,
      E | ConversationGoneError
    >(
      auth,
      {
        lockKey: conversation.sId,
        fetchSandbox: () => this.fetchSandbox(auth, conversation),
      },
      {
        prepare: async () => {
          const freshConversation = await ConversationResource.fetchById(
            auth,
            conversation.sId
          );
          if (!freshConversation) {
            return new Err(
              new ConversationGoneError(
                `Conversation ${conversation.sId} not found.`
              )
            );
          }
          const prepResult = await prepare(freshConversation);
          if (prepResult.isErr()) {
            return prepResult;
          }
          return new Ok({ freshConversation, prep: prepResult.value });
        },
        commit: ({ freshConversation, prep }) =>
          commit(freshConversation, prep),
      }
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

  static async dangerouslyFetchConversationModelIdsBySandboxes(
    sandboxes: Pick<SandboxResource, "id" | "workspaceId">[]
  ): Promise<Map<ModelId, ModelId>> {
    if (sandboxes.length === 0) {
      return new Map();
    }

    const sandboxModelIdsByWorkspaceModelId = new Map<ModelId, ModelId[]>();
    for (const sandbox of sandboxes) {
      const sandboxModelIds =
        sandboxModelIdsByWorkspaceModelId.get(sandbox.workspaceId) ?? [];
      sandboxModelIds.push(sandbox.id);
      sandboxModelIdsByWorkspaceModelId.set(
        sandbox.workspaceId,
        sandboxModelIds
      );
    }

    const rows = (
      await concurrentExecutor(
        [...sandboxModelIdsByWorkspaceModelId.entries()],
        async ([workspaceModelId, sandboxModelIds]) =>
          SandboxOwnerModel.findAll({
            where: {
              workspaceId: workspaceModelId,
              conversationId: {
                [Op.ne]: null,
              },
              sandboxId: {
                [Op.in]: sandboxModelIds,
              },
            },
            attributes: ["sandboxId", "conversationId"],
          }),
        { concurrency: SANDBOX_OWNER_LOOKUP_CONCURRENCY }
      )
    ).flat();

    const conversationModelIdsBySandboxModelId = new Map<ModelId, ModelId>();
    for (const row of rows) {
      if (row.conversationId !== null) {
        conversationModelIdsBySandboxModelId.set(
          row.sandboxId,
          row.conversationId
        );
      }
    }

    return conversationModelIdsBySandboxModelId;
  }
}
