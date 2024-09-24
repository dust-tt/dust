-- pre deploy
ALTER TABLE tables ADD COLUMN remote_database_table_id TEXT; -- nullable if not a remote table
ALTER TABLE tables ADD COLUMN remote_database_secret_id TEXT; -- nullable if not a remote table

