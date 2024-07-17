-- Migration created on Jul 17, 2024
DELETE FROM google_drive_files WHERE "mimeType" = 'text/csv';
