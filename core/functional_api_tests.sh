#!/bin/sh

curl -XPOST localhost:3000/projects/1/datasets -H 'Content-Type: application/json' -d '{"dataset_id": "dev", "data": [{"foo": "bar1"},{"foo":"bar2"}]}'
echo ""

# curl -XGET localhost:3000/projects/1/datasets
# echo ""

curl -XPOST localhost:3000/projects/1/specifications/check -H 'Content-Type: application/json' -d '{"specification": "root ROOT{}\ncode CODE {\n  code:\n```\n_fun = (env) => { return {\"bar\": env[\"state\"][\"ROOT\"][\"foo\"]} }\n```\n}"}'
echo ""

curl -XPOST localhost:3000/projects/1/runs -H 'Content-Type: application/json' -d '{"dataset_id": "dev", "config": { "blocks": {}, "credentials": {}}, "specification": "root ROOT{}\ncode CODE {\n  code:\n```\n_fun = (env) => { return {\"bar\": env[\"state\"][\"ROOT\"][\"foo\"]} }\n```\n}"}'
echo ""
