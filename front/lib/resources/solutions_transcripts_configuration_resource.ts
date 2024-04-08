import type {
  LightWorkspaceType,
  MembershipRoleType,
  RequireAtLeastOne,
  Result,
  UserType,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type {
  Attributes,
  InferAttributes,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";

import { BaseResource } from "@app/lib/resources/base_resource";
import { SolutionsTranscriptsConfigurationModel } from "@app/lib/resources/storage/models/solutions";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { SolutionProviderType } from "@app/lib/solutions/transcripts/utils/types";
import logger from "@app/logger/logger";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SolutionsTranscriptsConfigurationResource
  extends ReadonlyAttributesType<SolutionsTranscriptsConfigurationModel> {}
export class SolutionsTranscriptsConfigurationResource extends BaseResource<SolutionsTranscriptsConfigurationModel> {
  static model: ModelStatic<SolutionsTranscriptsConfigurationModel> = SolutionsTranscriptsConfigurationModel;

  constructor(
    model: ModelStatic<SolutionsTranscriptsConfigurationModel>,
    blob: Attributes<SolutionsTranscriptsConfigurationModel>
  ) {
    super(SolutionsTranscriptsConfigurationModel, blob);
  }


  static async makeNew({
    userId,
    connectionId,
    provider,
  }: {
    userId: number;
    connectionId: string;
    provider: SolutionProviderType;
  }): Promise<SolutionsTranscriptsConfigurationResource> {
    if (
      await SolutionsTranscriptsConfigurationModel.count({
        where: {
          userId: userId,
          connectionId: connectionId,
          provider: provider,
        }
      })
    ) {
      throw new Error(
        `A Solution configuration already exists for user ${userId} with connectionId ${connectionId} and provider ${provider}`
      );
    }
    const newConfiguration = await SolutionsTranscriptsConfigurationModel.create(
      {
        userId,
        connectionId,
        provider,
      }
    );

    return new SolutionsTranscriptsConfigurationResource(SolutionsTranscriptsConfigurationModel, newConfiguration.get());
  }

  static async findOne({
    where,
    transaction,
  }: {
    where: RequireAtLeastOne<{
      id: number;
      userId: number;
      provider: SolutionProviderType;
    }>;
    transaction?: Transaction;
  }): Promise<SolutionsTranscriptsConfigurationResource | null> {
    const configuration = await SolutionsTranscriptsConfigurationModel.findOne({
      where,
      transaction,
    });

    return configuration
      ? new SolutionsTranscriptsConfigurationResource(SolutionsTranscriptsConfigurationModel, configuration.get())
      : null;
  }



  // static async getActiveMemberships({
  //   users,
  //   workspace,
  //   roles,
  //   transaction,
  // }: GetMembershipsOptions): Promise<SolutionsTranscriptsConfigurationResource[]> {
  //   if (!workspace && !users?.length) {
  //     throw new Error("At least one of workspace or userIds must be provided.");
  //   }
  //   const whereClause: WhereOptions<InferAttributes<SolutionsTranscriptsConfigurationModel>> = {
  //     startAt: {
  //       [Op.lte]: new Date(),
  //     },
  //     endAt: {
  //       [Op.or]: [{ [Op.eq]: null }, { [Op.gte]: new Date() }],
  //     },
  //   };

  //   if (users) {
  //     whereClause.userId = users.map((u) => u.id);
  //   }
  //   if (workspace) {
  //     whereClause.workspaceId = workspace.id;
  //   }
  //   if (roles) {
  //     whereClause.role = {
  //       [Op.in]: roles,
  //     };
  //   }

  //   const memberships = await SolutionsTranscriptsConfigurationModel.findAll({
  //     where: whereClause,
  //     transaction,
  //   });

  //   return memberships.map(
  //     (membership) => new SolutionsTranscriptsConfigurationResource(SolutionsTranscriptsConfigurationModel, membership.get())
  //   );
  // }

  // static async getLatestMemberships({
  //   users,
  //   workspace,
  //   roles,
  //   transaction,
  // }: GetMembershipsOptions): Promise<SolutionsTranscriptsConfigurationResource[]> {
  //   const orderedResourcesFromModels = (resources: SolutionsTranscriptsConfigurationModel[]) =>
  //     resources
  //       .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
  //       .map(
  //         (resource) => new SolutionsTranscriptsConfigurationResource(SolutionsTranscriptsConfigurationModel, resource.get())
  //       );

  //   const where: WhereOptions<InferAttributes<SolutionsTranscriptsConfigurationModel>> = {};
  //   if (roles) {
  //     where.role = roles;
  //   }
  //   if (users) {
  //     where.userId = users.map((u) => u.id);
  //   }
  //   if (workspace) {
  //     where.workspaceId = workspace.id;
  //   }

  //   if (!workspace && !users?.length) {
  //     throw new Error("At least one of workspace or userIds must be provided.");
  //   }
  //   if (users && !users.length) return [];

  //   // Get all the memberships matching the criteria.
  //   const memberships = await SolutionsTranscriptsConfigurationModel.findAll({
  //     where,
  //     order: [["startAt", "DESC"]],
  //     transaction,
  //   });
  //   // Then, we only keep the latest membership for each (user, workspace).
  //   const latestMembershipByUserAndWorkspace = new Map<
  //     string,
  //     SolutionsTranscriptsConfigurationModel
  //   >();
  //   for (const m of memberships) {
  //     const key = `${m.userId}__${m.workspaceId}`;
  //     const latest = latestMembershipByUserAndWorkspace.get(key);
  //     if (!latest || latest.startAt < m.startAt) {
  //       latestMembershipByUserAndWorkspace.set(key, m);
  //     }
  //   }

  //   return orderedResourcesFromModels(
  //     Array.from(latestMembershipByUserAndWorkspace.values())
  //   );
  // }

  // static async getLatestMembershipOfUserInWorkspace({
  //   user,
  //   workspace,
  //   transaction,
  // }: {
  //   user: UserType;
  //   workspace: LightWorkspaceType;
  //   transaction?: Transaction;
  // }): Promise<SolutionsTranscriptsConfigurationResource | null> {
  //   const memberships = await this.getLatestMemberships({
  //     users: [user],
  //     workspace,
  //     transaction,
  //   });
  //   if (memberships.length === 0) {
  //     return null;
  //   }
  //   if (memberships.length > 1) {
  //     logger.error(
  //       {
  //         panic: true,
  //         userId: user.id,
  //         workspaceId: workspace.id,
  //         memberships,
  //       },
  //       "Unreachable: Found multiple latest memberships for user in workspace."
  //     );
  //     throw new Error(
  //       `Unreachable: Found multiple latest memberships for user ${user.id} in workspace ${workspace.id}`
  //     );
  //   }
  //   return memberships[0];
  // }

  // static async getActiveMembershipOfUserInWorkspace({
  //   user,
  //   workspace,
  //   transaction,
  // }: {
  //   user: UserType;
  //   workspace: LightWorkspaceType;
  //   transaction?: Transaction;
  // }): Promise<SolutionsTranscriptsConfigurationResource | null> {
  //   const memberships = await this.getActiveMemberships({
  //     users: [user],
  //     workspace,
  //     transaction,
  //   });
  //   if (memberships.length === 0) {
  //     return null;
  //   }
  //   if (memberships.length > 1) {
  //     logger.error(
  //       {
  //         panic: true,
  //         userId: user.id,
  //         workspaceId: workspace.id,
  //         memberships,
  //       },
  //       "Unreachable: Found multiple active memberships for user in workspace."
  //     );
  //     throw new Error(
  //       `Unreachable: Found multiple active memberships for user ${user.id} in workspace ${workspace.id}`
  //     );
  //   }
  //   return memberships[0];
  // }

  // static async getMembersCountForWorkspace({
  //   workspace,
  //   activeOnly,
  //   transaction,
  // }: {
  //   workspace: LightWorkspaceType;
  //   activeOnly: boolean;
  //   transaction?: Transaction;
  // }): Promise<number> {
  //   const where: WhereOptions<InferAttributes<SolutionsTranscriptsConfigurationModel>> = activeOnly
  //     ? {
  //         endAt: {
  //           [Op.or]: [{ [Op.eq]: null }, { [Op.gt]: new Date() }],
  //         },
  //         startAt: {
  //           [Op.lte]: new Date(),
  //         },
  //       }
  //     : {};

  //   where.workspaceId = workspace.id;

  //   return SolutionsTranscriptsConfigurationModel.count({
  //     where,
  //     distinct: true,
  //     col: "userId",
  //     transaction,
  //   });
  // }

  // static async revokeMembership({
  //   user,
  //   workspace,
  //   endAt = new Date(),
  //   transaction,
  // }: {
  //   user: UserType;
  //   workspace: LightWorkspaceType;
  //   endAt?: Date;
  //   transaction?: Transaction;
  // }): Promise<
  //   Result<
  //     undefined,
  //     {
  //       type: "not_found" | "already_revoked";
  //     }
  //   >
  // > {
  //   const membership = await this.getLatestMembershipOfUserInWorkspace({
  //     user,
  //     workspace,
  //     transaction,
  //   });
  //   if (!membership) {
  //     return new Err({ type: "not_found" });
  //   }
  //   if (endAt < membership.startAt) {
  //     throw new Error("endAt must be after startAt");
  //   }
  //   if (membership.endAt) {
  //     return new Err({ type: "already_revoked" });
  //   }
  //   await SolutionsTranscriptsConfigurationModel.update(
  //     { endAt },
  //     { where: { id: membership.id }, transaction }
  //   );
  //   return new Ok(undefined);
  // }

  // static async updateMembershipRole({
  //   user,
  //   workspace,
  //   newRole,
  //   allowTerminated = false,
  //   transaction,
  // }: {
  //   user: UserType;
  //   workspace: LightWorkspaceType;
  //   newRole: Exclude<MembershipRoleType, "revoked">;
  //   // If true, allow updating the role of a terminated membership (which will also un-terminate it).
  //   allowTerminated?: boolean;
  //   transaction?: Transaction;
  // }): Promise<
  //   Result<
  //     void,
  //     {
  //       type: "not_found" | "already_on_role" | "membership_already_terminated";
  //     }
  //   >
  // > {
  //   const membership = await this.getLatestMembershipOfUserInWorkspace({
  //     user,
  //     workspace,
  //     transaction,
  //   });
  //   if (membership?.endAt && !allowTerminated) {
  //     return new Err({ type: "membership_already_terminated" });
  //   }
  //   if (!membership) {
  //     return new Err({ type: "not_found" });
  //   }

  //   // If the membership is not terminated, we update the role in place.
  //   // TODO(@fontanierh): check if we want to terminate + create a new membership with new role instead ?
  //   if (!membership.endAt) {
  //     if (membership.role === newRole) {
  //       return new Err({ type: "already_on_role" });
  //     }
  //     await SolutionsTranscriptsConfigurationModel.update(
  //       { role: newRole },
  //       { where: { id: membership.id }, transaction }
  //     );
  //   } else {
  //     // If the last membership was terminated, we create a new membership with the new role.
  //     await this.createMembership({
  //       user,
  //       workspace,
  //       role: newRole,
  //       startAt: new Date(),
  //       transaction,
  //     });
  //   }

  //   return new Ok(undefined);
  // }

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
    try {
      await this.model.destroy({
        where: {
          id: this.id,
        },
        transaction,
      });

      return new Ok(undefined);
    } catch (err) {
      return new Err(err as Error);
    }
  }

  isRevoked(referenceDate: Date = new Date()): boolean {
    return !!this.endAt && this.endAt < referenceDate;
  }
}
