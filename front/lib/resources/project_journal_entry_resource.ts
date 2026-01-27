import type { Attributes, Transaction } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { ProjectJournalEntryModel } from "@app/lib/resources/storage/models/project_journal_entry";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { UserModel } from "@app/lib/resources/storage/models/user";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ModelId, ProjectJournalEntryType, Result } from "@app/types";
import { Err, Ok } from "@app/types";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ProjectJournalEntryResource extends ReadonlyAttributesType<ProjectJournalEntryModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ProjectJournalEntryResource extends BaseResource<ProjectJournalEntryModel> {
  static model: typeof ProjectJournalEntryModel = ProjectJournalEntryModel;

  readonly user: Attributes<UserModel>;

  constructor(
    model: typeof ProjectJournalEntryModel,
    blob: Attributes<ProjectJournalEntryModel>,
    { user }: { user: Attributes<UserModel> }
  ) {
    super(ProjectJournalEntryModel, blob);

    this.user = user;
  }

  get sId(): string {
    return ProjectJournalEntryResource.modelIdToSId({
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
    return makeSId("project_journal_entry", {
      id,
      workspaceId,
    });
  }

  static async fetchBySpace(
    auth: Authenticator,
    spaceId: ModelId,
    options?: {
      limit?: number;
      offset?: number;
      transaction?: Transaction;
    }
  ): Promise<ProjectJournalEntryResource[]> {
    const rows = await ProjectJournalEntryModel.findAll({
      where: {
        spaceId,
        userId: auth.getNonNullableUser().id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      include: [
        {
          model: SpaceModel,
          required: true,
        },
        {
          model: ConversationModel,
          required: false,
        },
        {
          model: UserModel,
          required: true,
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: options?.limit,
      offset: options?.offset,
      transaction: options?.transaction,
    });

    return rows.map((r) => {
      return new this(this.model, r.get(), { user: auth.getNonNullableUser() });
    });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    try {
      await ProjectJournalEntryModel.destroy({
        where: {
          id: this.id,
          userId: auth.getNonNullableUser().id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        transaction,
      });
      return new Ok(undefined);
    } catch (error) {
      return new Err(error as Error);
    }
  }

  toJSON(): ProjectJournalEntryType {
    return {
      sId: this.sId,
      id: this.id,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      spaceId: SpaceResource.modelIdToSId({
        id: this.spaceId,
        workspaceId: this.workspaceId,
      }),
      userId: this.user.sId,
      journalEntry: this.journalEntry,
    };
  }
}
