-- Migration script to convert INT primary keys and foreign keys to BIGINT
-- This script handles:
-- 1. Finding all referencing tables
-- 2. Adding new BIGINT columns to all affected tables
-- 3. Setting up synchronization triggers
-- 4. Backfilling data in batches
--
-- Usage: psql -v table_name=your_table -v batch_size=10000 -f migrate_int_to_bigint.sql
----------------------------------------------------------------------------

-- Enable notice output and stop on error
\set ON_ERROR_STOP on
\set VERBOSITY verbose

-- Function to create the sync trigger (local to the table, name does not need to be unique)
CREATE OR REPLACE FUNCTION create_bigint_sync_function(p_table_name text)
RETURNS void AS $$
BEGIN
    EXECUTE format($func$
        CREATE OR REPLACE FUNCTION %I_bigint_sync_trigger()
        RETURNS TRIGGER AS $BODY$
        BEGIN
            NEW.new_id := NEW.id;
            RETURN NEW;
        END;
        $BODY$ LANGUAGE plpgsql;
    $func$,
        p_table_name  -- For function name
    );
END;
$$ LANGUAGE plpgsql;

-- Function to create the sync trigger
CREATE OR REPLACE FUNCTION create_bigint_sync_trigger(p_table_name text)
RETURNS void AS $$
BEGIN
    RAISE NOTICE 'Setting up triggers for table: %', p_table_name;

    -- First drop if exists (will show notice)
    EXECUTE format('DROP TRIGGER IF EXISTS bigint_sync ON %I', p_table_name);

    -- Then create new trigger
    EXECUTE format($trig$
        CREATE TRIGGER bigint_sync
            BEFORE INSERT OR UPDATE ON %I
            FOR EACH ROW
            EXECUTE FUNCTION %I_bigint_sync_trigger();
    $trig$,
        p_table_name,   -- For ON table
        p_table_name    -- For function name
    );

    RAISE NOTICE 'Completed trigger setup for table: %', p_table_name;
END;
$$ LANGUAGE plpgsql;

-- Function to create the foreign key sync function
CREATE OR REPLACE FUNCTION create_fk_sync_function(
    p_table_name text,
    p_fk_column text
) RETURNS void AS $$
BEGIN
    EXECUTE format($func$
        CREATE OR REPLACE FUNCTION %I_fk_sync_trigger()
        RETURNS TRIGGER AS $TRIG$
        BEGIN
            NEW.%I := NEW.%I;
            RETURN NEW;
        END;
        $TRIG$ LANGUAGE plpgsql;
    $func$,
        p_table_name,                   -- For function name
        format('%s_new', p_fk_column),  -- For new column
        p_fk_column                     -- For old column
    );
END;
$$ LANGUAGE plpgsql;

-- Function to create the foreign key sync trigger
CREATE OR REPLACE FUNCTION create_fk_sync_trigger(
    p_table_name text
) RETURNS void AS $$
BEGIN
    RAISE NOTICE 'Setting up FK triggers for table: %', p_table_name;

    -- First drop if exists (will show notice)
    EXECUTE format('DROP TRIGGER IF EXISTS fk_sync ON %I', p_table_name);

    -- Then create new trigger
    EXECUTE format($trig$
        CREATE TRIGGER fk_sync
            BEFORE INSERT OR UPDATE ON %I
            FOR EACH ROW
            EXECUTE FUNCTION %I_fk_sync_trigger();
    $trig$,
        p_table_name,    -- For ON table
        p_table_name,    -- For ON table again
        p_table_name     -- For function name
    );

    RAISE NOTICE 'Completed FK trigger setup for table: %', p_table_name;
END;
$$ LANGUAGE plpgsql;

-- Batching procedure - handles its own transactions
CREATE OR REPLACE PROCEDURE backfill_column_in_batches(
    p_table_name text,          -- Table to update
    p_source_column text,       -- Column to copy from
    p_target_column text,       -- Column to copy to
    p_batch_size int            -- Batch size
) AS $$
DECLARE
    v_max_id INTEGER;
    v_current_id INTEGER := 0;
BEGIN
    -- Get max id
    EXECUTE format('SELECT COALESCE(MAX(id), 0) FROM %I', p_table_name) INTO v_max_id;

    RAISE NOTICE 'Starting backfill of %.% into %.%',
        p_table_name, p_source_column, p_table_name, p_target_column;

    -- Process in batches
    WHILE v_current_id <= v_max_id LOOP
        -- Update batch
        EXECUTE format(
            'UPDATE %I SET %I = %I
             WHERE id > $1 AND id <= $2
             AND %I IS NULL',  -- Only processes unprocessed rows
            p_table_name,
            p_target_column,
            p_source_column,
            p_target_column
        ) USING v_current_id, v_current_id + p_batch_size;

        v_current_id := v_current_id + p_batch_size;
        RAISE NOTICE 'Processed % up to id % of %',
            p_table_name, v_current_id, v_max_id;
        COMMIT; -- Each batch in its own transaction
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to verify backfill progress
CREATE OR REPLACE FUNCTION check_migration_progress(
    p_table_name text,
    p_temp_table_name text
) RETURNS TABLE (
    table_name text,
    total_rows bigint,
    migrated_rows bigint,
    progress_percentage numeric
) AS $$
DECLARE
    r RECORD;
