/*
Statement 0
  - Partial index for project_metadata.provisioningSource
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY project_metadata_provisioning_source ON public.project_metadata USING btree ("provisioningSource") WHERE ("provisioningSource" IS NOT NULL);
