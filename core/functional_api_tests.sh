#!/bin/sh

# curl -XPOST localhost:3001/projects/1/datasets -H 'Content-Type: application/json' -d '{"dataset_id": "dev", "data": [{"foo": "bar1"},{"foo":"bar2"}]}'
# echo ""

# curl -XGET localhost:3001/projects/1/datasets
# echo ""

# curl -XPOST localhost:3001/projects/1/specifications/check -H 'Content-Type: application/json' -d '{"specification": "input INPUT {}\ncode CODE {\n  code:\n```\n_fun = (env) => { return {\"bar\": env[\"state\"][\"INPUT\"][\"foo\"]} }\n```\n}"}'
# echo ""

curl -XPOST localhost:3001/projects/1/runs/stream -H 'Content-Type: application/json' -d '{"run_type": "local", "dataset_id": "dev", "config": { "blocks": {}}, "credentials": {}, "specification": "input INPUT {}\ncode CODE {\n  code:\n```\n_fun = (env) => { return {\"bar\": env[\"state\"][\"INPUT\"][\"foo\"]} }\n```\n}"}'
echo ""
