import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import type { MembershipRoleType } from "@app/types/memberships";
import type { LightWorkspaceType } from "@app/types/user";
import type { InferAttributes, Transaction, WhereOptions } from "sequelize";
import { Op } from "sequelize";

export async function countMembershipsForWorkspace({
  workspace,
  activeOnly,
  rolesFilter,
  transaction,
  membershipSpan,
}: {
  workspace: LightWorkspaceType;
  activeOnly: boolean;
  rolesFilter?: MembershipRoleType[];
  transaction?: Transaction;
  membershipSpan?: { fromDate: Date; toDate: Date };
}): Promise<number> {
  const fromDate = membershipSpan?.fromDate ?? new Date();
  const toDate = membershipSpan?.toDate ?? new Date();
  const where: WhereOptions<InferAttributes<MembershipModel>> = activeOnly
    ? {
        endAt: {
          [Op.or]: [{ [Op.eq]: null }, { [Op.gte]: fromDate }],
        },
        startAt: {
          [Op.lte]: toDate,
        },
        firstUsedAt: {
          [Op.ne]: null,
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
