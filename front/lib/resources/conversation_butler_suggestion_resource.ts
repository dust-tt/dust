import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { ConversationButlerSuggestionModel } from "@app/lib/resources/storage/models/conversation_butler_suggestion";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ConversationButlerSuggestionResource
  extends ReadonlyAttributesType<ConversationButlerSuggestionModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ConversationButlerSuggestionResource extends BaseResource<ConversationButlerSuggestionModel> {
  static model: ModelStaticWorkspaceAware<ConversationButlerSuggestionModel> =
    ConversationButlerSuggestionModel;

  constructor(
    model: ModelStatic<ConversationButlerSuggestionModel>,
    blob: Attributes<ConversationButlerSuggestionModel>
  ) {
    super(ConversationButlerSuggestionModel, blob);
  }

  static async makeNew(
    auth: Authenticator,
    blob: Omit<
      CreationAttributes<ConversationButlerSuggestionModel>,
      "workspaceId"
    >,
    transaction?: Transaction
  ): Promise<ConversationButlerSuggestionResource> {
    const suggestion = await ConversationButlerSuggestionModel.create(
      {
        ...blob,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      { transaction }
    );

    return new this(ConversationButlerSuggestionModel, suggestion.get());
  }

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<ConversationButlerSuggestionModel>,
    transaction?: Transaction
  ): Promise<ConversationButlerSuggestionResource[]> {
    const { where, ...otherOptions } = options ?? {};

    const suggestions = await ConversationButlerSuggestionModel.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      ...otherOptions,
      transaction,
    });

    return suggestions.map(
      (s) => new this(ConversationButlerSuggestionModel, s.get())
    );
  }

  static async fetchById(
    auth: Authenticator,
    sId: string
  ): Promise<ConversationButlerSuggestionResource | null> {
    const modelId = getResourceIdFromSId(sId);
    if (!modelId) {
      return null;
    }

    const results = await this.baseFetch(auth, {
      where: { id: modelId },
    });

    return results[0] ?? null;
  }

  async accept(
    transaction?: Transaction
  ): Promise<Result<ConversationButlerSuggestionResource, Error>> {
    await this.update({ status: "accepted" as const }, transaction);
    return new Ok(this);
  }

  async dismiss(
    transaction?: Transaction
  ): Promise<Result<ConversationButlerSuggestionResource, Error>> {
    await this.update({ status: "dismissed" as const }, transaction);
    return new Ok(this);
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: this.id,
      },
      transaction,
    });

    return new Ok(undefined);
  }

  get sId(): string {
    return ConversationButlerSuggestionResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("conversation_butler_suggestion", { id, workspaceId });
  }
}
