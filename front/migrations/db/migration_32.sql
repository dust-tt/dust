-- Migration created on Jul 03, 2024
ALTER TABLE content_fragments
ADD COLUMN "fileId" INTEGER;

-- Create the index on fileId
CREATE INDEX content_fragments_file_id
ON content_fragments("fileId");

-- Add the foreign key constraint
ALTER TABLE content_fragments
ADD CONSTRAINT "content_fragments_fileId_fkey"
FOREIGN KEY ("fileId")
REFERENCES files(id)
ON UPDATE CASCADE
ON DELETE SET NULL;
