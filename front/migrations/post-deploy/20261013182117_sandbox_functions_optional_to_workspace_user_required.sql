/*
`optional` and `workspace_user_required` admit the same callers. Publishes now write
`workspace_user_required`, so move the rows stored under the retired name before the stored
policy list drops it.
*/
SET SESSION statement_timeout = 60000;
SET SESSION lock_timeout = 3000;
UPDATE
    sandbox_functions
SET
    "userIdentity" = 'workspace_user_required'
WHERE
    "userIdentity" = 'optional';
