-- pre deploy
ALTER TABLE tables ADD COLUMN parents TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE tables ADD COLUMN tags_array TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE tables ADD COLUMN timestamp BIGINT;

-- post deploy
UPDATE tables SET timestamp = created;
ALTER TABLE tables ALTER COLUMN timestamp SET NOT NULL;
