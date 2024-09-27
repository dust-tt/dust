import type {
  LightWorkspaceType,
  MembershipRoleType,
  ModelId,
  RequireAtLeastOne,
  Result,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type {
  Attributes,
  FindOptions,
  InferAttributes,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";

import type { PaginationParams } from "@app/lib/api/pagination";
import type { Authenticator } from "@app/lib/auth";
import { canForceUserRole } from "@app/lib/development";
import { BaseResource } from "@app/lib/resources/base_resource";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";

type GetMembershipsOptions = RequireAtLeastOne<{
  users: UserResource[];
  workspace: LightWorkspaceType;
}> & {
  roles?: MembershipRoleType[];
  transaction?: Transaction;
};

type MembershipsWithTotal = {
  memberships: MembershipResource[];
  total: number;
};

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface MembershipResource
  extends ReadonlyAttributesType<MembershipModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MembershipResource extends BaseResource<MembershipModel> {
  static model: ModelStatic<MembershipModel> = MembershipModel;

  constructor(
    model: ModelStatic<MembershipModel>,
    blob: Attributes<MembershipModel>
  ) {
    super(MembershipModel, blob);
  }

  static async getActiveMemberships({
    users,
    workspace,
    roles,
    transaction,
    paginationParams,
  }: GetMembershipsOptions & {
    paginationParams?: PaginationParams;
  }): Promise<MembershipsWithTotal> {
    if (!workspace && !users?.length) {
      throw new Error("At least one of workspace or userIds must be provided.");
    }

    const whereClause: WhereOptions<InferAttributes<MembershipModel>> = {
      startAt: {
        [Op.lte]: new Date(),
      },
      endAt: {
        [Op.or]: [{ [Op.eq]: null }, { [Op.gte]: new Date() }],
      },
    };

    if (users) {
      whereClause.userId = users.map((u) => u.id);
    }
    if (workspace) {
      whereClause.workspaceId = workspace.id;
    }
    if (roles) {
      whereClause.role = {
        [Op.in]: roles,
      };
    }

    const findOptions: FindOptions<InferAttributes<MembershipModel>> = {
      where: whereClause,
      transaction,
    };

    if (paginationParams) {
      const { limit, orderColumn, orderDirection, lastValue } =
        paginationParams;

      if (lastValue) {
        const op = orderDirection === "desc" ? Op.lt : Op.gt;
        whereClause[orderColumn as any] = {
          [op]: lastValue,
        };
      }

      findOptions.order = [
        [orderColumn, orderDirection === "desc" ? "DESC" : "ASC"],
      ];
      findOptions.limit = limit;
    }

    const { rows, count } = await MembershipModel.findAndCountAll(findOptions);

    return {
      memberships: rows.map(
        (membership) =>
          new MembershipResource(MembershipModel, membership.get())
      ),
      total: count,
    };
  }

  static async getLatestMemberships({
    users,
    workspace,
    roles,
    transaction,
    paginationParams,
  }: GetMembershipsOptions & {
    paginationParams?: PaginationParams;
  }): Promise<MembershipsWithTotal> {
    const orderedResourcesFromModels = (resources: MembershipModel[]) =>
      resources
        .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
        .map(
          (resource) => new MembershipResource(MembershipModel, resource.get())
        );

    const whereClause: WhereOptions<InferAttributes<MembershipModel>> = {};
    if (roles) {
      whereClause.role = roles;
    }
    if (users) {
      whereClause.userId = users.map((u) => u.id);
    }
    if (workspace) {
      whereClause.workspaceId = workspace.id;
    }

    if (!workspace && !users?.length) {
      throw new Error("At least one of workspace or userIds must be provided.");
    }
    if (users && !users.length) {
      return {
        memberships: [],
        total: 0,
      };
    }

    const findOptions: FindOptions<InferAttributes<MembershipModel>> = {
      where: whereClause,
      transaction,
    };

    if (paginationParams) {
      const { limit, orderColumn, orderDirection, lastValue } =
        paginationParams;

      if (lastValue) {
        const op = orderDirection === "desc" ? Op.lt : Op.gt;
        whereClause[orderColumn as any] = {
          [op]: lastValue,
        };
      }

      findOptions.order = [
        [orderColumn, orderDirection === "desc" ? "DESC" : "ASC"],
      ];
      findOptions.limit = limit;
    }

    // Get all the memberships matching the criteria.
    const { rows, count } = await MembershipModel.findAndCountAll(findOptions);
    // Then, we only keep the latest membership for each (user, workspace).
    const latestMembershipByUserAndWorkspace = new Map<
      string,
      MembershipModel
    >();
    for (const m of rows) {
      const key = `${m.userId}__${m.workspaceId}`;
      const latest = latestMembershipByUserAndWorkspace.get(key);
      if (!latest || latest.startAt < m.startAt) {
        latestMembershipByUserAndWorkspace.set(key, m);
      }
    }

    return {
      memberships: orderedResourcesFromModels(
        Array.from(latestMembershipByUserAndWorkspace.values())
      ),
      total: count,
    };
  }

  static async getLatestMembershipOfUserInWorkspace({
    user,
    workspace,
    transaction,
  }: {
    user: UserResource;
    workspace: LightWorkspaceType;
    transaction?: Transaction;
  }): Promise<MembershipResource | null> {
    const { memberships, total } = await this.getLatestMemberships({
      users: [user],
      workspace,
      transaction,
    });
    if (total === 0) {
      return null;
    }
    if (memberships.length > 1) {
      logger.error(
        {
          panic: true,
          userId: user.id,
          workspaceId: workspace.id,
          memberships,
        },
        "Unreachable: Found multiple latest memberships for user in workspace."
      );
      throw new Error(
        `Unreachable: Found multiple latest memberships for user ${user.id} in workspace ${workspace.id}`
      );
    }
    return memberships[0];
  }

  static async getActiveMembershipOfUserInWorkspace({
    user,
    workspace,
    transaction,
  }: {
    user: UserResource;
    workspace: LightWorkspaceType;
    transaction?: Transaction;
  }): Promise<MembershipResource | null> {
    const { memberships, total } = await this.getActiveMemberships({
      users: [user],
      workspace,
      transaction,
    });
    if (total === 0) {
      return null;
    }
    if (total > 1) {
      logger.error(
        {
          panic: true,
          userId: user.id,
          workspaceId: workspace.id,
          memberships,
        },
        "Unreachable: Found multiple active memberships for user in workspace."
      );
      throw new Error(
        `Unreachable: Found multiple active memberships for user ${user.id} in workspace ${workspace.id}`
      );
    }
    return memberships[0];
  }

  static async getMembersCountForWorkspace({
    workspace,
    activeOnly,
    rolesFilter,
    transaction,
  }: {
    workspace: LightWorkspaceType;
    activeOnly: boolean;
    rolesFilter?: MembershipRoleType[];
    transaction?: Transaction;
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

    if (rolesFilter && rolesFilter.length !== 0) {
      where.role = {
        [Op.in]: rolesFilter,
      };
    }

    where.workspaceId = workspace.id;

    return MembershipModel.count({
      where,
      distinct: true,
      col: "userId",
      transaction,
    });
  }

  /**
   * Caller of this method should call `ServerSideTracking.trackCreateMembership`.
   */
  static async createMembership({
    user,
    workspace,
    role,
    startAt = new Date(),
    transaction,
  }: {
    user: UserResource;
    workspace: LightWorkspaceType;
    role: MembershipRoleType;
    startAt?: Date;
    transaction?: Transaction;
  }): Promise<MembershipResource> {
    if (startAt > new Date()) {
      throw new Error("Cannot create a membership in the future");
    }
    if (
      await MembershipModel.count({
        where: {
          userId: user.id,
          workspaceId: workspace.id,
          endAt: {
            [Op.or]: [{ [Op.eq]: null }, { [Op.gt]: startAt }],
          },
        },
        transaction,
      })
    ) {
      throw new Error(
        `User ${user.id} already has an active membership in workspace ${workspace.id}`
      );
    }
    const newMembership = await MembershipModel.create(
      {
        startAt,
        userId: user.id,
        workspaceId: workspace.id,
        role,
      },
      { transaction }
    );

    return new MembershipResource(MembershipModel, newMembership.get());
  }

  static async fetchByUserIds(
    userIds: ModelId[]
  ): Promise<MembershipResource[]> {
    const membershipModels = await MembershipModel.findAll({
      where: {
        userId: userIds,
      },
    });
    return membershipModels.map(
      (m) => new MembershipResource(MembershipModel, m.get())
    );
  }

  /**
   * Caller of this method should call `ServerSideTracking.trackRevokeMembership`.
   */
  static async revokeMembership({
    user,
    workspace,
    endAt = new Date(),
    transaction,
  }: {
    user: UserResource;
    workspace: LightWorkspaceType;
    endAt?: Date;
    transaction?: Transaction;
  }): Promise<
    Result<
      { role: MembershipRoleType; startAt: Date; endAt: Date },
      {
        type: "not_found" | "already_revoked";
      }
    >
  > {
    const membership = await this.getLatestMembershipOfUserInWorkspace({
      user,
      workspace,
      transaction,
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
    await MembershipModel.update(
      { endAt },
      { where: { id: membership.id }, transaction }
    );

    return new Ok({
      role: membership.role,
      startAt: membership.startAt,
      endAt,
    });
  }

  /**
   * Caller of this method should call `ServerSideTracking.trackUpdateMembershipRole`.
   */
  static async updateMembershipRole({
    user,
    workspace,
    newRole,
    allowTerminated = false,
    transaction,
  }: {
    user: UserResource;
    workspace: LightWorkspaceType;
    newRole: Exclude<MembershipRoleType, "revoked">;
    // If true, allow updating the role of a terminated membership (which will also un-terminate it).
    allowTerminated?: boolean;
    transaction?: Transaction;
  }): Promise<
    Result<
      { previousRole: MembershipRoleType; newRole: MembershipRoleType },
      {
        type:
          | "not_found"
          | "already_on_role"
          | "membership_already_terminated"
          | "last_admin";
      }
    >
  > {
    const membership = await this.getLatestMembershipOfUserInWorkspace({
      user,
      workspace,
      transaction,
    });

    if (membership?.endAt && !allowTerminated) {
      return new Err({ type: "membership_already_terminated" });
    }
    if (!membership) {
      return new Err({ type: "not_found" });
    }

    const previousRole = membership.role;

    // If the membership is not terminated, we update the role in place.
    // We do not historicize the roles.
    if (!membership.endAt) {
      if (previousRole === newRole) {
        return new Err({ type: "already_on_role" });
      }

      // If the previous role was admin, we need to check if there is another admin in the workspace.
      if (previousRole == "admin") {
        const adminsCount = await this.getMembersCountForWorkspace({
          workspace,
          activeOnly: true,
          rolesFilter: ["admin"],
          transaction,
        });

        if (adminsCount < 2) {
          if (canForceUserRole(workspace)) {
            logger.warn(
              {
                panic: false,
                userId: user.id,
                workspaceId: workspace.id,
              },
              "Removing the last admin from the workspace, we are allowing it because canForceUserRole() returns true."
            );
          } else {
            return new Err({ type: "last_admin" });
          }
        }
      }

      await MembershipModel.update(
        { role: newRole },
        { where: { id: membership.id }, transaction }
      );
    } else {
      // If the last membership was terminated, we create a new membership with the new role.
      await this.createMembership({
        user,
        workspace,
        role: newRole,
        startAt: new Date(),
        transaction,
      });
    }

    return new Ok({ previousRole, newRole });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
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
