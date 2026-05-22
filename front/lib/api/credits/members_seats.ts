import type { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";

export type GetMembersSeatsResponseBody = {
  seatTypes: Record<string, number>;
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
