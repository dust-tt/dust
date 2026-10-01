-- Scrub credential-bearing HTTP block requests already stored in `cache`.
-- Run against CORE_DATABASE_URI.
--
-- Lookups use `hash` only; `request` is never read back, so dropping the query
-- string, userinfo, headers, and body keeps cache hits working.
-- Match on JSON shape, not `type`: http_cache_store writes these rows with the
-- llm request type.

CREATE OR REPLACE FUNCTION pg_temp.try_jsonb(t text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN t::jsonb;
EXCEPTION
  WHEN others THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.redact_http_url(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
    regexp_replace(COALESCE(raw, ''), '://[^/?#]*@', '://'),
    '[?#].*$',
    ''
  );
$$;

UPDATE cache AS c
SET request = jsonb_build_object(
  'hash', parsed.req->'hash',
  'method', parsed.req->'method',
  'url', to_jsonb(pg_temp.redact_http_url(parsed.req->>'url')),
  'headers', '{}'::jsonb,
  'body', 'null'::jsonb
)::text
FROM (
  SELECT id, pg_temp.try_jsonb(request) AS req
  FROM cache
  WHERE request LIKE '%"url"%'
    AND request LIKE '%"headers"%'
    AND request LIKE '%"method"%'
) AS parsed
WHERE c.id = parsed.id
  AND parsed.req IS NOT NULL
  AND parsed.req ? 'method'
  AND parsed.req ? 'url'
  AND parsed.req ? 'headers'
  AND parsed.req ? 'body'
  AND jsonb_typeof(parsed.req->'url') = 'string';
