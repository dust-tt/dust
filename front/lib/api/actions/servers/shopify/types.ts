import { z } from "zod";

const MoneySchema = z.object({
  amount: z.string(),
  currencyCode: z.string(),
});

export const ShopifyCustomerStateSchema = z.enum([
  "DECLINED",
  "DISABLED",
  "ENABLED",
  "INVITED",
]);

export const CustomerNodeSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  defaultEmailAddress: z
    .object({
      emailAddress: z.string(),
    })
    .nullable(),
  defaultPhoneNumber: z
    .object({
      phoneNumber: z.string(),
    })
    .nullable(),
  state: ShopifyCustomerStateSchema,
  numberOfOrders: z.string(),
  amountSpent: MoneySchema,
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  defaultAddress: z
    .object({
      address1: z.string().nullable(),
      address2: z.string().nullable(),
      city: z.string().nullable(),
      province: z.string().nullable(),
      provinceCode: z.string().nullable(),
      country: z.string().nullable(),
      countryCodeV2: z.string().nullable(),
      zip: z.string().nullable(),
    })
    .nullable(),
});

export type ShopifyCustomerState = z.infer<typeof ShopifyCustomerStateSchema>;
export type ShopifyCustomer = z.infer<typeof CustomerNodeSchema>;

export interface CustomerListResult {
  customers: ShopifyCustomer[];
}

export const ProductNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  handle: z.string(),
  status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED", "UNLISTED"]),
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

export interface ProductListResult {
  products: ShopifyProduct[];
}