BEGIN
    -- Check main table
    RETURN QUERY
    EXECUTE format(
        'SELECT %L::text as table_name,
                COUNT(*)::bigint as total_rows,
                COUNT(new_id)::bigint as migrated_rows,
                ROUND((COUNT(new_id)::numeric / COUNT(*)::numeric * 100), 2) as progress_percentage
         FROM %I',
        p_table_name, p_table_name
    );

    -- Check each referencing table
    FOR r IN EXECUTE format('SELECT table_name, foreign_key_column FROM %s', p_temp_table_name) LOOP
        RETURN QUERY
        EXECUTE format(
            'SELECT %L::text as table_name,
                    COUNT(*)::bigint as total_rows,
                    COUNT(%I)::bigint as migrated_rows,
                    ROUND((COUNT(%I)::numeric / COUNT(*)::numeric * 100), 2) as progress_percentage
             FROM %I',
            r.table_name,                           -- table_name
            format('%s_new', r.foreign_key_column), -- new column count
            format('%s_new', r.foreign_key_column), -- new column ratio
            r.table_name                            -- table name
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql;


-- 1. Setup Phase (DDL operations, auto-committing)
CREATE OR REPLACE FUNCTION setup_bigint_migration(
    p_table_name text
) RETURNS text AS $$
DECLARE
    r RECORD;
    v_temp_table_name text;
    v_table_exists boolean;
BEGIN
    -- Validate parameter
    IF p_table_name IS NULL THEN
        RAISE EXCEPTION 'Table name must be provided';
    END IF;

    -- First verify the table exists
    EXECUTE format('
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_name = %L
        )', p_table_name) INTO v_table_exists;

    IF NOT v_table_exists THEN
        RAISE EXCEPTION 'Table % does not exist', p_table_name;
    END IF;

    -- Set temp table name
    v_temp_table_name := format('%I_referencing_tables', p_table_name);
    RAISE NOTICE 'Starting setup for table: %', p_table_name;

    -- Find and store all referencing tables
    -- This query identifies all tables that have foreign keys pointing to our target table
    -- We store them in a temporary table for easier processing
    EXECUTE format('
        CREATE TEMP TABLE %s AS
        SELECT DISTINCT
            tc.table_schema,
            tc.table_name,
            kcu.column_name as foreign_key_column,
            tc.constraint_name
        FROM
            information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
        WHERE
            tc.constraint_type = ''FOREIGN KEY''
            AND ccu.table_name = %L
            AND ccu.column_name = ''id''',
        v_temp_table_name, p_table_name
    );

    EXECUTE format('SELECT COUNT(*) FROM %s', v_temp_table_name) INTO r;
    RAISE NOTICE 'Found % referencing tables', r;

    -- Add new columns
    -- Add BIGINT column to main table
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS new_id BIGINT', p_table_name);
    RAISE NOTICE 'Created new column in %', p_table_name;

    -- Add columns to referencing tables
    FOR r IN EXECUTE format('SELECT * FROM %s', v_temp_table_name) LOOP
        RAISE NOTICE 'Adding new column to %', r.table_name;

        EXECUTE format(
            'ALTER TABLE %I ADD COLUMN IF NOT EXISTS %I BIGINT',
            r.table_name,
            format('%s_new', r.foreign_key_column)
        );
    END LOOP;

    -- Setup triggers
    -- Setup trigger on main table to keep new_id in sync with id
    PERFORM create_bigint_sync_function(p_table_name);
    PERFORM create_bigint_sync_trigger(p_table_name);

    FOR r IN EXECUTE format('SELECT * FROM %s', v_temp_table_name) LOOP
        RAISE NOTICE 'Creating trigger for %', r.table_name;

        -- Create FK sync function and trigger
        PERFORM create_fk_sync_function(r.table_name, r.foreign_key_column);
        PERFORM create_fk_sync_trigger(r.table_name);
    END LOOP;

    -- Return the temp table name
    RETURN v_temp_table_name;
END;
$$ LANGUAGE plpgsql;


-- 2. Backfill Phase (as a procedure to handle transactions)
CREATE OR REPLACE PROCEDURE backfill_bigint_migration(
    p_table_name text,
    p_temp_table_name text,
    p_batch_size int
) AS $$
DECLARE
    r RECORD;
BEGIN
    -- Validate parameters
    IF p_batch_size IS NULL THEN
        RAISE EXCEPTION 'Batch size must be provided';
    END IF;

    -- Backfill main table
    CALL backfill_column_in_batches(
        p_table_name,   -- table name
        'id',           -- source column
        'new_id',       -- target column
        p_batch_size    -- batch size
    );

    -- Backfill referencing tables
    FOR r IN EXECUTE format('SELECT * FROM %s', p_temp_table_name) LOOP
        -- Process each referencing table in batches
        CALL backfill_column_in_batches(
            r.table_name,                           -- table name
            r.foreign_key_column,                   -- source column
            format('%s_new', r.foreign_key_column), -- target column
            p_batch_size                            -- batch size
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql;


-- We don't use function here because we want to handle transactions.
-- The function rollbacks the entire transaction if an error occurs.

-- 1. Setup (returns temp table name)
\echo 'Step 1: Setting up migration for table' :table_name
SELECT setup_bigint_migration(:'table_name') AS temp_table_name \gset

-- Now we can use :temp_table_name in subsequent commands
\echo 'Using temp table:' :temp_table_name

-- 2. Backfill (handles its own transactions)
\echo 'Step 2: Starting backfill'
CALL backfill_bigint_migration(:'table_name', :'temp_table_name', :batch_size);

-- 3. Verify results
SELECT * FROM check_migration_progress(:'table_name', :'temp_table_name');

-- 3. Finalize
-- SELECT finalize_bigint_migration('users', 'users_referencing_tables');

-- Cleanup
DROP TABLE IF EXISTS :temp_table_name;
