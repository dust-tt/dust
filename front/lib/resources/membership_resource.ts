import type {
  Attributes,
  FindOptions,
  IncludeOptions,
  InferAttributes,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";

import { getWorkOS } from "@app/lib/api/workos/client";
import { invalidateWorkOSOrganizationsCacheForUserId } from "@app/lib/api/workos/organization_membership";
import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import { UserModel } from "@app/lib/resources/storage/models/user";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger, { auditLog } from "@app/logger/logger";
import type {
  LightWorkspaceType,
  MembershipOriginType,
  MembershipRoleType,
  ModelId,
  RequireAtLeastOne,
  Result,
} from "@app/types";
import { assertNever, Err, normalizeError, Ok } from "@app/types";

type GetMembershipsOptions = RequireAtLeastOne<{
  users: UserResource[];
  workspace: LightWorkspaceType;
}> & {
  roles?: MembershipRoleType[];
  transaction?: Transaction;
};

export type MembershipsPaginationParams = {
  orderColumn: "createdAt";
  orderDirection: "asc" | "desc";
  lastValue: number | null | undefined;
  limit: number;
};

type MembershipsWithTotal = {
  memberships: MembershipResource[];
  total: number;
  nextPageParams?: MembershipsPaginationParams;
};

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface MembershipResource
  extends ReadonlyAttributesType<MembershipModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MembershipResource extends BaseResource<MembershipModel> {
  static model: ModelStaticWorkspaceAware<MembershipModel> = MembershipModel;

  readonly user?: Attributes<UserModel>;

  constructor(
    model: ModelStaticWorkspaceAware<MembershipModel>,
    blob: Attributes<MembershipModel>,
    { user }: { user?: Attributes<UserModel> } = {}
  ) {
    super(MembershipModel, blob);

    this.user = user;
  }

  static async getMembershipsForWorkspace({
    workspace,
    transaction,
    includeUser = false,
  }: {
    workspace: LightWorkspaceType;
    transaction?: Transaction;
    includeUser?: boolean;
  }): Promise<MembershipsWithTotal> {
    const orderedResourcesFromModels = (resources: MembershipModel[]) =>
      resources
        .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
        .map(
          (resource) =>
            new MembershipResource(MembershipModel, resource.get(), {
              user: resource.user?.get(),
            })
        );

    const whereClause: WhereOptions<InferAttributes<MembershipModel>> = {
      workspaceId: workspace.id,
    };

    const findOptions: FindOptions<InferAttributes<MembershipModel>> = {
      where: whereClause,
      transaction,
      include: includeUser ? [{ model: UserModel, required: true }] : [],
    };

    const { rows, count } = await MembershipModel.findAndCountAll(findOptions);

    return { memberships: orderedResourcesFromModels(rows), total: count };
  }

  static async getActiveMemberships({
    users,
    workspace,
    roles,
    transaction,
    paginationParams,
  }: GetMembershipsOptions & {
    paginationParams?: MembershipsPaginationParams;
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

    const paginationWhereClause: WhereOptions<
      InferAttributes<MembershipModel>
    > = {};

    const includeClause: IncludeOptions[] = [];

    if (users) {
      whereClause.userId = users.map((u) => u.id);
    } else {
      includeClause.push({
        model: UserModel,
        required: true,
      });
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
      include: includeClause,
      transaction,
    };

    if (paginationParams) {
      const { limit, orderColumn, orderDirection, lastValue } =
        paginationParams;

      if (lastValue) {
        const op = orderDirection === "desc" ? Op.lt : Op.gt;
        switch (orderColumn) {
          case "createdAt":
            paginationWhereClause[orderColumn] = {
              [op]: new Date(lastValue),
            };
            break;
          default:
            assertNever(orderColumn);
        }
      }

      findOptions.order = [
        [orderColumn, orderDirection === "desc" ? "DESC" : "ASC"],
      ];
      findOptions.limit = limit;
    }

    const rows = await this.model.findAll({
      ...findOptions,
      where: { ...findOptions.where, ...paginationWhereClause },
      // WORKSPACE_ISOLATION_BYPASS: We could fetch via workspaceId or via userIds, check is done above
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });

    let count = rows.length;

    // Only do the count if we are paginating, otherwise we can use the length of the rows as there is no limit by default
    if (paginationParams) {
      // Need a separate query to get the total count, findAndCountAll does not support pagination based on where clause.
      count = await MembershipModel.count(findOptions);
    }

    let nextPageParams: MembershipsPaginationParams | undefined;
    if (paginationParams?.limit && rows.length === paginationParams.limit) {
      const lastRow = rows[rows.length - 1];
      let lastValue: number;
      switch (paginationParams.orderColumn) {
        case "createdAt":
          lastValue = lastRow.createdAt.getTime();
          break;
        default:
          assertNever(paginationParams.orderColumn);
      }

      nextPageParams = {
        ...paginationParams,
        lastValue,
      };
    }

    return {
      memberships: rows.map(
        (membership) =>
          new MembershipResource(MembershipModel, membership.get(), {
            user: membership.user?.get(),
          })
      ),
      total: count,
      nextPageParams,
    };
  }

  static async getLatestMemberships({
    users,
    workspace,
    roles,
    transaction,
    paginationParams,
  }: GetMembershipsOptions & {
    paginationParams?: MembershipsPaginationParams;
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

  static async getActiveRoleForUserInWorkspace({
    user,
    workspace,
    transaction,
  }: {
    user: UserResource;
    workspace: LightWorkspaceType;
    transaction?: Transaction;
  }): Promise<Attributes<MembershipModel>["role"] | "none"> {
    const membership = await this.model.findOne({
      attributes: ["role"],
      where: {
        userId: user.id,
        workspaceId: workspace.id,
        startAt: {
          [Op.lte]: new Date(),
        },
        endAt: {
          [Op.or]: [{ [Op.eq]: null }, { [Op.gte]: new Date() }],
        },
      },
      transaction,
    });

    return membership?.role ?? "none";
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
      include: [
        {
          model: UserModel,
          required: true,
          where: {
            lastLoginAt: {
              [Op.ne]: null,
            },
          },
        },
      ],
      transaction,
    });
  }

  static async deleteAllForWorkspace(auth: Authenticator) {
    const workspace = auth.getNonNullableWorkspace();

    if (workspace.workOSOrganizationId) {
      try {
        const workos = getWorkOS();

        const memberships =
          await workos.userManagement.listOrganizationMemberships({
            organizationId: workspace.workOSOrganizationId,
          });

        await concurrentExecutor(
          memberships.data,
          async (membership) => {
            await workos.userManagement.deleteOrganizationMembership(
              membership.id
            );
          },
          { concurrency: 10 }
        );
      } catch (error) {
        logger.error(
          {
            workspaceId: workspace.id,
            error,
          },
          "Failed to delete WorkOS memberships for workspace"
        );
      }
    }

    return this.model.destroy({
      where: { workspaceId: workspace.id },
    });
  }

  /**
   * Caller of this method should call `ServerSideTracking.trackCreateMembership`.
   */
  static async createMembership({
    user,
    workspace,
    role,
    origin = "invited",
    startAt = new Date(),
    transaction,
  }: {
    user: UserResource;
    workspace: LightWorkspaceType;
    role: MembershipRoleType;
    origin?: MembershipOriginType;
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
        origin,
      },
      { transaction }
    );

    await this.updateWorkOSMembershipRole({
      user,
      workspace,
      newRole: role,
    });

    return new MembershipResource(MembershipModel, newMembership.get());
  }

  static async fetchByUserIds(
    userIds: ModelId[]
  ): Promise<MembershipResource[]> {
    const membershipModels = await this.model.findAll({
      where: {
        userId: userIds,
      },
      // WORKSPACE_ISOLATION_BYPASS: fetch by userIds
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });
    return membershipModels.map(
      (m) => new MembershipResource(this.model, m.get())
    );
  }

  // Use `revokeAndTrackMembership` from `@app/lib/api/membership` instead which
  // handles tracking and usage updates.
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
        type: "not_found" | "already_revoked" | "invalid_end_at";
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
      return new Err({ type: "invalid_end_at" });
    }
    if (membership.endAt) {
      return new Err({ type: "already_revoked" });
    }
    await MembershipModel.update(
      { endAt },
      { where: { id: membership.id }, transaction }
    );

    if (workspace.workOSOrganizationId && user.workOSUserId) {
      try {
        const workos = getWorkOS();

        const workOSMemberships =
          await workos.userManagement.listOrganizationMemberships({
            organizationId: workspace.workOSOrganizationId,
            userId: user.workOSUserId,
          });

        if (workOSMemberships.data.length > 0) {
          await workos.userManagement.deactivateOrganizationMembership(
            workOSMemberships.data[0].id
          );
        }
      } catch (error) {
        logger.error(
          {
            workspaceId: workspace.id,
            userId: user.id,
            error,
          },
          "Failed to deactivate WorkOS membership"
        );
      }
    }

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
    allowLastAdminRemoval = false,
    transaction,
  }: {
    user: UserResource;
    workspace: LightWorkspaceType;
    newRole: Exclude<MembershipRoleType, "revoked">;
    // If true, allow updating the role of a terminated membership (which will also un-terminate it).
    allowTerminated?: boolean;
    allowLastAdminRemoval?: boolean;
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
          if (allowLastAdminRemoval) {
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

      await this.updateWorkOSMembershipRole({
        user,
        workspace,
        newRole,
      });
    } else {
      // If the last membership was terminated, we create a new membership with the new role.
      // Preserve the origin from the previous membership.
      await this.createMembership({
        user,
        workspace,
        role: newRole,
        origin: membership.origin,
        startAt: new Date(),
        transaction,
      });
    }

    auditLog(
      {
        userId: user.id,
        workspaceId: workspace.id,
        previousRole,
        newRole,
      },
      "Membership role updated"
    );
    return new Ok({ previousRole, newRole });
  }

  static async updateWorkOSMembershipRole({
    user,
    workspace,
    newRole,
  }: {
    user: UserResource;
    workspace: LightWorkspaceType;
    newRole: Exclude<MembershipRoleType, "revoked">;
  }): Promise<void> {
    if (workspace.workOSOrganizationId && user.workOSUserId) {
      try {
        const workos = getWorkOS();
        const workOSMemberships =
          await workos.userManagement.listOrganizationMemberships({
            organizationId: workspace.workOSOrganizationId,
            userId: user.workOSUserId,
          });
        if (workOSMemberships.data.length > 0) {
          await workos.userManagement.updateOrganizationMembership(
            workOSMemberships.data[0].id,
            {
              roleSlug: newRole,
            }
          );
        } else {
          await workos.userManagement.createOrganizationMembership({
            userId: user.workOSUserId,
            organizationId: workspace.workOSOrganizationId,
            roleSlug: newRole,
          });
        }

        await invalidateWorkOSOrganizationsCacheForUserId(user.workOSUserId);
      } catch (error) {
        logger.error(
          {
            workspaceId: workspace.id,
            userId: user.id,
            error,
          },
          "Failed to udpate WorkOS membership"
        );
      }
    }
  }

  /**
   * Update the origin of an active membership.
   */
  async updateOrigin({
    user,
    workspace,
    newOrigin,
    transaction,
  }: {
    user: UserResource;
    workspace: LightWorkspaceType;
    newOrigin: MembershipOriginType;
    transaction?: Transaction;
  }): Promise<{
    previousOrigin: MembershipOriginType;
    newOrigin: MembershipOriginType;
  }> {
    const previousOrigin = this.origin;

    await this.update({ origin: newOrigin }, transaction);

    auditLog(
      {
        userId: user.id,
        workspaceId: workspace.id,
        previousOrigin,
        newOrigin,
      },
      "Membership origin updated"
    );

    return { previousOrigin, newOrigin };
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    try {
      const w = auth.workspace();
      const u = this.user;
      if (w && w.workOSOrganizationId && u && u.workOSUserId) {
        try {
          const workos = getWorkOS();

          const workOSMemberships =
            await workos.userManagement.listOrganizationMemberships({
              organizationId: w.workOSOrganizationId,
              userId: u.workOSUserId,
            });

          if (workOSMemberships.data.length > 0) {
            await workos.userManagement.deleteOrganizationMembership(
              workOSMemberships.data[0].id
            );
          }

          await invalidateWorkOSOrganizationsCacheForUserId(u.workOSUserId);
        } catch (error) {
          logger.error(
            {
              workspaceId: w.id,
              userId: u.id,
              error,
            },
            "Failed to delete WorkOS membership"
          );
        }
      }

      await this.model.destroy({
        where: {
          id: this.id,
        },
        transaction,
      });

      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  isRevoked(referenceDate: Date = new Date()): boolean {
    return !!this.endAt && this.endAt < referenceDate;
  }
}
