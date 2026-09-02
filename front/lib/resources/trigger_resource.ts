import type { AuditAction } from "@app/lib/api/audit/workos_audit";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import { Authenticator, hasFeatureFlag } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { TriggerModel } from "@app/lib/models/agent/triggers/triggers";
import { WebhookRequestModel } from "@app/lib/models/agent/triggers/webhook_request";
import { WebhookRequestTriggerModel } from "@app/lib/models/agent/triggers/webhook_request_trigger";
import { WebhookSourcesViewModel } from "@app/lib/models/agent/triggers/webhook_sources_view";
import { BaseResource } from "@app/lib/resources/base_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import {
  createOrUpdateAgentSchedule,
  deleteTriggerSchedule,
} from "@app/temporal/triggers/schedule_client";
import type {
  BulkTriggerUpdateOutcome,
  ScheduleConfig,
  TriggerExecutionMode,
  TriggerKind,
  TriggerStatus,
  TriggerType,
  WebhookConfig,
} from "@app/types/assistant/triggers";
import {
  availableTriggerExecutionModes,
  getTriggerStatusOwner,
  NO_TRIGGER_EXECUTION_MODE_AVAILABLE_MESSAGE,
  TRIGGER_EXECUTION_MODE_UNAVAILABLE_MESSAGES,
} from "@app/types/assistant/triggers";
import { isCreditPricedPlan } from "@app/types/plan";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { UserType } from "@app/types/user";
import assert from "assert";
import type {
  Attributes,
  CreationAttributes,
  InferAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { Op } from "sequelize";

// A trigger's Pod may be any open Pod in the workspace, or a restricted Pod the
// caller is a member of. This is intentionally broader than the member-only check
// used by the conversations/create MCP tool.
export async function resolveTriggerSpaceId(
  auth: Authenticator,
  spaceId: string | null | undefined
): Promise<Result<ModelId | null, string>> {
  if (!spaceId) {
    return new Ok(null);
  }

  const pod = await SpaceResource.fetchById(auth, spaceId);
  if (!pod || !pod.isProject() || !auth.can("read", pod)) {
    return new Err("Pod not found or not accessible.");
  }

  return new Ok(pod.id);
}

export class TriggerExecutionModeForbiddenError extends Error {}

const BULK_TRIGGER_AUDIT_CONCURRENCY = 10;

function emitBulkTriggerAuditLogEvents(
  auth: Authenticator,
  triggers: TriggerResource[],
  toEvent: (trigger: TriggerResource) => {
    action: AuditAction;
    metadata: Record<string, string>;
  }
): Promise<void[]> {
  const workspace = auth.getNonNullableWorkspace();

  return concurrentExecutor(
    triggers,
    async (trigger) => {
      const { action, metadata } = toEvent(trigger);
      return emitAuditLogEvent({
        auth,
        action,
        targets: [
          buildAuditLogTarget("workspace", workspace),
          buildAuditLogTarget("trigger", {
            sId: trigger.sId,
            name: trigger.name,
          }),
        ],
        metadata,
      });
    },
    { concurrency: BULK_TRIGGER_AUDIT_CONCURRENCY }
  );
}

async function availableExecutionModes(
  auth: Authenticator
): Promise<TriggerExecutionMode[]> {
  return availableTriggerExecutionModes({
    isPlanCreditPriced: isCreditPricedPlan(auth.getNonNullablePlan()),
    hasLegacyTriggerLimits: await hasFeatureFlag(auth, "legacy_trigger_limits"),
    canUseWorkspacePool: await auth.hasWorkspacePermission(
      "use_workspace_pool",
      "trigger"
    ),
  });
}

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface TriggerResource extends ReadonlyAttributesType<TriggerModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class TriggerResource extends BaseResource<TriggerModel> {
  static model: ModelStatic<TriggerModel> = TriggerModel;

  constructor(
    model: ModelStatic<TriggerModel>,
    blob: Attributes<TriggerModel>
  ) {
    super(TriggerModel, blob);
  }

  static async makeNew(
    auth: Authenticator,
    blob: Omit<CreationAttributes<TriggerModel>, "executionMode"> & {
      executionMode?: TriggerExecutionMode;
    },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<TriggerResource, Error>> {
    const executionModes = await availableExecutionModes(auth);
    const executionMode = blob.executionMode ?? executionModes[0];
    if (!executionMode) {
      return new Err(
        new TriggerExecutionModeForbiddenError(
          NO_TRIGGER_EXECUTION_MODE_AVAILABLE_MESSAGE
        )
      );
    }
    if (!executionModes.includes(executionMode)) {
      return new Err(
        new TriggerExecutionModeForbiddenError(
          TRIGGER_EXECUTION_MODE_UNAVAILABLE_MESSAGES[executionMode]
        )
      );
    }

    const trigger = await TriggerModel.create(
      { ...blob, executionMode },
      { transaction }
    );

    const resource = new this(TriggerModel, trigger.get());

    if (resource.status === "enabled") {
      const r = await resource.upsertTemporalWorkflow(auth);
      if (r.isErr()) {
        return r;
      }
    }

    void emitAuditLogEvent({
      auth,
      action: "trigger.created",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("trigger", {
          sId: resource.sId,
          name: resource.name,
        }),
      ],
      metadata: {
        trigger_type: resource.kind,
        agent_id: resource.agentConfigurationId,
      },
    });

    return new Ok(resource);
  }

  get sId(): string {
    return TriggerResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  isEditedBy(auth: Authenticator): boolean {
    return this.editor === auth.getNonNullableUser().id;
  }

  canUpdateStatusTo(auth: Authenticator, to: TriggerStatus): boolean {
    if (this.status === to) {
      return true;
    }
    return [this.status, to].every(
      (s) => getTriggerStatusOwner(s) === "editor" || auth.isManager()
    );
  }

  // The editing path never crosses system-owned statuses; only restore jobs
  // do, via enable()/disable().
  isSystemStatusTransitionTo(to: TriggerStatus): boolean {
    return (
      this.status !== to &&
      [this.status, to].some((s) => getTriggerStatusOwner(s) === "system")
    );
  }

  private static async baseFetch(
    auth: Authenticator,
    options: ResourceFindOptions<TriggerModel> = {}
  ) {
    const workspace = auth.getNonNullableWorkspace();

    const res = await this.model.findAll({
      where: {
        ...options.where,
        workspaceId: workspace.id,
      },
      limit: options.limit,
    });

    return res.map((c) => new this(this.model, c.get()));
  }

  static async fetchByIds(auth: Authenticator, sIds: string[]) {
    const ids = sIds
      .map((sId) => getResourceIdFromSId(sId))
      .filter((id): id is number => id !== null);

    return this.baseFetch(auth, {
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: ids,
      },
    });
  }

  static async fetchById(
    auth: Authenticator,
    sId: string
  ): Promise<TriggerResource | null> {
    const res = await this.fetchByIds(auth, [sId]);
    return res.length > 0 ? res[0] : null;
  }

  static async fetchByModelIds(
    auth: Authenticator,
    ids: ModelId[]
  ): Promise<TriggerResource[]> {
    return this.baseFetch(auth, {
      where: { id: ids },
    });
  }

  static async fetchByConversationId(
    auth: Authenticator,
    conversationId: string
  ): Promise<TriggerResource | null> {
    const workspace = auth.getNonNullableWorkspace();

    const trigger = await this.model.findOne({
      where: { workspaceId: workspace.id },
      include: [
        {
          model: ConversationModel,
          as: "conversations",
          required: true,
          attributes: [],
          where: { workspaceId: workspace.id, sId: conversationId },
        },
      ],
    });

    return trigger ? new this(this.model, trigger.get()) : null;
  }

  static listByAgentConfigurationId(
    auth: Authenticator,
    agentConfigurationId: string
  ) {
    return this.baseFetch(auth, {
      where: {
        agentConfigurationId,
      },
    });
  }

  static async listByAgentConfigurationIds(
    auth: Authenticator,
    agentConfigurationIds: string[]
  ): Promise<TriggerResource[]> {
    if (agentConfigurationIds.length === 0) {
      return [];
    }

    return this.baseFetch(auth, {
      where: {
        agentConfigurationId: agentConfigurationIds,
      },
    });
  }

  static async listByAgentConfigurationIdAndEditors(
    auth: Authenticator,
    {
      agentConfigurationId,
      editorIds,
    }: {
      agentConfigurationId: string;
      editorIds: ModelId[];
    }
  ): Promise<Result<TriggerResource[], Error>> {
    if (editorIds.length === 0) {
      return new Ok([]);
    }
    const triggers = await this.baseFetch(auth, {
      where: {
        agentConfigurationId,
        editor: { [Op.in]: editorIds },
      },
    });
    return new Ok(triggers);
  }

  static listByWorkspace(auth: Authenticator) {
    return this.baseFetch(auth);
  }

  static async countForWorkspace(
    auth: Authenticator
  ): Promise<{ enabled: number; total: number; workspacePool: number }> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const triggers = await this.model.findAll({
      attributes: ["status", "executionMode"],
      where: { workspaceId },
    });

    let enabled = 0;
    let workspacePool = 0;
    for (const trigger of triggers) {
      if (trigger.status === "enabled") {
        enabled++;
      }
      if (trigger.executionMode === "workspace_pool") {
        workspacePool++;
      }
    }

    return { enabled, total: triggers.length, workspacePool };
  }

  static listByWorkspaceAndKindsAndExecutionModes(
    auth: Authenticator,
    {
      kinds,
      executionModes,
    }: { kinds?: TriggerKind[]; executionModes?: TriggerExecutionMode[] }
  ): Promise<TriggerResource[]> {
    return this.baseFetch(auth, {
      where: {
        ...(kinds?.length ? { kind: { [Op.in]: kinds } } : {}),
        ...(executionModes?.length
          ? { executionMode: { [Op.in]: executionModes } }
          : {}),
      },
    });
  }

  static listByWorkspaceAndNameSearch(
    auth: Authenticator,
    search: string
  ): Promise<TriggerResource[]> {
    return this.baseFetch(auth, {
      where: { name: { [Op.iLike]: `%${search}%` } },
    });
  }

  static async listBySpace(
    auth: Authenticator,
    spaceId: ModelId
  ): Promise<TriggerResource[]> {
    return this.baseFetch(auth, {
      where: {
        spaceId,
      },
    });
  }

  static async listByWebhookSourceViewId(
    auth: Authenticator,
    webhookSourceViewId: ModelId
  ) {
    return this.listByWebhookSourceViewIds(auth, [webhookSourceViewId]);
  }

  static async listByWebhookSourceViewIds(
    auth: Authenticator,
    webhookSourceViewIds: ModelId[]
  ) {
    if (webhookSourceViewIds.length === 0) {
      return [];
    }

    return this.baseFetch(auth, {
      where: {
        webhookSourceViewId: { [Op.in]: webhookSourceViewIds },
        kind: "webhook",
      },
    });
  }

  static async listByUserEditor(
    auth: Authenticator,
    user: UserResource | UserType
  ) {
    assert(
      auth.isManager() || auth.user()?.id === user.id,
      "Triggers can only be listed by admins or by their editor."
    );

    return this.baseFetch(auth, {
      where: {
        editor: user.id,
      },
    });
  }

  /**
   * Returns minimal trigger data for webhook source usage queries.
   * Used by getWebhookSourcesUsage() for performance-optimized queries.
   */
  static async listWebhookTriggersForUsageQuery(auth: Authenticator): Promise<
    Array<{
      webhookSourceViewId: ModelId | null;
      agentConfigurationId: string;
    }>
  > {
    const workspace = auth.getNonNullableWorkspace();

    return (await this.model.findAll({
      raw: true,
      attributes: ["webhookSourceViewId", "agentConfigurationId"],
      where: {
        workspaceId: workspace.id,
        kind: "webhook",
        status: "enabled",
        webhookSourceViewId: {
          [Op.ne]: null,
        },
      },
    })) as Array<{
      webhookSourceViewId: ModelId | null;
      agentConfigurationId: string;
    }>;
  }

  /**
   * DANGEROUS: Lists triggers across workspaces for maintenance scripts.
   * Should only be used in scripts, never in API routes or lib/api.
   */
  static async listAllForScript(options?: {
    workspaceId?: ModelId;
    status?: TriggerStatus;
  }): Promise<TriggerResource[]> {
    const where: {
      workspaceId?: ModelId;
      status?: TriggerStatus;
    } = {};

    if (options?.workspaceId) {
      where.workspaceId = options.workspaceId;
    }
    if (options?.status) {
      where.status = options.status;
    }

    const res = await this.model.findAll({
      where,
    });

    return res.map((c) => new this(this.model, c.get()));
  }

  static async update(
    auth: Authenticator,
    sId: string,
    blob: Partial<InferAttributes<TriggerModel, { omit: "workspaceId" }>>,
    transaction?: Transaction
  ) {
    const trigger = await this.fetchById(auth, sId);
    if (!trigger) {
      return new Err(new Error(`Trigger with sId ${sId} not found`));
    }

    if (
      !auth.isAdmin() &&
      (!trigger.editor || trigger.editor !== auth.getNonNullableUser().id)
    ) {
      return new Err(
        new Error("Only the editor of the trigger can update the trigger")
      );
    }

    if (
      blob.status !== undefined &&
      trigger.isSystemStatusTransitionTo(blob.status)
    ) {
      return new Err(
        new Error(
          "This trigger's status is managed by Dust and cannot be changed"
        )
      );
    }

    if (
      blob.status !== undefined &&
      !trigger.canUpdateStatusTo(auth, blob.status)
    ) {
      return new Err(
        new Error("You don't have permission to change this trigger's status")
      );
    }

    const previousStatus = trigger.status;

    await trigger.update(blob, transaction);

    // Log status changes when update includes a status change
    if (blob.status !== undefined && blob.status !== previousStatus) {
      logger.info(
        {
          triggerId: trigger.sId,
          triggerName: trigger.name,
          triggerKind: trigger.kind,
          previousStatus,
          newStatus: blob.status,
          workspaceId: auth.getNonNullableWorkspace().sId,
          agentConfigurationId: trigger.agentConfigurationId,
          editorId: trigger.editor,
          userId: auth.getNonNullableUser().sId,
        },
        `Trigger status changed: ${blob.status}`
      );

      void emitAuditLogEvent({
        auth,
        action:
          blob.status === "enabled" ? "trigger.enabled" : "trigger.disabled",
        targets: [
          buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
          buildAuditLogTarget("trigger", {
            sId: trigger.sId,
            name: trigger.name,
          }),
        ],
        metadata: {
          trigger_type: trigger.kind,
          agent_id: trigger.agentConfigurationId,
          status: blob.status,
        },
      });
    }

    let r = null;
    if (trigger.status === "enabled") {
      r = await trigger.upsertTemporalWorkflow(auth);
    } else {
      r = await trigger.removeTemporalWorkflow(auth);
    }
    if (r.isErr()) {
      return r;
    }

    return new Ok(trigger);
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction | undefined } = {}
  ): Promise<Result<undefined, Error>> {
    return TriggerResource.deleteMany(auth, [this], { transaction });
  }

  private static async deleteWebhookRequestsForSourceViews(
    auth: Authenticator,
    webhookSourceViewIds: ModelId[],
    transaction?: Transaction
  ): Promise<Result<undefined, Error>> {
    if (webhookSourceViewIds.length === 0) {
      return new Ok(undefined);
    }

    const workspaceId = auth.getNonNullableWorkspace().id;
    const webhookSourceViews = await WebhookSourcesViewModel.findAll({
      attributes: ["id", "webhookSourceId"],
      where: {
        id: { [Op.in]: webhookSourceViewIds },
        workspaceId,
      },
      transaction,
    });

    if (webhookSourceViews.length !== webhookSourceViewIds.length) {
      return new Err(new Error("Webhook source view not found"));
    }

    const webhookRequests = await WebhookRequestModel.findAll({
      attributes: ["id"],
      where: {
        workspaceId,
        webhookSourceId: {
          [Op.in]: webhookSourceViews.map((view) => view.webhookSourceId),
        },
      },
      transaction,
    });

    if (webhookRequests.length === 0) {
      return new Ok(undefined);
    }

    const webhookRequestIds = webhookRequests.map((request) => request.id);
    await WebhookRequestTriggerModel.destroy({
      where: {
        workspaceId,
        webhookRequestId: { [Op.in]: webhookRequestIds },
      },
      transaction,
    });
    await WebhookRequestModel.destroy({
      where: {
        workspaceId,
        id: { [Op.in]: webhookRequestIds },
      },
      transaction,
    });

    return new Ok(undefined);
  }

  static async deleteMany(
    auth: Authenticator,
    triggers: TriggerResource[],
    { transaction }: { transaction?: Transaction | undefined } = {}
  ): Promise<Result<undefined, Error>> {
    if (triggers.length === 0) {
      return new Ok(undefined);
    }

    const owner = auth.getNonNullableWorkspace();

    for (const trigger of triggers) {
      const r = await trigger.removeTemporalWorkflow(auth);
      if (r.isErr()) {
        return r;
      }
    }

    const webhookSourceViewIds = [
      ...new Set(
        triggers.flatMap((trigger) =>
          trigger.kind === "webhook" && trigger.webhookSourceViewId
            ? [trigger.webhookSourceViewId]
            : []
        )
      ),
    ];
    const webhookRequestsDeletion =
      await this.deleteWebhookRequestsForSourceViews(
        auth,
        webhookSourceViewIds,
        transaction
      );
    if (webhookRequestsDeletion.isErr()) {
      return webhookRequestsDeletion;
    }

    const triggerIds = triggers.map((trigger) => trigger.id);
    await TriggerModel.destroy({
      where: {
        id: { [Op.in]: triggerIds },
        workspaceId: owner.id,
      },
      transaction,
    });

    for (const trigger of triggers) {
      void emitAuditLogEvent({
        auth,
        action: "trigger.deleted",
        targets: [
          buildAuditLogTarget("workspace", owner),
          buildAuditLogTarget("trigger", {
            sId: trigger.sId,
            name: trigger.name,
          }),
        ],
        metadata: {
          trigger_type: trigger.kind,
          agent_id: trigger.agentConfigurationId,
        },
      });
    }

    return new Ok(undefined);
  }

  static async deleteAllForWorkspace(
    auth: Authenticator
  ): Promise<Result<undefined, Error>> {
    const triggers = await this.listByWorkspace(auth);
    if (triggers.length === 0) {
      return new Ok(undefined);
    }

    const r = await concurrentExecutor(
      triggers,
      async (trigger) => {
        return trigger.delete(auth);
      },
      {
        concurrency: 4,
      }
    );

    if (r.some((res) => res.isErr())) {
      return new Err(
        new Error(
          `Failed to delete ${r.filter((res) => res.isErr()).length} triggers`
        )
      );
    }
    return new Ok(undefined);
  }

  /**
   * Transfers editorship of every trigger owned by `fromUser` to `toUser`, in
   * the current workspace. Used by the user identity merge: without this the
   * triggers stay on the merged-away identity, become unmanageable by the
   * surviving one, and are deleted outright if the secondary user is revoked
   * (see `revokeAndTrackMembership`).
   *
   * Schedule triggers bake the editor's sId into the Temporal schedule's
   * workflow args, so the schedule is re-upserted with the new editor's auth;
   * webhook triggers resolve their editor at fire time and need nothing extra.
   */
  static async transferEditor(
    auth: Authenticator,
    {
      fromUser,
      toUser,
    }: {
      fromUser: UserResource;
      toUser: UserResource;
    }
  ): Promise<Result<undefined, Error>> {
    assert(
      auth.isAdmin(),
      "Trigger editorship can only be transferred by admins."
    );

    const workspace = auth.getNonNullableWorkspace();

    const [, updatedRows] = await this.model.update(
      { editor: toUser.id },
      {
        where: {
          workspaceId: workspace.id,
          editor: fromUser.id,
        },
        returning: true,
      }
    );
    if (updatedRows.length === 0) {
      return new Ok(undefined);
    }

    const transferred = updatedRows.map(
      (row) => new this(this.model, row.get())
    );

    logger.info(
      {
        workspaceId: workspace.sId,
        fromUserId: fromUser.sId,
        toUserId: toUser.sId,
        triggerIds: transferred.map((trigger) => trigger.sId),
      },
      "Transferred trigger editorship between users"
    );

    const toUserAuth = await Authenticator.fromUserIdAndWorkspaceId(
      toUser.sId,
      workspace.sId
    );

    // Only enabled triggers have a live schedule; disabling removes it, so re-upserting a
    // disabled one would resurrect it.
    const enabled = transferred.filter(
      (trigger) => trigger.status === "enabled"
    );
    const results = await concurrentExecutor(
      enabled,
      async (trigger) => ({
        sId: trigger.sId,
        result: await trigger.upsertTemporalWorkflow(toUserAuth),
      }),
      { concurrency: 4 }
    );

    // The rows already point at the new editor, so a retry of the transfer finds nothing to do
    // and will not fix these schedules: they keep firing as the old editor until someone pauses
    // and unpauses them (`enable` re-upserts with the current editor's auth).
    const staleTriggerIds = results
      .filter(({ result }) => result.isErr())
      .map(({ sId }) => sId);
    if (staleTriggerIds.length > 0) {
      return new Err(
        new Error(
          `Trigger editorship moved to ${toUser.sId}, but ${staleTriggerIds.length} schedule(s) ` +
            `still run as ${fromUser.sId} and must be paused then unpaused to be re-registered: ` +
            staleTriggerIds.join(", ")
        )
      );
    }

    return new Ok(undefined);
  }

  static async deleteAllForUser(
    auth: Authenticator,
    user: UserResource | UserType
  ): Promise<Result<undefined, Error>> {
    const triggers = await this.listByUserEditor(auth, user);

    if (triggers.length === 0) {
      return new Ok(undefined);
    }

    const r = await concurrentExecutor(
      triggers,
      async (trigger) => {
        return trigger.delete(auth);
      },
      {
        concurrency: 4,
      }
    );

    if (r.some((res) => res.isErr())) {
      return new Err(
        new Error(
          `Failed to delete ${r.filter((res) => res.isErr()).length} triggers`
        )
      );
    }
    return new Ok(undefined);
  }

  /**
   * Detaches all triggers from a Pod (space) by nulling out their `spaceId`.
   * Used when a space is scrubbed: the FK is `onDelete: "RESTRICT"`, so
   * references must be cleared before the space is hard-deleted. Triggers keep
   * running and fall back to the default (my conversations) target — see
   * `temporal/triggers/activities.ts`.
   */
  static async detachAllFromSpace(
    auth: Authenticator,
    spaceModelId: ModelId
  ): Promise<void> {
    await this.model.update(
      { spaceId: null },
      {
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          spaceId: spaceModelId,
        },
      }
    );
  }

  static async disableAllForWorkspace(
    auth: Authenticator,
    targetStatus: Exclude<TriggerStatus, "enabled">
  ): Promise<Result<undefined, Error>> {
    const triggers = await this.listByWorkspace(auth);
    if (triggers.length === 0) {
      return new Ok(undefined);
    }

    // Enabled triggers get the full disable (status flip + schedule removal).
    // Triggers already in a non-enabled status keep their status but still have
    // their Temporal schedule reconciled: a prior run may have flipped the
    // status yet failed to remove the schedule (the error is logged and
    // swallowed), leaving an orphaned schedule that keeps firing.
    // removeTemporalWorkflow is idempotent, so this is a no-op once the schedule
    // is gone.
    const results = await concurrentExecutor(
      triggers,
      async (trigger) =>
        trigger.status === "enabled"
          ? trigger.disable(auth, targetStatus)
          : trigger.removeTemporalWorkflow(auth),
      {
        concurrency: 10,
      }
    );

    const failuresCount = results.filter((res) => res.isErr()).length;

    if (failuresCount > 0) {
      return new Err(new Error(`Failed to disable ${failuresCount} triggers`));
    }
    return new Ok(undefined);
  }

  /**
   * We can not use the getAgentConfigurations method here, because of dependency cycle.
   */
  private static async getActiveAgentFromTriggers(
    auth: Authenticator,
    triggers: TriggerResource[]
  ): Promise<Result<Set<string> | undefined, Error>> {
    // Get all unique agent configuration IDs from disabled triggers
    const agentConfigurationIds = [
      ...new Set(triggers.map((t) => t.agentConfigurationId)),
    ];

    if (agentConfigurationIds.length === 0) {
      return new Ok(undefined);
    }

    // Query latest versions of all agent configurations at once
    const agentConfigs = await AgentConfigurationModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        sId: agentConfigurationIds,
      },
    });

    // Get only the latest version of each agent config (by latest createdAt)
    const latestAgentConfigs = new Map<string, AgentConfigurationModel>();
    for (const config of agentConfigs) {
      const existing = latestAgentConfigs.get(config.sId);
      if (
        !existing ||
        new Date(config.createdAt).getTime() >
          new Date(existing.createdAt).getTime()
      ) {
        latestAgentConfigs.set(config.sId, config);
      }
    }

    // Create a map of agent config ID to status for quick lookup
    const activeAgentIds = new Set(
      Array.from(latestAgentConfigs.values())
        .filter((config) => config.status === "active")
        .map((config) => config.sId)
    );

    return new Ok(activeAgentIds);
  }

  static async enableAllForWorkspace(
    auth: Authenticator,
    fromStatus: Exclude<TriggerStatus, "enabled">
  ): Promise<Result<undefined, Error>> {
    const triggers = await this.listByWorkspace(auth);
    if (triggers.length === 0) {
      return new Ok(undefined);
    }

    // Only enable triggers with the specified status that point to non-archived agents
    const matchingTriggers = triggers.filter((t) => t.status === fromStatus);
    if (matchingTriggers.length === 0) {
      return new Ok(undefined);
    }

    const rActiveAgentIds = await this.getActiveAgentFromTriggers(
      auth,
      matchingTriggers
    );
    if (rActiveAgentIds.isErr()) {
      return rActiveAgentIds;
    }

    const activeAgentIds = rActiveAgentIds.value;
    if (!activeAgentIds || activeAgentIds.size === 0) {
      return new Ok(undefined);
    }

    // Filter triggers to only include those pointing to active agents
    const enableableTriggers = matchingTriggers.filter((trigger) =>
      activeAgentIds.has(trigger.agentConfigurationId)
    );

    if (enableableTriggers.length === 0) {
      return new Ok(undefined);
    }

    const enabledTriggersResult = await concurrentExecutor(
      enableableTriggers,
      async (trigger) => trigger.enable(auth),
      {
        concurrency: 10,
      }
    );

    const failuresCount = enabledTriggersResult.filter((res) =>
      res.isErr()
    ).length;

    if (failuresCount > 0) {
      return new Err(new Error(`Failed to enable ${failuresCount} triggers`));
    }
    return new Ok(undefined);
  }

  // A selection made in the automations table routinely mixes triggers the
  // caller can and cannot touch, so the ones they may not move are reported
  // as skipped rather than failed.
  static async bulkChangeExecutionMode(
    auth: Authenticator,
    triggers: TriggerResource[],
    executionMode: TriggerExecutionMode
  ): Promise<BulkTriggerUpdateOutcome> {
    const workspace = auth.getNonNullableWorkspace();
    const canUseTargetMode = (await availableExecutionModes(auth)).includes(
      executionMode
    );
    const updatable = canUseTargetMode
      ? triggers.filter(
          (trigger) => auth.isManager() || trigger.isEditedBy(auth)
        )
      : [];

    const changed = updatable.filter(
      (trigger) => trigger.executionMode !== executionMode
    );
    if (changed.length > 0) {
      await this.model.update(
        { executionMode },
        {
          where: {
            id: { [Op.in]: changed.map((trigger) => trigger.id) },
            workspaceId: workspace.id,
          },
        }
      );

      void emitBulkTriggerAuditLogEvents(auth, changed, (trigger) => ({
        action: "trigger.pool_updated",
        metadata: {
          trigger_type: trigger.kind,
          agent_id: trigger.agentConfigurationId,
          previous_execution_mode: trigger.executionMode,
          execution_mode: executionMode,
        },
      }));
    }

    return {
      updatedCount: updatable.length,
      skippedCount: triggers.length - updatable.length,
    };
  }

  async upsertTemporalWorkflow(auth: Authenticator) {
    switch (this.kind) {
      case "schedule":
        return createOrUpdateAgentSchedule({
          auth,
          trigger: this,
        });
      case "webhook":
        return new Ok(undefined);
      default:
        assertNever(this.kind);
    }
  }

  async removeTemporalWorkflow(
    auth: Authenticator
  ): Promise<Result<void, Error>> {
    switch (this.kind) {
      case "schedule":
        return deleteTriggerSchedule({
          workspaceId: auth.getNonNullableWorkspace().sId,
          trigger: this,
        });
      case "webhook":
        return new Ok(undefined);
      default:
        assertNever(this.kind);
    }
  }

  async enable(auth: Authenticator): Promise<Result<undefined, Error>> {
    if (!this.canUpdateStatusTo(auth, "enabled")) {
      return new Err(
        new Error("You don't have permission to change this trigger's status")
      );
    }

    // Even when the trigger is already enabled, reconcile its Temporal
    // workflow below. A previous enable may have updated the status but failed
    // before re-registering the schedule.
    if (this.status !== "enabled") {
      const previousStatus = this.status;

      await this.update({ status: "enabled" });

      logger.info(
        {
          triggerId: this.sId,
          triggerName: this.name,
          triggerKind: this.kind,
          previousStatus,
          newStatus: "enabled",
          workspaceId: auth.getNonNullableWorkspace().sId,
          agentConfigurationId: this.agentConfigurationId,
          editorId: this.editor,
        },
        "Trigger status changed: enabled"
      );

      void emitAuditLogEvent({
        auth,
        action: "trigger.enabled",
        targets: [
          buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
          buildAuditLogTarget("trigger", {
            sId: this.sId,
            name: this.name,
          }),
        ],
        metadata: {
          trigger_type: this.kind,
          agent_id: this.agentConfigurationId,
          status: "enabled",
        },
      });
    }

    const editor = await UserResource.fetchByModelId(this.editor);
    if (!editor) {
      return new Err(new Error("Trigger editor user not found"));
    }
    const editorAuth = await Authenticator.fromUserIdAndWorkspaceId(
      editor.sId,
      auth.getNonNullableWorkspace().sId
    );

    // Re-register the temporal workflow
    const r = await this.upsertTemporalWorkflow(editorAuth);
    if (r.isErr()) {
      return r;
    }

    return new Ok(undefined);
  }

  async disable(
    auth: Authenticator,
    targetStatus: Exclude<TriggerStatus, "enabled"> = "disabled"
  ): Promise<Result<undefined, Error>> {
    if (!this.canUpdateStatusTo(auth, targetStatus)) {
      return new Err(
        new Error("You don't have permission to change this trigger's status")
      );
    }

    // Even when the status is already the target, we still reconcile the
    // Temporal workflow below: a previous disable may have flipped the status
    // but failed (or been interrupted) before removing the schedule, leaving an
    // orphaned schedule that keeps firing. removeTemporalWorkflow is idempotent.
    if (this.status !== targetStatus) {
      const previousStatus = this.status;

      try {
        await this.update({ status: targetStatus });
      } catch (error) {
        return new Err(normalizeError(error));
      }

      logger.info(
        {
          triggerId: this.sId,
          triggerName: this.name,
          triggerKind: this.kind,
          previousStatus,
          newStatus: targetStatus,
          workspaceId: auth.getNonNullableWorkspace().sId,
          agentConfigurationId: this.agentConfigurationId,
          editorId: this.editor,
        },
        `Trigger status changed: ${targetStatus}`
      );

      void emitAuditLogEvent({
        auth,
        action: "trigger.disabled",
        targets: [
          buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
          buildAuditLogTarget("trigger", {
            sId: this.sId,
            name: this.name,
          }),
        ],
        metadata: {
          trigger_type: this.kind,
          agent_id: this.agentConfigurationId,
          status: targetStatus,
        },
      });
    }

    // Remove the temporal workflow
    const r = await this.removeTemporalWorkflow(auth);
    if (r.isErr()) {
      return r;
    }

    return new Ok(undefined);
  }

  static async disableMany(
    auth: Authenticator,
    triggers: TriggerResource[],
    targetStatus: Exclude<TriggerStatus, "enabled"> = "disabled"
  ): Promise<Result<undefined, Error>> {
    const workspace = auth.getNonNullableWorkspace();

    const toUpdate = triggers.filter((t) => t.status !== targetStatus);
    if (toUpdate.length > 0) {
      await this.model.update(
        { status: targetStatus },
        {
          where: {
            id: { [Op.in]: toUpdate.map((t) => t.id) },
            workspaceId: workspace.id,
          },
        }
      );
    }

    // Reconcile the Temporal schedule for every trigger, including those already
    // at the target status: a prior run may have flipped the status but failed
    // to remove the schedule (the error is logged and swallowed below), leaving
    // an orphaned schedule that keeps firing. removeTemporalWorkflow is
    // idempotent, so this is a no-op once the schedule is gone.
    for (const trigger of triggers) {
      const r = await trigger.removeTemporalWorkflow(auth);
      if (r.isErr()) {
        logger.error(
          {
            triggerId: trigger.sId,
            workspaceId: workspace.sId,
            agentConfigurationId: trigger.agentConfigurationId,
            error: r.error,
          },
          "Failed to remove Temporal workflow while disabling trigger"
        );
      }
    }

    return new Ok(undefined);
  }

  async setExecutionMode(
    auth: Authenticator,
    executionMode: TriggerExecutionMode
  ): Promise<Result<undefined, Error>> {
    const isEditor = auth.isManager() || this.isEditedBy(auth);
    if (!isEditor) {
      return new Err(
        new TriggerExecutionModeForbiddenError(
          "You don't have permission to change this trigger's pool."
        )
      );
    }

    if (this.executionMode === executionMode) {
      return new Ok(undefined);
    }

    if (!(await availableExecutionModes(auth)).includes(executionMode)) {
      return new Err(
        new TriggerExecutionModeForbiddenError(
          TRIGGER_EXECUTION_MODE_UNAVAILABLE_MESSAGES[executionMode]
        )
      );
    }

    const previousExecutionMode = this.executionMode;

    try {
      await this.update({ executionMode });
    } catch (error) {
      return new Err(normalizeError(error));
    }

    void emitAuditLogEvent({
      auth,
      action: "trigger.pool_updated",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("trigger", { sId: this.sId, name: this.name }),
      ],
      metadata: {
        trigger_type: this.kind,
        agent_id: this.agentConfigurationId,
        previous_execution_mode: previousExecutionMode,
        execution_mode: executionMode,
      },
    });

    return new Ok(undefined);
  }

  /**
   * Updates webhook-specific settings (execution limit and mode).
   * Used by poke plugins for admin-level trigger configuration.
   * Does not trigger temporal workflow updates.
   */
  async updateWebhookSettings(
    executionPerDayLimitOverride: number | null,
    executionMode: TriggerExecutionMode
  ): Promise<Result<undefined, Error>> {
    if (this.kind !== "webhook") {
      return new Err(
        new Error("Can only update webhook settings on webhook triggers")
      );
    }

    try {
      await this.update({
        executionPerDayLimitOverride,
        executionMode,
      });
      return new Ok(undefined);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("trigger", {
      id,
      workspaceId,
    });
  }

  toJSON(): TriggerType {
    const base = {
      id: this.id,
      sId: this.sId,
      name: this.name,
      agentConfigurationId: this.agentConfigurationId,
      editor: this.editor,
      customPrompt: this.customPrompt,
      status: this.status,
      naturalLanguageDescription: this.naturalLanguageDescription,
      createdAt: this.createdAt.getTime(),
      origin: this.origin,
      executionMode: this.executionMode,
      spaceId: this.spaceId
        ? SpaceResource.modelIdToSId({
            id: this.spaceId,
            workspaceId: this.workspaceId,
          })
        : null,
    };

    if (this.kind === "webhook") {
      return {
        ...base,
        kind: "webhook" as const,
        configuration: this.configuration as WebhookConfig,
        executionPerDayLimitOverride: this.executionPerDayLimitOverride,
        webhookSourceViewId: this.webhookSourceViewId
          ? makeSId("webhook_sources_view", {
              id: this.webhookSourceViewId,
              workspaceId: this.workspaceId,
            })
          : null,
      };
    } else {
      return {
        ...base,
        kind: "schedule" as const,
        configuration: this.configuration as ScheduleConfig,
      };
    }
  }
}
