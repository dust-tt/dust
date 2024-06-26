BEGIN;
UPDATE content_fragments
WHERE "contentType" = 'file_attachment'
SET "contentType" = CASE
	WHEN title LIKE '%.csv' THEN 'text/csv'
	WHEN title LIKE '%.md' THEN 'text/markdown'
	WHEN title LIKE '%.pdf' THEN 'application/pdf'
	WHEN title LIKE '%.PDF' THEN 'application/pdf'
	ELSE 'text/plain' END;

UPDATE content_fragments
WHERE "contentType" = 'slack_thread_content'
SET "contentType" = 'dust-application/slack';
COMMIT;
