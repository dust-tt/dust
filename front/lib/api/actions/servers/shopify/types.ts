import { z } from "zod";

const MoneySchema = z.object({
  amount: z.string(),
  currencyCode: z.string(),
});
const MoneyBagSchema = z.object({ shopMoney: MoneySchema });

export const PageInfoSchema = z.object({
  hasNextPage: z.boolean(),
  endCursor: z.string().nullable(),
});

export const ProductNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  handle: z.string(),
  status: z.string(),
  vendor: z.string(),
  productType: z.string(),
  totalInventory: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  priceRangeV2: z.object({
    minVariantPrice: MoneySchema,
    maxVariantPrice: MoneySchema,
  }),
});
export type ShopifyProduct = z.infer<typeof ProductNodeSchema>;

// Customer lifetime value: level 1 (non-identifying) data only, identified by
// ID. Name/email/phone are protected customer fields (PCD level 2) and are
// intentionally not requested.
export const CustomerNodeSchema = z.object({
  id: z.string(),
  // Shopify serializes numberOfOrders (UnsignedInt64) as a string.
  numberOfOrders: z.union([z.string(), z.number()]),
  amountSpent: MoneySchema,
  createdAt: z.string(),
});
export type ShopifyCustomer = z.infer<typeof CustomerNodeSchema>;

export const OrderNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  displayFinancialStatus: z.string().nullable(),
  displayFulfillmentStatus: z.string(),
  totalPriceSet: MoneyBagSchema,
  subtotalPriceSet: MoneyBagSchema.nullable(),
  totalTaxSet: MoneyBagSchema.nullable(),
  // Reference the customer by ID only (no PII).
  customer: z.object({ id: z.string() }).nullable(),
});
export type ShopifyOrder = z.infer<typeof OrderNodeSchema>;

// Minimal order shape used to aggregate spend per customer over a period.
export const OrderAggNodeSchema = z.object({
  id: z.string(),
  totalPriceSet: MoneyBagSchema,
  customer: z.object({ id: z.string() }).nullable(),
});

export interface TopCustomer {
  customerId: string;
  numberOfOrders: number;
  amountSpent: { amount: string; currencyCode: string };
}

export interface ExportResult<N> {
  nodes: N[];
  truncated: boolean;
}
