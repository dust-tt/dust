UPDATE connections
SET
    provider = 'slack',
    metadata = jsonb_set(metadata, '{use_case}', '"bot"')
WHERE
    provider = 'slack_bot';
