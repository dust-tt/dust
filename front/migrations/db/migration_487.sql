-- DON'T RUN THIS - IT'S NOT MANDATORY in dev

-- Migration created on Jan 21, 2026
-- Transform urls from array to array of objects with description and url
-- Before: ["url1", "url2"]
-- After: [{"name": "URL 1", "url": "url1"}, {"name": "URL 2", "url": "url2"}]

UPDATE project_metadata
SET urls = (
    SELECT jsonb_agg(
                   jsonb_build_object(
                           'name', 'URL ' || (row_number() OVER ())::text,
                           'url', value::text
                   )
           )
    FROM jsonb_array_elements_text(urls) AS value
    )
WHERE jsonb_typeof(urls) = 'array' AND jsonb_array_length(urls) > 0;

