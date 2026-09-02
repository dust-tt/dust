/*
Statement 0
  - Partial index backing Poke's workspace Frames list (Frames v2 files by updatedAt).
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY files_workspace_id_frame_v2_updated_at ON public.files USING btree ("workspaceId", "updatedAt") WHERE ("contentType" = 'application/vnd.dust.frame.v2+json');
