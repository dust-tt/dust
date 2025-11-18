-- Migration created on Nov 18, 2025
-- Add invoiceOrLineItemId column to credits table for idempotency in credit purchase flow
-- This column stores either a Stripe invoice ID (for Pro subscriptions) or a Stripe invoice line item ID (for Enterprise subscriptions)
ALTER TABLE "public"."credits" ADD COLUMN "invoiceOrLineItemId" VARCHAR(255);

-- Create unique index on (workspaceId, invoiceOrLineItemId) to prevent duplicate credit purchases
-- Uses partial index to only enforce uniqueness for non-null values
CREATE UNIQUE INDEX "credits_workspace_invoice_unique_idx" ON "public"."credits" ("workspaceId", "invoiceOrLineItemId") WHERE "invoiceOrLineItemId" IS NOT NULL;
