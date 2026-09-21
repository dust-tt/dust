# Skill embedding experiments

Fetch workspace skills, turn each into a text containing its name, description,
instructions, and enabled tools, embed it, and open an interactive 2D PCA report.
Everything lives in this directory; no application changes or running Dust services
are required.

Run from a Dust checkout with its usual Node dependencies installed. The local
`package.json` records the additional libraries used, which are already present in
the repository's dependency tree. Use the normal dust-hive dependency workflow in
a hive; this script does not require installing another environment.

## Run

Set `DUST_API_KEY` and `OPENAI_EMBEDDING_API_KEY` (`OPENAI_API_KEY` also works), then:

```sh
node --import tsx x/aubin/skill-embeddings/cli.ts \
  --workspace YOUR_WORKSPACE_ID
```

Or load a local credentials file with Node:

```sh
node --env-file=/path/to/credentials.env --import tsx \
  x/aubin/skill-embeddings/cli.ts --workspace YOUR_WORKSPACE_ID
```

Open `x/aubin/skill-embeddings/output/YOUR_WORKSPACE_ID/index.html` directly in your
browser. It is self-contained and works offline, with no CDN or server dependency.
Generated output is gitignored. It contains skill instructions and must be treated
like the underlying workspace data.

The fetch uses `GET /api/v1/w/{workspace}/skills`, which currently returns all
matching **custom** skills in one response. Built-in/global skills are not exposed
by this public endpoint. By default this means active, published skills. Use
`--include-unpublished` with an admin API key to include editor-only skills, or
`--status archived` / `--status suggested` for a separate experiment. Set
`--dust-url https://YOUR_DUST_REGION_HOST` to the origin for your workspace's region.
If instructions are redacted because the key cannot read a skill's space, the
script stops instead of embedding incomplete data.

Names and descriptions are included for both the tool server and its enabled
tools. The agent-facing description is used, with the user-facing description as
a fallback. Server credentials, headers, tool argument schemas, timestamps, and
internal IDs are excluded from the embedding text.

## What gets saved

| File              | Contents                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| `embeddings.json` | Exact input texts, SHA-256 hashes, skill metadata, model, dimensions, raw vectors, and fetch settings |
| `analysis.json`   | L2-normalized vectors, PCA coordinates and explained variance, cluster assignments and diagnostics    |
| `index.html`      | Offline interactive report, including its data                                                        |

`embeddings.json` is checkpointed after each successful batch of up to 16 chunks,
**before** PCA or report generation. Rerun the same command to resume an interrupted
run. Only new or changed texts are embedded again. A different workspace, API
origin, model, or dimension requires a separate `--out` directory. Run one process
per output directory at a time.

The default is OpenAI `text-embedding-3-large` with 1536 dimensions. You can compare
it with `--model text-embedding-3-small`, or use `--dimensions 3072` with the large
model. Texts go to OpenAI's embedding API. Inputs over 8191 `cl100k_base` tokens
are split into consecutive token chunks. Their vectors are combined using a mean
weighted by each chunk's token count, so every token contributes. The output records
`embeddingAggregation: "token-weighted-mean-v1"` and keeps `chunkEmbeddings` for
long skills, including partial progress for interrupted runs. This pooling can
smooth over distinct topics within a long skill; it is not a single model embedding
of the entire text. Nothing is silently truncated or summarized. To
experiment with edited content, save a public skills API response locally and pass
`--input skills.json --workspace YOUR_WORKSPACE_ID --out /tmp/edited-skills`.

## Explore and cluster

The report lets you search across the embedded text, select skills from the map or
keyboard-accessible table, inspect the exact input, compare nearest neighbors by
cosine similarity, change the number of clusters, filter a cluster, pan/zoom,
toggle labels, and export visible skills with vectors and assignments as JSON.
Changing the cluster count does not make API calls.

PCA centers the L2-normalized vectors and uses SVD to retain two components. The
axes share a scale, and the report displays the retained variance. Clustering uses
K-means++ on the **full normalized embedding vectors**, with three seeded restarts
and up to 100 iterations per restart. Cluster numbers are arbitrary between runs.
Inertia is squared Euclidean distance to the centroids. The cosine silhouette
diagnostic is computed on a reproducible subset of up to 96 skills; it is not a
whole-workspace score. A single cluster or all-singleton sample has no silhouette
score. A larger silhouette is better separated; a lower inertia alone does not
justify more clusters, since it usually decreases as clusters are added.

Rerun analysis without fetching or embedding:

```sh
node --import tsx x/aubin/skill-embeddings/cli.ts \
  --from x/aubin/skill-embeddings/output/YOUR_WORKSPACE_ID/embeddings.json \
  --clusters 2,3,5,8,12 --seed 123
```

Use `--out /tmp/another-analysis` to keep the previous report. Requested cluster
counts are capped to the number of distinct vectors. Typical runs contain hundreds
of skills; exact SVD and multiple clustering runs can take longer for large
workspaces. Saved vectors remain usable in a notebook for UMAP, density-based
clustering, or other experiments.

## Demo

```sh
node --import tsx x/aubin/skill-embeddings/demo.ts
```

The demo writes to `output/synthetic-demo`. Its vectors are synthetic, deliberately
grouped fixtures, **not actual model embeddings**. It demonstrates the viewer and
analysis workflow, not embedding quality.

Numerical implementation: [ml-matrix SVD](https://mljs.github.io/matrix/classes/SingularValueDecomposition.html).
