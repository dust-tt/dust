CREATE UNIQUE INDEX CONCURRENTLY shareable_files_file_id ON public.shareable_files USING btree ("fileId");
