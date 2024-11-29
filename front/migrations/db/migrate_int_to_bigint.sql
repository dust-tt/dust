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
    p_refs jsonb
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
    FOR r IN SELECT * FROM jsonb_array_elements(p_refs) AS t(ref)
    LOOP
        RETURN QUERY
        EXECUTE format(
            'SELECT %L::text as table_name,
                    COUNT(*)::bigint as total_rows,
                    COUNT(%I)::bigint as migrated_rows,
                    ROUND((COUNT(%I)::numeric / COUNT(*)::numeric * 100), 2) as progress_percentage
             FROM %I',
            r.ref->>'table_name',                           -- table_name
            format('%s_new', r.ref->>'foreign_key_column'), -- new column count
            format('%s_new', r.ref->>'foreign_key_column'), -- new column ratio
            r.ref->>'table_name'                            -- table name
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 1. Setup Phase (DDL operations, auto-committing)
CREATE OR REPLACE FUNCTION setup_bigint_migration(
    p_table_name text
) RETURNS jsonb AS $$
DECLARE
    r RECORD;
    v_referencing_tables jsonb;
    v_table_exists boolean;
    v_count int;
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

    RAISE NOTICE 'Starting setup for table: %', p_table_name;

    -- Find and store all referencing tables
    -- This query identifies all tables that have foreign keys pointing to our target table
    -- We store them in a temporary table for easier processing
     -- Get referencing tables info
    EXECUTE format('
        SELECT jsonb_agg(
            jsonb_build_object(
                ''schema'', table_schema,
                ''table_name'', table_name,
                ''foreign_key_column'', foreign_key_column,
                ''constraint_name'', constraint_name
            )
        )
        FROM (
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
                AND ccu.column_name = ''id''
        ) t',
        p_table_name
    ) INTO v_referencing_tables;

    SELECT jsonb_array_length(COALESCE(v_referencing_tables, '[]'::jsonb))  INTO v_count;
    RAISE NOTICE 'Found % referencing tables', v_count;

    -- Add new columns
    -- Add BIGINT column to main table
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS new_id BIGINT', p_table_name);
    RAISE NOTICE 'Created new column in %', p_table_name;

    -- Add columns to referencing tables
    FOR r IN SELECT * FROM jsonb_array_elements(v_referencing_tables) AS t(ref)
    LOOP
        RAISE NOTICE 'Adding new column to %', r.ref->>'table_name';

        EXECUTE format(
            'ALTER TABLE %I ADD COLUMN IF NOT EXISTS %I BIGINT',
            r.ref->>'table_name',
            format('%s_new', r.ref->>'foreign_key_column')
        );
    END LOOP;

    -- Setup triggers
    -- Setup trigger on main table to keep new_id in sync with id
    PERFORM create_bigint_sync_function(p_table_name);
    PERFORM create_bigint_sync_trigger(p_table_name);

    FOR r IN SELECT * FROM jsonb_array_elements(v_referencing_tables) AS t(ref)
    LOOP
        RAISE NOTICE 'Creating trigger for %', r.ref->>'table_name';

        -- Create FK sync function and trigger
        PERFORM create_fk_sync_function(r.ref->>'table_name', r.ref->>'foreign_key_column');
        PERFORM create_fk_sync_trigger(r.ref->>'table_name');
    END LOOP;

    -- Return the referencing tables info
    RETURN v_referencing_tables;
END;
$$ LANGUAGE plpgsql;


-- 2. Backfill Phase (as a procedure to handle transactions)
CREATE OR REPLACE PROCEDURE backfill_bigint_migration(
    p_table_name text,
    p_refs jsonb,
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
    FOR r IN SELECT * FROM jsonb_array_elements(p_refs) AS t(ref)
    LOOP
        -- Process each referencing table in batches
        CALL backfill_column_in_batches(
            r.ref->>'table_name',                           -- table name
            r.ref->>'foreign_key_column',                   -- source column
            format('%s_new', r.ref->>'foreign_key_column'), -- target column
            p_batch_size                                    -- batch size
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql;


-- We don't use function here because we want to handle transactions.
-- The function rollbacks the entire transaction if an error occurs.

-- Validate the inputs.
\if :{?step}
\else
    \echo 'Error: step parameter is required'
    \quit
\endif

\if :{?table_name}
\else
    \echo 'Error: table_name parameter is required'
    \quit
\endif

\if :{?batch_size}
\else
    \echo 'Error: batch_size parameter is required'
    \quit
\endif

-- Main execution flow based on step

-- Create status table if it doesn't exist
CREATE TABLE IF NOT EXISTS bigint_migration_status (
    table_name text PRIMARY KEY,
    setup_completed timestamptz,
    backfill_completed timestamptz,
    cutover_completed timestamptz,
    referencing_tables jsonb  -- Store referencing tables info as JSON
);

-- 1. Setup (returns temp table name)
\set step_is_setup `echo :step | grep -q '^setup$' && echo 1 || echo 0`
\if :step_is_setup
    -- Run setup and store result
    INSERT INTO bigint_migration_status (table_name, referencing_tables, setup_completed)
    VALUES (
        :'table_name',
        (SELECT setup_bigint_migration(:'table_name')),
        NOW()
    )
    ON CONFLICT (table_name) DO UPDATE
    SET referencing_tables = EXCLUDED.referencing_tables,
        setup_completed = NOW();

    \echo 'Setup completed. You can now run the backfill step.'
\endif

-- Backfill Phase
\set step_is_backfill `echo :step | grep -q '^backfill$' && echo 1 || echo 0`
\if :step_is_backfill
    \echo 'Step 2: Starting backfill'

    -- Get temp table name directly in the current connection
    \gset
    SELECT
        referencing_tables::text as refs
    FROM bigint_migration_status
    WHERE table_name = :'table_name' \gset

    \if :{?refs}
        -- Run backfill
        CALL backfill_bigint_migration(:'table_name', :'refs'::jsonb, :batch_size);

        -- Update status
        UPDATE bigint_migration_status
        SET backfill_completed = NOW()
        WHERE table_name = :'table_name';

        -- Show progress
        SELECT * FROM check_migration_progress(:'table_name', :'refs'::jsonb);
        \echo 'Backfill completed. You can now run the cutover step.'
    \else
        \echo 'Error: Setup step must be completed first'
        \quit
    \endif
\endif