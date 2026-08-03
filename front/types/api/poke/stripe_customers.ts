import type { SupportedCurrency } from "@app/types/currency";
import { z } from "zod";

export const PostPokeStripeCustomerCurrencyBodySchema = z.object({
  stripeCustomerId: z.string().min(1, "Required"),
});

export type PostPokeStripeCustomerCurrencyResponseBody = {
  currency: SupportedCurrency;
};
