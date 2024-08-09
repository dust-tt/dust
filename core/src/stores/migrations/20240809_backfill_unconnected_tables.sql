UPDATE "tables"
SET
    "parents" = ARRAY["table_id"]
WHERE
    array_length(parents, 1) is null;