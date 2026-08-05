/*
Statement 0
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY idx_skill_file_attachment_file ON public.skill_file_attachments USING btree ("fileId");
