import type { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { MembershipSeatType } from "@app/types/memberships";

export type GetMembersSeatsResponseBody = {
  seatTypes: Record<MembershipSeatType, number>;
  total: number;
};

export async function getMembersSeats({
  auth,
}: {
  auth: Authenticator;
}): Promise<GetMembersSeatsResponseBody> {
  const workspace = auth.getNonNullableWorkspace();
  const seatTypes =
    await MembershipResource.getActiveSeatTypeCountsForWorkspace({
      workspace,
    });

  return {
    seatTypes,
    total: Object.values(seatTypes).reduce((sum, count) => sum + count, 0),
  };
}
