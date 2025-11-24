-- Migration created on Nov 24, 2025
UPDATE user_messages
SET
    "runAgentOriginMessageId" = "userContextOriginMessageId"
WHERE
    "runAgentOriginMessageId" IS NULL
    AND "userContextOriginMessageId" IS NOT NULL;

UPDATE user_messages
SET
    "runAgentType" = "userContextOrigin"
WHERE
    "runAgentType" IS NULL
    AND "userContextOrigin" IN ('run_agent', 'agent_handover');

UPDATE user_messages u
SET
    "userContextOrigin" = um."userContextOrigin"
FROM
    messages m
    INNER JOIN messages m2 ON m2.id = m."parentId"
    INNER JOIN user_messages um ON m2."userMessageId" = um.id
WHERE
    u."userContextOrigin" IN ('run_agent', 'agent_handover')
    AND m."sId" = u."runAgentOriginMessageId";