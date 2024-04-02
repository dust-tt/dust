import type {
  MembershipRoleType,
  RequireAtLeastOne,
  Result,
  WorkspaceType,
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

import type { Workspace } from "@app/lib/models";
import { BaseResource } from "@app/lib/resources/base_resource";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import logger from "@app/logger/logger";

type GetMembershipsOptions = RequireAtLeastOne<{
  userIds: number[];
  workspace: WorkspaceType | Workspace;
}> & {
  roles?: MembershipRoleType[];
};

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface MembershipResource
  extends ReadonlyAttributesType<MembershipModel> {}
export class MembershipResource extends BaseResource<MembershipModel> {
  static model: ModelStatic<MembershipModel> = MembershipModel;

  constructor(
    model: ModelStatic<MembershipModel>,
    blob: Attributes<MembershipModel>
  ) {
    super(MembershipModel, blob);
  }

  static async getActiveMemberships({
    userIds,
    workspace,
    roles,
  }: GetMembershipsOptions): Promise<MembershipResource[]> {
    const whereClause: WhereOptions<InferAttributes<MembershipModel>> = {
      startAt: {
        [Op.lte]: new Date(),
      },
      endAt: {
        [Op.or]: [{ [Op.eq]: null }, { [Op.gte]: new Date() }],
      },
    };

    if (userIds) {
      whereClause.userId = userIds;
    }
    if (workspace) {
      whereClause.workspaceId = workspace.id;
    }
    if (roles) {
      whereClause.role = {
        [Op.in]: roles,
      };
    }

    const memberships = await MembershipModel.findAll({
      where: whereClause,
    });

    return memberships.map(
      (membership) => new MembershipResource(MembershipModel, membership.get())
    );
  }

  static async getLatestMemberships({
    userIds,
    workspace,
    roles,
  }: GetMembershipsOptions): Promise<MembershipResource[]> {
    const orderedResourcesFromModels = (resources: MembershipModel[]) =>
      resources
        .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
        .map(
          (resource) => new MembershipResource(MembershipModel, resource.get())
        );

    const where: WhereOptions<InferAttributes<MembershipModel>> = {};
    if (roles) {
      where.role = {
        [Op.in]: roles,
      };
    }
    if (userIds) {
      where.userId = {
        [Op.in]: userIds,
      };
    }
    if (workspace) {
      where.workspaceId = workspace.id;
    }

    if (!workspace && !userIds?.length) {
      throw new Error("At least one of workspace or userIds must be provided.");
    }
    if (userIds && !userIds.length) return [];

    // Get all the memberships matching the criteria.
    const memberships = await MembershipModel.findAll({
      where,
      order: [["startAt", "DESC"]],
    });
    // Then, we only keep the latest membership for each (user, workspace).
    const latestMembershipByUserAndWorkspace = new Map<
      string,
      MembershipModel
    >();
    for (const m of memberships) {
      const key = `${m.userId}__${m.workspaceId}`;
      const latest = latestMembershipByUserAndWorkspace.get(key);
      if (!latest || latest.startAt < m.startAt) {
        latestMembershipByUserAndWorkspace.set(key, m);
      }
    }

    return orderedResourcesFromModels(
      Array.from(latestMembershipByUserAndWorkspace.values())
    );
  }

  static async getLatestMembershipOfUserInWorkspace({
    userId,
    workspace,
  }: {
    userId: number;
    workspace: WorkspaceType | Workspace;
  }): Promise<MembershipResource | null> {
    const memberships = await this.getLatestMemberships({
      userIds: [userId],
      workspace,
    });
    if (memberships.length === 0) {
      return null;
    }
    if (memberships.length > 1) {
      logger.error(
        {
          panic: true,
          userId,
          workspaceId: workspace.id,
          memberships,
        },
        "Unreachable: Found multiple latest memberships for user in workspace."
      );
      throw new Error(
        `Unreachable: Found multiple latest memberships for user ${userId} in workspace ${workspace.id}`
      );
    }
    return memberships[0];
  }

  static async getMembersCountForWorkspace({
    workspace,
    activeOnly,
  }: {
    workspace: WorkspaceType | Workspace;
    activeOnly: boolean;
  }): Promise<number> {
    const where: WhereOptions<InferAttributes<MembershipModel>> = activeOnly
      ? {
          endAt: {
            [Op.or]: [{ [Op.eq]: null }, { [Op.gt]: new Date() }],
          },
          startAt: {
            [Op.lte]: new Date(),
          },
        }
      : {};

    where.workspaceId = workspace.id;

    return MembershipModel.count({
      where,
      distinct: true,
      col: "userId",
    });
  }

  static async createMembership({
    userId,
    workspace,
    role,
    startAt = new Date(),
  }: {
    userId: number;
    workspace: WorkspaceType | Workspace;
    role: MembershipRoleType;
    startAt?: Date;
  }): Promise<MembershipResource> {
    if (startAt > new Date()) {
      throw new Error("Cannot create a membership in the future");
    }
    if (
      await MembershipModel.count({
        where: {
          userId,
          workspaceId: workspace.id,
          endAt: {
            [Op.or]: [{ [Op.eq]: null }, { [Op.gt]: startAt }],
          },
        },
      })
    ) {
      throw new Error(
        `User ${userId} already has an active membership in workspace ${workspace.id}`
      );
    }
    const newMembership = await MembershipModel.create({
      startAt,
      userId,
      workspaceId: workspace.id,
      role,
    });

    return new MembershipResource(MembershipModel, newMembership.get());
  }

  static async revokeMembership({
    userId,
    workspace,
    endAt = new Date(),
  }: {
    userId: number;
    workspace: WorkspaceType | Workspace;
    endAt?: Date;
  }): Promise<
    Result<
      undefined,
      {
        type: "not_found" | "already_revoked";
      }
    >
  > {
    const membership = await this.getLatestMembershipOfUserInWorkspace({
      userId,
      workspace,
    });
    if (!membership) {
      return new Err({ type: "not_found" });
    }
    if (endAt < membership.startAt) {
      throw new Error("endAt must be after startAt");
    }
    if (membership.endAt) {
      return new Err({ type: "already_revoked" });
    }
    await MembershipModel.update({ endAt }, { where: { id: membership.id } });
    return new Ok(undefined);
  }

  static async updateMembershipRole({
    userId,
    workspace,
    newRole,
  }: {
    userId: number;
    workspace: WorkspaceType | Workspace;
    newRole: Exclude<MembershipRoleType, "revoked">;
  }): Promise<
    Result<MembershipResource, { type: "not_found" | "already_on_role" }>
  > {
    const membership = await this.getLatestMembershipOfUserInWorkspace({
      userId,
      workspace,
    });
    if (!membership) {
      return new Err({ type: "not_found" });
    }
    if (membership.role === newRole) {
      return new Err({ type: "already_on_role" });
    }
    const switchAt = new Date();
    await this.revokeMembership({ userId, workspace, endAt: switchAt });
    const newMembership = await this.createMembership({
      userId,
      workspace,
      role: newRole,
      startAt: switchAt,
    });
    return new Ok(newMembership);
  }

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

  toListJSON() {
    return this.toJSON();
  }

  toJSON() {
    return {
      role: this.role,
      startAt: this.startAt,
      endAt: this.endAt,
    };
  }
}
