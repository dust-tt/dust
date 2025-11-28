-- Migration created on Nov 18, 2025
-- Add invoiceOrLineItemId column to credits table for idempotency in credit purchase flow
-- This column stores either a Stripe invoice ID (for Pro subscriptions) or a Stripe invoice line item ID (for Enterprise subscriptions)
ALTER TABLE "public"."credits" ADD COLUMN "invoiceOrLineItemId" VARCHAR(255);

-- Add type column to distinguish between credit types (free, payg, committed)
-- Validation enforced at application level in CreditResource.makeNew() and CreditModel
ALTER TABLE "public"."credits" ADD COLUMN "type" VARCHAR(16) NOT NULL;

-- Add startDate column to track when a credit becomes active/consumable
-- Credits with null startDate are not yet paid/active and cannot be consumed
ALTER TABLE "public"."credits" ADD COLUMN "startDate" TIMESTAMP WITH TIME ZONE;

-- Create unique index on (workspaceId, invoiceOrLineItemId) to prevent duplicate credit purchases
-- Uses partial index to only enforce uniqueness for non-null values
CREATE UNIQUE INDEX "credits_invoice_unique_idx" ON "public"."credits" ("invoiceOrLineItemId") WHERE "invoiceOrLineItemId" IS NOT NULL;

-- Create composite index for efficient queries on active credits
CREATE INDEX "credits_workspace_start_expiration_idx" ON "public"."credits" ("workspaceId", "startDate", "expirationDate");
