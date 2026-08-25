import { z } from "zod";

const MoneySchema = z.object({
  amount: z.string(),
  currencyCode: z.string(),
});

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

export interface ProductExportResult {
  products: ShopifyProduct[];
  truncated: boolean;
}
