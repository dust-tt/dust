import assert from "assert";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { WebhookSourcesViewModel } from "@app/lib/models/assistant/triggers/webhook_sources_view";
import { ResourceWithSpace } from "@app/lib/resources/resource_with_space";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserModel } from "@app/lib/resources/storage/models/user";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { UserResource } from "@app/lib/resources/user_resource";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import type { ModelId, Result } from "@app/types";
import { Err, formatUserFullName, Ok, removeNulls } from "@app/types";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface WebhookSourcesViewResource
  extends ReadonlyAttributesType<WebhookSourcesViewModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class WebhookSourcesViewResource extends ResourceWithSpace<WebhookSourcesViewModel> {
  static model: ModelStatic<WebhookSourcesViewModel> = WebhookSourcesViewModel;
  readonly editedByUser?: Attributes<UserModel>;
  private webhookSource?: WebhookSourceResource;

  constructor(
    model: ModelStatic<WebhookSourcesViewModel>,
    blob: Attributes<WebhookSourcesViewModel>,
    space: SpaceResource,
    { editedByUser }: { editedByUser?: Attributes<UserModel> } = {}
  ) {
    super(WebhookSourcesViewModel, blob, space);

    this.editedByUser = editedByUser;
  }

  private async init(auth: Authenticator): Promise<Result<void, DustError>> {
    if (this.webhookSourceId) {
      const webhookSourceResource = await WebhookSourceResource.findByPk(
        auth,
        this.webhookSourceId
      );
      if (!webhookSourceResource) {
        return new Err(
          new DustError(
            "webhook_source_not_found",
            "Webhook source not found, it should have been fetched by the base fetch."
          )
        );
      }

      this.webhookSource = webhookSourceResource;
      return new Ok(undefined);
    }

    return new Err(
      new DustError(
        "internal_error",
        "We could not find the webhook source because it was missing."
      )
    );
  }

  private static async makeNew(
    auth: Authenticator,
    blob: Omit<
      CreationAttributes<WebhookSourcesViewModel>,
      "editedAt" | "editedByUserId" | "vaultId" | "workspaceId"
    >,
    space: SpaceResource,
    editedByUser?: UserResource,
    transaction?: Transaction
  ) {
    assert(auth.isAdmin(), "Only admins can create a webhook sources view");

    const view = await WebhookSourcesViewModel.create(
      {
        ...blob,
        workspaceId: auth.getNonNullableWorkspace().id,
        editedByUserId: editedByUser?.id ?? null,
        editedAt: new Date(),
        vaultId: space.id,
      },
      { transaction }
    );

    const resource = new this(
      WebhookSourcesViewResource.model,
      view.get(),
      space
    );

    const r = await resource.init(auth);
    if (r.isErr()) {
      throw r.error;
    }

    return resource;
  }

  public static async create(
    auth: Authenticator,
    {
      systemView,
      space,
    }: {
      systemView: WebhookSourcesViewResource;
      space: SpaceResource;
    }
  ) {
    if (systemView.space.kind !== "system") {
      throw new Error(
        "You must pass the system view to create a new webhook sources view"
      );
    }

    return this.makeNew(
      auth,
      {
        webhookSourceId: systemView.webhookSourceId,
        customName: systemView.customName,
      },
      space,
      auth.user() ?? undefined
    );
  }

  // Fetching.

  private static async baseFetch(
    auth: Authenticator,
    options: ResourceFindOptions<WebhookSourcesViewModel> = {}
  ) {
    const views = await this.baseFetchWithAuthorization(auth, {
      ...options,
      where: {
        ...options.where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      includes: [
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        ...(options.includes || []),
        {
          model: UserModel,
          as: "editedByUser",
        },
      ],
    });

    const filteredViews: WebhookSourcesViewResource[] = [];

    if (options.includeDeleted) {
      filteredViews.push(...views);
    } else {
      for (const view of views) {
        const r = await view.init(auth);
        if (r.isOk()) {
          filteredViews.push(view);
        }
      }
    }

    return filteredViews;
  }

  static async fetchById(
    auth: Authenticator,
    id: string,
    options?: ResourceFindOptions<WebhookSourcesViewModel>
  ): Promise<WebhookSourcesViewResource | null> {
    const [view] = await this.fetchByIds(auth, [id], options);

    return view ?? null;
  }

  static async fetchByIds(
    auth: Authenticator,
    ids: string[],
    options?: ResourceFindOptions<WebhookSourcesViewModel>
  ): Promise<WebhookSourcesViewResource[]> {
    const viewModelIds = removeNulls(ids.map((id) => getResourceIdFromSId(id)));

    const views = await this.baseFetch(auth, {
      ...options,
      where: {
        ...options?.where,
        id: {
          [Op.in]: viewModelIds,
        },
      },
    });

    return views ?? [];
  }

  static async fetchByModelPk(auth: Authenticator, id: ModelId) {
    const views = await this.fetchByModelIds(auth, [id]);

    if (views.length !== 1) {
      return null;
    }

    return views[0];
  }

  static async fetchByModelIds(auth: Authenticator, ids: ModelId[]) {
    const views = await this.baseFetch(auth, {
      where: {
        id: {
          [Op.in]: ids,
        },
      },
    });

    return views ?? [];
  }

  static async listByWorkspace(
    auth: Authenticator,
    options?: ResourceFindOptions<WebhookSourcesViewModel>
  ): Promise<WebhookSourcesViewResource[]> {
    return this.baseFetch(auth, options);
  }

  static async listBySpaces(
    auth: Authenticator,
    spaces: SpaceResource[],
    options?: ResourceFindOptions<WebhookSourcesViewModel>
  ): Promise<WebhookSourcesViewResource[]> {
    return this.baseFetch(auth, {
      ...options,
      where: {
        ...options?.where,
        workspaceId: auth.getNonNullableWorkspace().id,
        vaultId: spaces.map((s) => s.id),
      },
    });
  }

  static async listBySpace(
    auth: Authenticator,
    space: SpaceResource,
    options?: ResourceFindOptions<WebhookSourcesViewModel>
  ): Promise<WebhookSourcesViewResource[]> {
    return this.listBySpaces(auth, [space], options);
  }

  static async listForSystemSpace(
    auth: Authenticator,
    options?: ResourceFindOptions<WebhookSourcesViewModel>
  ) {
    const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);

    return this.listBySpace(auth, systemSpace, options);
  }

  static async countBySpace(
    auth: Authenticator,
    space: SpaceResource
  ): Promise<number> {
    if (space.canRead(auth)) {
      return this.model.count({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          vaultId: space.id,
        },
      });
    }
    return 0;
  }

  static async listByWebhookSource(
    auth: Authenticator,
    webhookSourceId: ModelId
  ): Promise<WebhookSourcesViewResource[]> {
    return this.baseFetch(auth, {
      where: { webhookSourceId },
    });
  }

  static async getWebhookSourceViewForSystemSpace(
    auth: Authenticator,
    webhookSourceSId: string
  ): Promise<WebhookSourcesViewResource | null> {
    const webhookSourceId = getResourceIdFromSId(webhookSourceSId);
    if (!webhookSourceId) {
      return null;
    }

    const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);

    const views = await this.baseFetch(auth, {
      where: {
        vaultId: systemSpace.id,
        webhookSourceId,
      },
    });

    return views[0] ?? null;
  }

  public async updateName(
    auth: Authenticator,
    name?: string,
    transaction?: Transaction
  ): Promise<Result<number, DustError<"unauthorized">>> {
    if (!this.canAdministrate(auth)) {
      return new Err(
        new DustError("unauthorized", "Not allowed to update name.")
      );
    }

    const [affectedCount] = await this.update(
      {
        customName: name ?? null,
        editedAt: new Date(),
        editedByUserId: auth.getNonNullableUser().id,
      },
      transaction
    );
    return new Ok(affectedCount);
  }

  public static async bulkUpdateName(
    auth: Authenticator,
    viewIds: ModelId[],
    name?: string
  ): Promise<void> {
    if (viewIds.length === 0) {
      return;
    }

    await this.model.update(
      {
        customName: name ?? null,
        editedAt: new Date(),
        editedByUserId: auth.getNonNullableUser().id,
      },
      {
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          id: {
            [Op.in]: viewIds,
          },
        },
      }
    );
  }

  // Deletion.

  protected async softDelete(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<Result<number, Error>> {
    assert(auth.isAdmin(), "Only the admin can delete a webhook sources view");
    assert(
      auth.getNonNullableWorkspace().id === this.workspaceId,
      "Can only delete webhook sources views for the current workspace"
    );

    const deletedCount = await WebhookSourcesViewModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: this.id,
      },
      transaction,
      hardDelete: false,
    });

    return new Ok(deletedCount);
  }

  async hardDelete(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<Result<number, Error>> {
    const deletedCount = await WebhookSourcesViewModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: this.id,
      },
      transaction,
      // Use 'hardDelete: true' to ensure the record is permanently deleted from the database,
      // bypassing the soft deletion in place.
      hardDelete: true,
    });

    return new Ok(deletedCount);
  }

  private getWebhookSourceResource(): WebhookSourceResource {
    if (!this.webhookSource) {
      throw new Error(
        "This webhook sources view is referencing a non-existent webhook source"
      );
    }

    return this.webhookSource;
  }

  get sId(): string {
    return WebhookSourcesViewResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  get webhookSourceSId(): string {
    return this.getWebhookSourceResource().sId();
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("webhook_sources_view", {
      id,
      workspaceId,
    });
  }

  async setEditedBy(auth: Authenticator) {
    await this.update({
      editedByUserId: auth.user()?.id ?? null,
      editedAt: new Date(),
    });
  }

  private makeEditedBy(
    editedByUser: Attributes<UserModel> | undefined,
    editedAt: Date | undefined
  ) {
    if (!editedByUser || !editedAt) {
      return null;
    }

    return {
      editedAt: editedAt.getTime(),
      fullName: formatUserFullName(editedByUser),
      imageUrl: editedByUser.imageUrl,
      email: editedByUser.email,
      userId: editedByUser.sId,
    };
  }

  // Serialization.
  toJSON(): WebhookSourceViewType {
    return {
      id: this.id,
      sId: this.sId,
      customName: this.customName,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      spaceId: this.space.sId,
      webhookSource: this.getWebhookSourceResource().toJSON(),
      editedByUser: this.makeEditedBy(
        this.editedByUser,
        this.webhookSource ? this.webhookSource.updatedAt : this.updatedAt
      ),
    };
  }
}
