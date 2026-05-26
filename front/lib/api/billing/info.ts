import type { Authenticator } from "@app/lib/auth";
import {
  getBillingStripeCustomerId,
  getStripeClient,
} from "@app/lib/plans/stripe";
import { isCreditPricedPlan } from "@app/types/plan";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { errorToString } from "@app/types/shared/utils/error_utils";
import type Stripe from "stripe";

export type BillingAddress = {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
};

export type BillingProfile = {
  name: string | null;
  email: string | null;
  phone: string | null;
  address: BillingAddress | null;
};

export type BillingPaymentMethod = {
  type: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  bankName: string | null;
  country: string | null;
};

export type BillingInfo = {
  profile: BillingProfile;
  paymentMethod: BillingPaymentMethod | null;
};

export type GetBillingInfoResponseBody = {
  billingInfo: BillingInfo | null;
};

function serializeAddress(
  address: Stripe.Address | null | undefined
): BillingAddress | null {
  if (!address) {
    return null;
  }

  const serialized = {
    line1: address.line1 ?? null,
    line2: address.line2 ?? null,
    city: address.city ?? null,
    state: address.state ?? null,
    postalCode: address.postal_code ?? null,
    country: address.country ?? null,
  };

  return Object.values(serialized).some((value) => value !== null)
    ? serialized
    : null;
}

function isExpandedPaymentMethod(
  paymentMethod: Stripe.Customer.InvoiceSettings["default_payment_method"]
): paymentMethod is Stripe.PaymentMethod {
  return typeof paymentMethod === "object" && paymentMethod !== null;
}

function serializePaymentMethod(
  paymentMethod: Stripe.PaymentMethod
): BillingPaymentMethod {
  switch (paymentMethod.type) {
    case "card":
      return {
        type: paymentMethod.type,
        brand: paymentMethod.card?.brand ?? null,
        last4: paymentMethod.card?.last4 ?? null,
        expMonth: paymentMethod.card?.exp_month ?? null,
        expYear: paymentMethod.card?.exp_year ?? null,
        bankName: null,
        country: paymentMethod.card?.country ?? null,
      };

    case "sepa_debit":
      return {
        type: paymentMethod.type,
        brand: null,
        last4: paymentMethod.sepa_debit?.last4 ?? null,
        expMonth: null,
        expYear: null,
        bankName: paymentMethod.sepa_debit?.bank_code ?? null,
        country: paymentMethod.sepa_debit?.country ?? null,
      };

    case "us_bank_account":
      return {
        type: paymentMethod.type,
        brand: null,
        last4: paymentMethod.us_bank_account?.last4 ?? null,
        expMonth: null,
        expYear: null,
        bankName: paymentMethod.us_bank_account?.bank_name ?? null,
        country: null,
      };

    default:
      return {
        type: paymentMethod.type,
        brand: null,
        last4: null,
        expMonth: null,
        expYear: null,
        bankName: null,
        country: null,
      };
  }
}

async function getDefaultPaymentMethod(
  customer: Stripe.Customer
): Promise<BillingPaymentMethod | null> {
  const defaultPaymentMethod = customer.invoice_settings.default_payment_method;
  if (!defaultPaymentMethod) {
    return null;
  }

  if (isExpandedPaymentMethod(defaultPaymentMethod)) {
    return serializePaymentMethod(defaultPaymentMethod);
  }

  const paymentMethod =
    await getStripeClient().paymentMethods.retrieve(defaultPaymentMethod);
  return serializePaymentMethod(paymentMethod);
}

export async function getWorkspaceBillingInfo(
  auth: Authenticator
): Promise<Result<BillingInfo | null, Error>> {
  const owner = auth.workspace() ?? null;
  const subscription = auth.subscription() ?? null;

  if (!owner || !subscription || !isCreditPricedPlan(subscription.plan)) {
    return new Ok(null);
  }

  const stripeCustomerIdRes = await getBillingStripeCustomerId({
    owner,
    subscription,
  });
  if (stripeCustomerIdRes.isErr()) {
    return stripeCustomerIdRes;
  }
  if (!stripeCustomerIdRes.value) {
    return new Ok(null);
  }

  try {
    const customer = await getStripeClient().customers.retrieve(
      stripeCustomerIdRes.value,
      {
        expand: ["invoice_settings.default_payment_method"],
      }
    );

    if (customer.deleted) {
      return new Ok(null);
    }

    return new Ok({
      profile: {
        name: customer.name ?? null,
        email: customer.email ?? null,
        phone: customer.phone ?? null,
        address: serializeAddress(customer.address),
      },
      paymentMethod: await getDefaultPaymentMethod(customer),
    });
  } catch (error) {
    return new Err(new Error(errorToString(error)));
  }
}
