ALTER TABLE tables
ADD COLUMN csv_bucket TEXT,
ADD COLUMN csv_bucket_path TEXT;

-- both columns are nullable if no csv are usable for the content (eg: remote tables)