UPDATE user_messages
SET
    "userContextOrigin" = 'api'
WHERE
    "userContextOrigin" NOT IN (
        'api',
        'cli',
        'cli_programmatic',
        'email',
        'excel',
        'extension',
        'github-copilot-chat',
        'gsheet',
        'make',
        'n8n',
        'powerpoint',
        'raycast',
        'slack',
        'slack_workflow',
        'teams',
        'transcript',
        'triggered_programmatic',
        'triggered',
        'web',
        'zapier',
        'zendesk',
        'onboarding_conversation',
        'run_agent',
        'agent_handover'
    );