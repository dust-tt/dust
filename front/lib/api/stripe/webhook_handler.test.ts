import { processStripeWebhookEvent } from "@app/lib/api/stripe/webhook_handler";
import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { notifyAdminsSubscriptionPaymentFailed } from "@app/lib/notifications/triggers/subscription-lifecycle";
import { buildSubscriptionPaymentFailedEmailCopy } from "@app/lib/notifications/workflows/subscription-lifecycle";
import {
  createCustomerPortalSession,
  getStripeSubscription,
} from "@app/lib/plans/stripe";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types/user";
import { Stripe } from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  import("@app/lib/notifications/triggers/subscription-lifecycle"),
  async (importOriginal) => {
    const { Ok } = await import("@app/types/shared/result");
    return {
      ...(await importOriginal()),
      notifyAdminsSubscriptionPaymentFailed: vi
        .fn()
        .mockResolvedValue(new Ok(undefined)),
      notifyAdminsSubscriptionCanceled: vi
        .fn()
        .mockResolvedValue(new Ok(undefined)),
      notifyAdminsSubscriptionReactivated: vi
        .fn()
        .mockResolvedValue(new Ok(undefined)),
    };
  }
);

vi.mock(import("@app/lib/plans/stripe"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createCustomerPortalSession: vi.fn(),
    getStripeSubscription: vi.fn(),
  };
});

const STRIPE_SUBSCRIPTION_ID = "sub_payment_failed_test";
const METRONOME_CUSTOMER_ID = "cus_metronome_payment_failed_test";
const WEBHOOK_SECRET = "whsec_test_webhook_handler";

const stripe = new Stripe("sk_test_webhook_handler", {
  apiVersion: "2023-10-16",
  typescript: true,
});

type PaymentFailedInvoice = Pick<
  Stripe.Invoice,
  | "id"
  | "object"
  | "billing_reason"
  | "customer_email"
  | "metadata"
  | "subscription"
>;

type InvoiceRail = Pick<PaymentFailedInvoice, "subscription" | "metadata">;

interface BillingRail {
  name: string;
  setupWorkspace: () => Promise<WorkspaceType>;
  invoiceRail: InvoiceRail;
}

function makePaymentFailedEvent(
  customerEmail: string | null,
  invoiceRail: InvoiceRail
): Stripe.Event {
  const invoice: PaymentFailedInvoice = {
    id: "in_test",
    object: "invoice",
    billing_reason: "subscription_cycle",
    customer_email: customerEmail,
    ...invoiceRail,
  };
  const envelope: Stripe.EventBase = {
    id: "evt_test",
    object: "event",
    api_version: "2023-10-16",
    created: Math.floor(Date.now() / 1000),
    data: { object: invoice },
    livemode: false,
    pending_webhooks: 0,
    request: null,
    type: "invoice.payment_failed",
  };
  const payload = JSON.stringify(envelope);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });

  return stripe.webhooks.constructEvent(payload, signature, WEBHOOK_SECRET);
}

async function setupStripeBilledWorkspace(): Promise<WorkspaceType> {
  const workspace = await WorkspaceFactory.basic();
  const initialSubscription =
    await SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id);
  await initialSubscription.markAsEnded("ended");
  await SubscriptionResource.makeNew(
    {
      sId: generateRandomModelSId(),
      workspaceId: workspace.id,
      planId: initialSubscription.planId,
      status: "active",
      startDate: new Date(),
      endDate: null,
      stripeSubscriptionId: STRIPE_SUBSCRIPTION_ID,
    },
    initialSubscription.getPlan()
  );
  return workspace;
}

async function setupMetronomeBilledWorkspace(): Promise<WorkspaceType> {
  return WorkspaceFactory.metronome({
    metronomeCustomerId: METRONOME_CUSTOMER_ID,
  });
}

async function addMembers(workspace: WorkspaceType) {
  const activeAdmin = await UserFactory.basic();
  await MembershipFactory.associate(workspace, activeAdmin, { role: "admin" });

  const formerAdmin = await UserFactory.basic();
  await MembershipFactory.associate(workspace, formerAdmin, { role: "admin" });
  const revokeRes = await MembershipResource.revokeMembership({
    user: formerAdmin,
    workspace,
  });
  expect(revokeRes.isOk()).toBe(true);

  const member = await UserFactory.basic();
  await MembershipFactory.associate(workspace, member, { role: "user" });

  return { activeAdmin, formerAdmin, member };
}

const BILLING_RAILS: BillingRail[] = [
  {
    name: "Stripe-billed",
    setupWorkspace: setupStripeBilledWorkspace,
    invoiceRail: { subscription: STRIPE_SUBSCRIPTION_ID, metadata: {} },
  },
  {
    name: "Metronome-billed",
    setupWorkspace: setupMetronomeBilledWorkspace,
    invoiceRail: {
      subscription: null,
      metadata: { metronome_customer_id: METRONOME_CUSTOMER_ID },
    },
  },
];

describe.each(BILLING_RAILS)(
  "processStripeWebhookEvent invoice.payment_failed ($name)",
  ({ setupWorkspace, invoiceRail }) => {
    beforeEach(() => {
      vi.mocked(getStripeSubscription).mockResolvedValue(null);
    });

    async function processPaymentFailed(customerEmail: string | null) {
      return processStripeWebhookEvent({
        event: makePaymentFailedEvent(customerEmail, invoiceRail),
        stripe,
        now: new Date(),
      });
    }

    it("emails only the active admins when customer_email is a revoked admin", async () => {
      const workspace = await setupWorkspace();
      const { activeAdmin, formerAdmin } = await addMembers(workspace);

      const result = await processPaymentFailed(formerAdmin.email);

      expect(result.isOk()).toBe(true);
      expect(notifyAdminsSubscriptionPaymentFailed).toHaveBeenCalledTimes(1);
      const [{ admins, workspaceId }] = vi.mocked(
        notifyAdminsSubscriptionPaymentFailed
      ).mock.calls[0];
      expect(workspaceId).toBe(workspace.sId);
      expect(admins.map((a) => a.email)).toEqual([activeAdmin.email]);
    });

    it("does not email an outsider customer_email", async () => {
      const workspace = await setupWorkspace();
      const { activeAdmin } = await addMembers(workspace);

      const result = await processPaymentFailed("outsider@example.com");

      expect(result.isOk()).toBe(true);
      const recipients = vi
        .mocked(notifyAdminsSubscriptionPaymentFailed)
        .mock.calls.flatMap(([{ admins }]) => admins.map((a) => a.email));
      expect(recipients).toEqual([activeAdmin.email]);
    });

    it("never mints a billing-portal session and links to the manage page", async () => {
      const workspace = await setupWorkspace();
      await addMembers(workspace);

      const result = await processPaymentFailed(null);

      expect(result.isOk()).toBe(true);
      expect(createCustomerPortalSession).not.toHaveBeenCalled();
      const [[payload]] = vi.mocked(notifyAdminsSubscriptionPaymentFailed).mock
        .calls;
      const { action } = buildSubscriptionPaymentFailedEmailCopy(
        await getNotificationI18n("en-US"),
        payload
      );
      expect(action?.url).toBe(
        `http://fake-url/w/${workspace.sId}/subscription/manage`
      );
    });
  }
);
