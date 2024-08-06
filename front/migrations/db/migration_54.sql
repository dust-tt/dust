-- Migration created on Jul 29, 2024
DELETE FROM
    feature_flags
WHERE
    name = 'visualization_action_flag'
    OR name = 'test_oauth_setup';