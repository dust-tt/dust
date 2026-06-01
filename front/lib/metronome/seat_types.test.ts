import type { CachedContract } from "@app/lib/metronome/plan_type";
import { getDefaultSeatTypeForContract } from "@app/lib/metronome/seat_types";
import type { MembershipSeatType } from "@app/types/memberships";
import { describe, expect, it } from "vitest";

// Drives new-member seat assignment (`resolveSeatTypeForNewMembership`).
describe("getDefaultSeatTypeForContract — entitlement", () => {
  const productSeatTypes = new Map<string, MembershipSeatType>([
    ["workspace-product", "workspace"],
    ["workspace-yearly-product", "workspace_yearly"],
  ]);

  // Contract carries both the monthly and yearly workspace seat subscriptions,
  // but only `workspace_yearly` is entitled (the monthly one is dormant).
  const contract = {
    subscriptions: [
      {
        id: "sub_ws",
        subscription_rate: {
          product: { id: "workspace-product", name: "workspace" },
        },
      },
      {
        id: "sub_ws_yearly",
        subscription_rate: {
          product: {
            id: "workspace-yearly-product",
            name: "Workspace Seat (Yearly)",
          },
        },
      },
    ],
    recurring_credits: [],
    overrides: [
      { entitled: true, product: { id: "workspace-yearly-product" } },
    ],
  } as unknown as CachedContract;

  it("assigns the entitled seat, not a dormant lower-name subscription", () => {
    // Both seats are 0 AWU; without entitlement filtering the tie-break would
    // pick "workspace" (< "workspace_yearly"). Entitlement must win.
    expect(getDefaultSeatTypeForContract(contract, productSeatTypes)).toBe(
      "workspace_yearly"
    );
  });
});
