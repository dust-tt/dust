ALTER TABLE "public"."credit_usage_configurations" ADD COLUMN "topUpEnabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "public"."credit_usage_configurations" ADD COLUMN "autoInvoiceFinalizationEnabled" boolean NOT NULL DEFAULT true;
