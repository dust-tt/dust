import { switchToMetronomeBillingPlugin } from "@app/lib/api/poke/plugins/workspaces/switch_to_metronome_billing";
import { Authenticator } from "@app/lib/auth";
import { addStripeMetronomeBillingConfig } from "@app/lib/metronome/client";
import { getStripeSubscription } from "@app/lib/plans/stripe";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/plans/stripe", async () => {
  const actual = await vi.importActual("@app/lib/plans/stripe");
  return {
    ...actual,
    getStripeSubscription: vi.fn(),
    cancelSubscriptionAtPeriodEnd: vi.fn(),
  };
});

vi.mock("@app/lib/metronome/client", async () => {
  const actual = await vi.importActual("@app/lib/metronome/client");
  return {
    ...actual,
    addStripeMetronomeBillingConfig: vi.fn(),
  };
});

const METRONOME_CUSTOMER_ID = "metronome-customer-id";
const STRIPE_SUBSCRIPTION_ID = "sub_test_xxx";
const METRONOME_CONTRACT_ID = "contract_test_xxx";
const PERIOD_END_SECONDS = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

function makeMockStripeSubscription(
  overrides: Partial<Stripe.Subscription> = {}
): Stripe.Subscription {
  return {
    id: STRIPE_SUBSCRIPTION_ID,
    customer: "cus_test",
    current_period_end: PERIOD_END_SECONDS,
    status: "active",
    cancel_at_period_end: false,
    items: { data: [], has_more: false, object: "list", url: "" },
    ...overrides,
  } as Stripe.Subscription;
}

/**
 * Sets up a workspace with metronomeCustomerId and a subscription with both
 * stripeSubscriptionId and metronomeContractId, simulating a shadow-billed workspace.
 */
async function setupWorkspaceWithMetronomeAndStripe() {
  const workspace = await WorkspaceFactory.basic();
  await WorkspaceResource.updateMetronomeCustomerId(
    workspace.id,
    METRONOME_CUSTOMER_ID
  );

  const sub = await SubscriptionResource.fetchActiveByWorkspaceModelId(
    workspace.id
  );
  await sub!.markAsEnded("ended");
  await SubscriptionResource.makeNew(
    {
      sId: generateRandomModelSId(),
      workspaceId: workspace.id,
      planId: sub!.planId,
      status: "active",
      startDate: new Date(),
      endDate: null,
      stripeSubscriptionId: STRIPE_SUBSCRIPTION_ID,
      metronomeContractId: METRONOME_CONTRACT_ID,
    },
    sub!.getPlan()
  );

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  return { workspace, auth };
}

describe("switchToMetronomeBillingPlugin", () => {
  describe("execute", () => {
    it("returns Err when workspace has no Metronome contract", async () => {
      // WorkspaceFactory creates a workspace with no metronomeCustomerId and
      // no metronomeContractId on the subscription.
      const workspace = await WorkspaceFactory.basic();
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      const result = await switchToMetronomeBillingPlugin.execute(
        auth,
        null,
        {}
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("No Metronome contract");
      }
    });

    it("returns Err when subscription has no Stripe subscription ID", async () => {
      const workspace = await WorkspaceFactory.basic();
      await WorkspaceResource.updateMetronomeCustomerId(
        workspace.id,
        METRONOME_CUSTOMER_ID
      );

      // Subscription has metronomeContractId but no stripeSubscriptionId.
      const sub = await SubscriptionResource.fetchActiveByWorkspaceModelId(
        workspace.id
      );
      await sub!.markAsEnded("ended");
      await SubscriptionResource.makeNew(
        {
          sId: generateRandomModelSId(),
          workspaceId: workspace.id,
          planId: sub!.planId,
          status: "active",
          startDate: new Date(),
          endDate: null,
          stripeSubscriptionId: null,
          metronomeContractId: METRONOME_CONTRACT_ID,
        },
        sub!.getPlan()
      );

      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
      const result = await switchToMetronomeBillingPlugin.execute(
        auth,
        null,
        {}
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("No Stripe subscription found");
      }
    });

    it("returns Err when Stripe subscription is not found", async () => {
      const { auth } = await setupWorkspaceWithMetronomeAndStripe();
      vi.mocked(getStripeSubscription).mockResolvedValue(null);

      const result = await switchToMetronomeBillingPlugin.execute(
        auth,
        null,
        {}
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain(
          "Could not retrieve Stripe subscription"
        );
      }
    });

    it("returns Err when addStripeMetronomeBillingConfig fails", async () => {
      const { auth } = await setupWorkspaceWithMetronomeAndStripe();
      vi.mocked(getStripeSubscription).mockResolvedValue(
        makeMockStripeSubscription()
      );
      vi.mocked(addStripeMetronomeBillingConfig).mockResolvedValue(
        new Err(new Error("Metronome API error"))
      );

      const result = await switchToMetronomeBillingPlugin.execute(
        auth,
        null,
        {}
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe("Metronome API error");
      }
    });

    it("marks old subscription as ended_backend_only, creates new one without Stripe, and returns success message", async () => {
      const { workspace, auth } = await setupWorkspaceWithMetronomeAndStripe();
      vi.mocked(getStripeSubscription).mockResolvedValue(
        makeMockStripeSubscription()
      );
      vi.mocked(addStripeMetronomeBillingConfig).mockResolvedValue(
        new Ok(undefined)
      );

      const result = await switchToMetronomeBillingPlugin.execute(
        auth,
        null,
        {}
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.display).toBe("text");
        expect(result.value.value).toContain(STRIPE_SUBSCRIPTION_ID);
        expect(result.value.value).toContain(METRONOME_CONTRACT_ID);
      }

      // New active subscription has no stripeSubscriptionId, keeps metronomeContractId,
      // and starts at the Stripe period end date.
      const newSub = await SubscriptionResource.fetchActiveByWorkspaceModelId(
        workspace.id
      );
      expect(newSub).not.toBeNull();
      expect(newSub!.stripeSubscriptionId).toBeNull();
      expect(newSub!.metronomeContractId).toBe(METRONOME_CONTRACT_ID);
      expect(newSub!.startDate.getTime()).toBe(PERIOD_END_SECONDS * 1000);
    });
  });
});
