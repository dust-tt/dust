#!/bin/sh

# curl -XPOST localhost:3001/projects/1/datasets -H 'Content-Type: application/json' -d '{"dataset_id": "dev", "data": [{"foo": "bar1"}]}'
# echo ""

# curl -XGET localhost:3001/projects/1/datasets
# echo ""

# curl -XPOST localhost:3001/projects/1/specifications/check -H 'Content-Type: application/json' -d '{"specification": "input INPUT {}\ncode CODE {\n  code:\n```\n_fun = (env) => { return {\"bar\": env[\"state\"][\"INPUT\"][\"foo\"]} }\n```\n}"}'
# echo ""

# curl -XPOST localhost:3001/projects/1/runs/stream -H 'Content-Type: application/json' -d '{"run_type": "local", "dataset_id": "dev", "config": { "blocks": {}}, "credentials": {}, "specification": "input INPUT {}\ncode CODE {\n  code:\n```\n_fun = (env) => { return {\"bar\": env[\"state\"][\"INPUT\"][\"foo\"]} }\n```\n}"}'
# echo ""

curl -XPOST localhost:3001/projects/1/runs/stream -H 'Content-Type: application/json' -d '{"run_type": "local", "dataset_id": "dev", "config": { "blocks": { "MODEL": { "provider_id": "openai", "model_id": "text-ada-001", "use_stream": true, "use_cache": false }}}, "credentials": { "OPENAI_API_KEY": "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"}, "specification": "input INPUT {}\nllm MODEL {\n max_tokens: 8\n temperature: 0\n prompt:\n```\nList of 5 rare Emojis: 😊 😃\n```\n}"}'
echo ""