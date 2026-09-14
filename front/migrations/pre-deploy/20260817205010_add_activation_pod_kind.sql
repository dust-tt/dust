ALTER TABLE "public"."activation_pods"
  ADD COLUMN IF NOT EXISTS "kind" character varying(255) DEFAULT 'learning' NOT NULL;
