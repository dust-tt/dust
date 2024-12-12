\set ON_ERROR_STOP on

-- Check if the safety flag variable exists
\if :i_know_what_i_do
-- your migration code here
\else
\echo 'Safety flag not set. Run with: psql -v i_know_what_i_do=true -f migration_40.sql'
\q
\endif

DO $$
DECLARE
    r RECORD;
BEGIN
    -- First convert all PKs
    FOR r IN (
        SELECT
            t.table_name,
            c.column_name
        FROM information_schema.tables t
        JOIN information_schema.columns c
            ON t.table_name = c.table_name
            AND t.table_schema = c.table_schema
        JOIN information_schema.key_column_usage k
            ON c.column_name = k.column_name
            AND c.table_name = k.table_name
        WHERE c.data_type = 'integer'
            AND t.table_schema = 'public'
            AND EXISTS (
                SELECT 1
                FROM information_schema.table_constraints tc
                WHERE tc.constraint_type = 'PRIMARY KEY'
                    AND tc.table_name = t.table_name
                    AND tc.constraint_name = k.constraint_name
            )
    ) LOOP
        RAISE NOTICE 'Converting PK column % in table % to bigint', r.column_name, r.table_name;
        EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE bigint', r.table_name, r.column_name);
    END LOOP;

    -- Then convert all FKs
    FOR r IN (
        SELECT DISTINCT
            t.table_name,
            c.column_name
        FROM information_schema.tables t
        JOIN information_schema.columns c
            ON t.table_name = c.table_name
            AND t.table_schema = c.table_schema
        JOIN information_schema.key_column_usage k
            ON c.column_name = k.column_name
            AND c.table_name = k.table_name
        JOIN information_schema.table_constraints tc
            ON tc.constraint_name = k.constraint_name
        WHERE c.data_type = 'integer'
            AND t.table_schema = 'public'
            AND tc.constraint_type = 'FOREIGN KEY'
    ) LOOP
        RAISE NOTICE 'Converting FK column % in table % to bigint', r.column_name, r.table_name;
        EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE bigint', r.table_name, r.column_name);
    END LOOP;
END $$;