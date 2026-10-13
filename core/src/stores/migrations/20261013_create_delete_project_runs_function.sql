CREATE OR REPLACE FUNCTION delete_project_runs(v_project_id BIGINT)
RETURNS void AS $$
DECLARE
    runs_ids BIGINT[];
    block_exec_ids BIGINT[];
BEGIN
    -- Store runs IDs in an array for the specified project
    SELECT array_agg(id) INTO runs_ids FROM runs WHERE project = v_project_id;

    -- Store block_execution IDs in an array
    SELECT array_agg(block_execution) INTO block_exec_ids
    FROM runs_joins
    WHERE run = ANY(runs_ids);

    -- Delete from runs_joins where run IDs match those in the project
    DELETE FROM runs_joins WHERE run = ANY(runs_ids);

    -- Now delete from block_executions using the stored IDs
    DELETE FROM block_executions WHERE id = ANY(block_exec_ids);

    -- Finally, delete from runs where runs IDs match those in the project
    DELETE FROM runs WHERE id = ANY(runs_ids);
END;
$$ LANGUAGE plpgsql;
