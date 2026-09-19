"use strict";
(() => {
  const { taxonomy, skills, metrics } = dataset;
  const N = skills.length;
  const weighted = taxonomy.filter((facet) => facet.weight > 0);
  const indexById = new Map(skills.map((skill, index) => [skill.id, index]));
  const NARROWING_PATH = ["function", "subject", "task", "output"];
  const METHODS = ["idf-cosine", "jaccard"];

  // Same weights as similarity.ts: facet weight times ln(N / df).
  const df = new Map();
  for (const skill of skills) {
    for (const facet of weighted) {
      for (const tag of skill.tags[facet.id] || []) {
        const key = `${facet.id}:${tag}`;
        df.set(key, (df.get(key) || 0) + 1);
      }
    }
  }
  const vectors = skills.map((skill) => {
    const vector = new Map();
    for (const facet of weighted) {
      for (const tag of skill.tags[facet.id] || []) {
        const key = `${facet.id}:${tag}`;
        vector.set(key, facet.weight * Math.log(N / df.get(key)));
      }
    }
    return vector;
  });
  const norms = vectors.map((vector) =>
    Math.sqrt([...vector.values()].reduce((sum, value) => sum + value * value, 0)),
  );

  function idfCosine(i, j) {
    if (norms[i] === 0 || norms[j] === 0) {
      return 0;
    }
    let dot = 0;
    for (const [key, value] of vectors[i]) {
      const other = vectors[j].get(key);
      if (other !== undefined) {
        dot += value * other;
      }
    }
    return dot / (norms[i] * norms[j]);
  }

  function jaccard(i, j) {
    let total = 0;
    let weights = 0;
    for (const facet of weighted) {
      const left = new Set(skills[i].tags[facet.id] || []);
      const right = new Set(skills[j].tags[facet.id] || []);
      if (left.size === 0 && right.size === 0) {
        continue;
      }
      let intersection = 0;
      for (const tag of left) {
        if (right.has(tag)) {
          intersection++;
        }
      }
      total += (facet.weight * intersection) / (left.size + right.size - intersection);
      weights += facet.weight;
    }
    return weights === 0 ? 0 : total / weights;
  }

  const similarity = (i, j, method) => (method === "idf-cosine" ? idfCosine(i, j) : jaccard(i, j));

  function neighbors(self, k, method) {
    const scored = [];
    for (let other = 0; other < N; other++) {
      if (other !== self) {
        scored.push({ index: other, score: similarity(self, other, method) });
      }
    }
    return scored
      .sort((a, b) => b.score - a.score || skills[a.index].id.localeCompare(skills[b.index].id))
      .slice(0, k);
  }

  const state = {
    selected: new Map(),
    query: "",
    skill: null,
    method: "idf-cosine",
    tab: "explore",
  };

  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (key === "class") {
        node.className = value;
      } else if (key === "text") {
        node.textContent = value;
      } else if (key.startsWith("on")) {
        node.addEventListener(key.slice(2), value);
      } else if (value !== undefined && value !== null && value !== false) {
        node.setAttribute(key, value === true ? "" : String(value));
      }
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) {
        continue;
      }
      node.append(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return node;
  }

  const pct = (value) => (value === null || value === undefined ? "–" : `${(value * 100).toFixed(0)}%`);
  const num = (value, digits = 2) =>
    value === null || value === undefined ? "–" : Number(value).toFixed(digits);

  function hasTag(skill, facetId, tag) {
    return (skill.tags[facetId] || []).includes(tag);
  }

  function matching(selected, query) {
    const needle = query.trim().toLowerCase();
    const result = [];
    for (let index = 0; index < N; index++) {
      const skill = skills[index];
      let ok = true;
      for (const [facetId, tags] of selected) {
        for (const tag of tags) {
          if (!hasTag(skill, facetId, tag)) {
            ok = false;
            break;
          }
        }
        if (!ok) {
          break;
        }
      }
      if (
        ok &&
        needle &&
        !`${skill.name}\n${skill.summary}\n${skill.description}`.toLowerCase().includes(needle)
      ) {
        ok = false;
      }
      if (ok) {
        result.push(index);
      }
    }
    return result;
  }

  function toggleTag(facetId, tag) {
    const tags = state.selected.get(facetId) || new Set();
    if (tags.has(tag)) {
      tags.delete(tag);
    } else {
      tags.add(tag);
    }
    if (tags.size === 0) {
      state.selected.delete(facetId);
    } else {
      state.selected.set(facetId, tags);
    }
    render();
  }

  function setSelection(query) {
    state.selected = new Map();
    for (const { facet, tag } of query) {
      const tags = state.selected.get(facet) || new Set();
      tags.add(tag);
      state.selected.set(facet, tags);
    }
    state.query = "";
    render();
  }

  function chip(facetId, tag, options = {}) {
    const classes = ["chip", `facet-${facetId}`];
    if (options.primary) {
      classes.push("primary");
    }
    if (options.shared) {
      classes.push("shared");
    }
    return el("button", {
      type: "button",
      class: classes.join(" "),
      title: `${facetId}: ${tag}${options.primary ? " (primary)" : ""}`,
      text: tag,
      onclick: (event) => {
        event.stopPropagation();
        toggleTag(facetId, tag);
      },
    });
  }

  function renderFacets(matches) {
    const container = document.getElementById("facets");
    container.replaceChildren();
    container.append(
      el("input", {
        type: "search",
        placeholder: "Search name, summary, description",
        value: state.query,
        "aria-label": "Search skills",
        oninput: (event) => {
          state.query = event.target.value;
          render();
        },
      }),
      el(
        "div",
        { class: "results-head" },
        el("span", { class: "muted", text: `${matches.length} of ${N} skills match` }),
        state.selected.size || state.query
          ? el("button", {
              type: "button",
              class: "link",
              text: "Clear",
              onclick: () => {
                state.selected = new Map();
                state.query = "";
                render();
              },
            })
          : null,
      ),
    );
    for (const facet of taxonomy) {
      const selected = state.selected.get(facet.id) || new Set();
      const counts = new Map();
      for (const index of matches) {
        for (const tag of skills[index].tags[facet.id] || []) {
          counts.set(tag, (counts.get(tag) || 0) + 1);
        }
      }
      const rows = facet.tags
        .map((tag) => ({ id: tag.id, description: tag.description, count: counts.get(tag.id) || 0 }))
        .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
        .filter((row) => row.count > 0 || selected.has(row.id));
      container.append(
        el(
          "div",
          { class: "facet" },
          el(
            "div",
            { class: "facet-title" },
            el("span", { text: facet.label }),
            el("span", { text: `${rows.length} tags` }),
          ),
          el(
            "div",
            { class: "tag-list" },
            rows.map((row) =>
              el(
                "button",
                {
                  type: "button",
                  class: `tag-row${row.count === 0 ? " empty" : ""}`,
                  "aria-pressed": selected.has(row.id) ? "true" : "false",
                  title: row.description,
                  onclick: () => toggleTag(facet.id, row.id),
                },
                el("span", { text: row.id }),
                el("span", { class: "count", text: String(row.count) }),
              ),
            ),
          ),
        ),
      );
    }
  }

  function renderResults(matches) {
    const container = document.getElementById("results");
    container.replaceChildren(
      el(
        "div",
        { class: "results-head" },
        el("h2", { text: "Skills" }),
        el("span", {
          class: "muted",
          text: state.selected.size
            ? [...state.selected]
                .map(([facet, tags]) => `${facet}: ${[...tags].join(" & ")}`)
                .join(" · ")
            : "Pick tags on the left to narrow the list.",
        }),
      ),
    );
    for (const index of matches.slice(0, 200)) {
      const skill = skills[index];
      container.append(
        el(
          "div",
          {
            class: "skill-row",
            role: "button",
            tabindex: "0",
            "aria-selected": state.skill === index ? "true" : "false",
            onclick: () => {
              state.skill = index;
              render();
            },
            onkeydown: (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                state.skill = index;
                render();
              }
            },
          },
          el("div", { class: "name", text: skill.name }),
          el("div", { class: "muted", text: skill.summary }),
          el(
            "div",
            { class: "chips" },
            ["function", "task", "subject"].flatMap((facetId) =>
              (skill.tags[facetId] || []).map((tag, position) =>
                chip(facetId, tag, { primary: position === 0 }),
              ),
            ),
          ),
        ),
      );
    }
    if (matches.length > 200) {
      container.append(el("p", { class: "muted", text: `Showing 200 of ${matches.length}. Narrow further.` }));
    }
  }

  function sharedTags(a, b) {
    const shared = new Set();
    for (const facet of weighted) {
      for (const tag of a.tags[facet.id] || []) {
        if (hasTag(b, facet.id, tag)) {
          shared.add(`${facet.id}:${tag}`);
        }
      }
    }
    return shared;
  }

  function neighborRow(self, other, score, marked) {
    const shared = sharedTags(skills[self], skills[other]);
    return el(
      "div",
      {
        class: "neighbor",
        role: "button",
        tabindex: "0",
        onclick: () => {
          state.skill = other;
          render();
        },
        onkeydown: (event) => {
          if (event.key === "Enter") {
            state.skill = other;
            render();
          }
        },
      },
      el(
        "div",
        {},
        marked ? el("span", { class: "mark", text: "● " }) : null,
        el("span", { text: skills[other].name }),
        el("div", { class: "muted", text: `${shared.size} shared tags` }),
      ),
      el("span", { class: "score", text: num(score, 3) }),
    );
  }

  function renderDetail(matches) {
    const container = document.getElementById("detail");
    if (state.skill === null) {
      container.replaceChildren(
        el("h2", { text: "Skill" }),
        el("p", { class: "muted", text: "Select a skill to see its tags, its tag neighbors, and how the tags narrow down to it." }),
      );
      return;
    }
    const self = state.skill;
    const skill = skills[self];
    const tagNeighbors = neighbors(self, 10, state.method);
    const tagNeighborIds = new Set(tagNeighbors.map((neighbor) => skills[neighbor.index].id));
    const embeddingNeighbors =
      metrics.reference && metrics.reference.embeddingNeighbors
        ? metrics.reference.embeddingNeighbors[skill.id] || []
        : null;
    const embeddingIds = new Set((embeddingNeighbors || []).map((neighbor) => neighbor.id));

    const path = [];
    NARROWING_PATH.forEach((facetId, depth) => {
      const primary = (skill.tags[facetId] || [])[0];
      const query = NARROWING_PATH.slice(0, depth + 1).map((id) => ({
        facet: id,
        tag: (skill.tags[id] || [])[0],
      }));
      const selected = new Map();
      for (const item of query) {
        selected.set(item.facet, new Set([item.tag]));
      }
      path.push({ facetId, primary, query, size: matching(selected, "").length });
    });

    container.replaceChildren(
      el("h2", { text: skill.name }),
      el("p", { class: "muted", text: `${skill.id} · ${skill.tokenCount} tokens · confidence ${skill.confidence}${skill.truncated ? " · instructions truncated for tagging" : ""}` }),
      el("h3", { text: "Summary" }),
      el("p", { text: skill.summary }),
      el("h3", { text: "Tags" }),
      ...taxonomy.flatMap((facet) => {
        const tags = skill.tags[facet.id] || [];
        if (tags.length === 0) {
          return [];
        }
        return [
          el(
            "div",
            { class: "chips", style: "margin-bottom:6px" },
            el("span", { class: "muted", style: "width:70px", text: facet.id }),
            tags.map((tag, position) => chip(facet.id, tag, { primary: position === 0 })),
          ),
        ];
      }),
      skill.uncoveredAspects.length
        ? el("p", { class: "muted", text: `Uncovered aspects: ${skill.uncoveredAspects.join(", ")}` })
        : null,
      el("h3", { text: "Narrowing path" }),
      el(
        "table",
        {},
        el("thead", {}, el("tr", {}, el("th", { text: "Add primary tag" }), el("th", { class: "num", text: "Bucket" }))),
        el(
          "tbody",
          {},
          path.map((step) =>
            el(
              "tr",
              {},
              el(
                "td",
                {},
                el("button", {
                  type: "button",
                  class: "link",
                  text: `${step.facetId}: ${step.primary}`,
                  onclick: () => setSelection(step.query),
                }),
              ),
              el("td", { class: "num", text: String(step.size) }),
            ),
          ),
        ),
      ),
      el("h3", { text: "Similar by tags" }),
      el(
        "div",
        { class: "method-toggle" },
        METHODS.map((method) =>
          el("button", {
            type: "button",
            "aria-pressed": state.method === method ? "true" : "false",
            text: method,
            onclick: () => {
              state.method = method;
              render();
            },
          }),
        ),
      ),
      embeddingNeighbors ? el("p", { class: "muted", text: "● also in the top-10 embedding neighbors" }) : null,
      ...tagNeighbors.map((neighbor) =>
        neighborRow(self, neighbor.index, neighbor.score, embeddingIds.has(skills[neighbor.index].id)),
      ),
      embeddingNeighbors
        ? el(
            "div",
            {},
            el("h3", { text: `Embedding neighbors (${metrics.referenceModel})` }),
            el("p", { class: "muted", text: "● also in the top-10 tag neighbors" }),
            ...embeddingNeighbors.map((neighbor) =>
              neighborRow(self, indexById.get(neighbor.id), neighbor.score, tagNeighborIds.has(neighbor.id)),
            ),
          )
        : null,
      el("h3", { text: "Description" }),
      el("p", { text: skill.description }),
      el(
        "details",
        {},
        el("summary", { text: `Instructions (${skill.instructions.length} chars)` }),
        el("pre", { text: skill.instructions }),
      ),
      skill.tools.length ? el("p", { class: "muted", text: `Tools: ${skill.tools.join(", ")}` }) : null,
    );
  }

  function table(headers, rows) {
    return el(
      "table",
      {},
      el(
        "thead",
        {},
        el(
          "tr",
          {},
          headers.map((header) =>
            el("th", { class: header.num ? "num" : undefined, text: header.label }),
          ),
        ),
      ),
      el(
        "tbody",
        {},
        rows.map((row) =>
          el(
            "tr",
            {},
            row.map((cell, position) =>
              el(
                "td",
                { class: headers[position].num ? "num" : undefined },
                cell instanceof Node ? cell : String(cell),
              ),
            ),
          ),
        ),
      ),
    );
  }

  function bar(share) {
    return el(
      "span",
      {},
      el("span", { class: "bar", style: `width:${Math.max(2, Math.round(share * 120))}px` }),
      ` ${pct(share)}`,
    );
  }

  function skillLink(id) {
    const index = indexById.get(id);
    return el("button", {
      type: "button",
      class: "link",
      text: skills[index].name,
      onclick: () => {
        state.skill = index;
        state.tab = "explore";
        render();
      },
    });
  }

  function renderMetrics() {
    const container = document.getElementById("metrics");
    if (container.childElementCount > 0) {
      return;
    }
    const tiles = [
      ["Skills", metrics.counts.skills],
      ["Distinct tag sets", metrics.counts.distinctTagSets],
      ["Mean tags / skill", num(metrics.counts.meanTagsPerSkill, 1)],
      ["Truncated inputs", metrics.counts.truncatedInputs],
      ["Retried", metrics.counts.retried],
      ["Confidence high / med / low", `${metrics.counts.confidence.high} / ${metrics.counts.confidence.medium} / ${metrics.counts.confidence.low}`],
      ["Estimated cost", metrics.usage.estimatedCostUsd === null ? "–" : `$${metrics.usage.estimatedCostUsd}`],
    ];
    container.append(
      el("div", { class: "tiles" }, tiles.map(([label, value]) =>
        el("div", { class: "tile" }, el("div", { class: "muted", text: label }), el("div", { class: "value", text: String(value) })),
      )),
    );

    const reference = metrics.reference;
    if (reference) {
      container.append(
        el(
          "section",
          { class: "panel" },
          el("h2", { text: `Agreement with embeddings (${metrics.referenceModel})` }),
          el("p", { class: "muted", text: `Global mean cosine between skills: ${num(reference.globalMeanCosine, 3)}. Neighbor overlap is the share of a skill's top-k tag neighbors that are also among its top-k embedding neighbors.` }),
          el("div", { class: "grid-2" },
            el("div", {},
              el("h3", { text: "Neighbor overlap@k" }),
              table(
                [{ label: "k" }, { label: "idf-cosine", num: true }, { label: "jaccard", num: true }, { label: "random", num: true }],
                reference.neighborOverlap.map((row) => [row.k, pct(row["idf-cosine"]), pct(row.jaccard), pct(row.random)]),
              ),
              el("h3", { text: "Spearman correlation over all pairs" }),
              table(
                [{ label: "method" }, { label: "rho", num: true }],
                METHODS.map((method) => [method, num(reference.spearman[method], 3)]),
              ),
            ),
            el("div", {},
              el("h3", { text: "Cosine of top-5 tag neighbors vs oracle" }),
              table(
                [{ label: "method" }, { label: "tag nbrs", num: true }, { label: "global", num: true }, { label: "lift", num: true }, { label: "embedding nbrs", num: true }],
                METHODS.map((method) => {
                  const row = reference.tagNeighborCosine[method];
                  return [method, num(row.meanCosineToTagNeighbors, 3), num(row.globalMeanCosine, 3), num(row.lift, 3), num(row.oracleMeanCosineToEmbeddingNeighbors, 3)];
                }),
              ),
              el("h3", { text: "Tag similarity to embedding neighbors vs random" }),
              table(
                [{ label: "method" }, { label: "to nbrs", num: true }, { label: "to random", num: true }, { label: "ratio", num: true }],
                METHODS.map((method) => {
                  const row = reference.contrast[method];
                  return [method, num(row.tagSimilarityToEmbeddingNeighbors, 3), num(row.tagSimilarityToRandom, 3), num(row.ratio, 2)];
                }),
              ),
            ),
          ),
          el("h3", { text: "Bucket cohesion: mean cosine lift of tag-conjunction buckets (size ≥ 3)" }),
          table(
            [{ label: "facets" }, { label: "buckets", num: true }, { label: "mean lift", num: true }, { label: "above global", num: true }],
            [...reference.bucketCohesion.single, ...reference.bucketCohesion.pairs, reference.bucketCohesion.triple].map((row) =>
              [row.facets.join(" × "), row.buckets, num(row.meanLift, 3), pct(row.shareAboveGlobal)],
            ),
          ),
          el("div", { class: "grid-2" },
            el("div", {},
              el("h3", { text: "Most cohesive tags (z vs random groups)" }),
              table(
                [{ label: "tag" }, { label: "n", num: true }, { label: "cosine", num: true }, { label: "lift", num: true }, { label: "z", num: true }],
                reference.tagCohesion.slice(0, 20).map((row) => [row.key, row.count, num(row.meanCosine, 3), num(row.lift, 3), num(row.z, 1)]),
              ),
            ),
            el("div", {},
              el("h3", { text: "Least cohesive tags" }),
              table(
                [{ label: "tag" }, { label: "n", num: true }, { label: "cosine", num: true }, { label: "lift", num: true }, { label: "z", num: true }],
                reference.tagCohesion.slice(-20).map((row) => [row.key, row.count, num(row.meanCosine, 3), num(row.lift, 3), num(row.z, 1)]),
              ),
            ),
          ),
        ),
      );
    }

    const segmentation = metrics.segmentation;
    container.append(
      el(
        "section",
        { class: "panel" },
        el("h2", { text: "Segmentation" }),
        el("p", { class: "muted", text: `A tight bucket has 2 to ${segmentation.tightBucketMax} skills; the narrowing target is at most ${segmentation.targetBucketMax} skills.` }),
        el("h3", { text: "Buckets by tag conjunction" }),
        table(
          [{ label: "facets" }, { label: "buckets", num: true }, { label: "median", num: true }, { label: "mean", num: true }, { label: "max", num: true }, { label: "singleton", num: true }, { label: "tight", num: true }, { label: "skills in tight", num: true }],
          [
            ...Object.entries(segmentation.singleTagBuckets).map(([facet, row]) => [facet, row]),
            ...segmentation.pairBuckets.map((row) => [row.facets.join(" × "), row]),
            [segmentation.tripleBuckets.facets.join(" × "), segmentation.tripleBuckets],
          ].map(([label, row]) => [label, row.buckets, row.medianSize, num(row.meanSize, 1), row.maxSize, pct(row.shareSingleton), pct(row.shareTight), pct(row.skillsInTightBucket)]),
        ),
        el("h3", { text: `Narrowing by primary tags along ${segmentation.narrowingPath.join(" → ")}` }),
        table(
          [{ label: "depth" }, { label: "facet" }, { label: "median bucket", num: true }, { label: "mean", num: true }, { label: `≤ ${segmentation.targetBucketMax}`, num: true }, { label: `≤ ${segmentation.tightBucketMax}`, num: true }, { label: "singleton", num: true }],
          segmentation.narrowing.map((row) => [row.depth, row.facet, row.medianBucket, num(row.meanBucket, 1), pct(row.shareAtMostTarget), pct(row.shareAtMostTight), pct(row.shareSingleton)]),
        ),
        el("p", { class: "muted", text: `Share of skills first reaching a bucket of ≤ ${segmentation.targetBucketMax} at depth 1..${segmentation.narrowingPath.length}: ${segmentation.depthToTarget.shareByDepth.map(pct).join(" / ")}; never: ${pct(segmentation.depthToTarget.shareNever)}.` }),
        el("h3", { text: `Identical tag sets (${segmentation.collisions.length} groups)` }),
        table(
          [{ label: "skills" }, { label: "size", num: true }, { label: "mean cosine", num: true }],
          segmentation.collisions.slice(0, 40).map((group) => [
            el("span", {}, group.ids.flatMap((id, position) => [position ? " · " : null, skillLink(id)])),
            group.size,
            num(group.meanCosine, 3),
          ]),
        ),
      ),
    );

    container.append(
      el(
        "section",
        { class: "panel" },
        el("h2", { text: "Facet distributions" }),
        el("div", { class: "grid-2" }, metrics.facets.map((facet) =>
          el(
            "div",
            {},
            el("h3", { text: `${facet.id} · coverage ${pct(facet.coverage)} · ${num(facet.meanTagsPerSkill, 2)} tags/skill · entropy ${num(facet.normalizedEntropy, 2)}` }),
            table(
              [{ label: "tag" }, { label: "n", num: true }, { label: "share" }],
              facet.tags.map((row) => [row.id, row.count, bar(row.share)]),
            ),
            facet.rare.length ? el("p", { class: "muted", text: `Rare (< 3 skills): ${facet.rare.join(", ")}` }) : null,
          ),
        )),
      ),
    );

    const families = metrics.families;
    container.append(
      el(
        "section",
        { class: "panel" },
        el("h2", { text: "Known groups" }),
        el("p", { class: "muted", text: `Bracketed team labels in names imply a function. Accuracy ${pct(families.prefixFunction.accuracy)} on ${families.prefixFunction.evaluated} labeled skills (team labels were ${dataset.maskNamePrefix ? "hidden from" : "visible to"} the tagger). Global mean tag similarity: idf-cosine ${num(families.globalTagMeans["idf-cosine"], 3)}, jaccard ${num(families.globalTagMeans.jaccard, 3)}.` }),
        el("div", { class: "grid-2" },
          el("div", {},
            el("h3", { text: "Team label → function" }),
            table(
              [{ label: "label" }, { label: "expected" }, { label: "n", num: true }, { label: "correct", num: true }, { label: "observed" }],
              families.prefixFunction.perPrefix.map((row) => [row.prefix, row.expected.join(" | "), row.count, row.correct, Object.entries(row.observed).map(([tag, count]) => `${tag} ${count}`).join(", ")]),
            ),
          ),
          el("div", {},
            el("h3", { text: "Name families" }),
            table(
              [{ label: "family" }, { label: "n", num: true }, { label: "idf-cosine", num: true }, { label: "jaccard", num: true }, { label: "cosine", num: true }, { label: "purity fn / task / subject" }],
              families.nameFamilies.filter((row) => row.count >= 2).map((row) => [
                row.id,
                row.count,
                num(row.meanTagSimilarity["idf-cosine"], 3),
                num(row.meanTagSimilarity.jaccard, 3),
                num(row.meanCosine, 3),
                ["function", "task", "subject"].map((facet) => `${row.purity[facet].tag} ${pct(row.purity[facet].share)}`).join(" / "),
              ]),
            ),
          ),
        ),
      ),
    );

    if (metrics.stability) {
      container.append(
        el(
          "section",
          { class: "panel" },
          el("h2", { text: `Stability on ${metrics.stability.sampleSize} re-tagged skills` }),
          el("p", { class: "muted", text: `All weighted facets identical for ${pct(metrics.stability.allWeightedFacetsExactShare)} of the sample.` }),
          table(
            [{ label: "facet" }, { label: "mean Jaccard", num: true }, { label: "exact", num: true }, { label: "primary match", num: true }],
            metrics.stability.perFacet.map((row) => [row.facet, num(row.meanJaccard, 2), pct(row.exactMatchShare), pct(row.primaryMatchShare)]),
          ),
        ),
      );
    }

    container.append(
      el(
        "section",
        { class: "panel" },
        el("h2", { text: "Taxonomy gaps" }),
        el("p", { class: "muted", text: `${metrics.gaps.skillsWithUncoveredAspects} skills (${pct(metrics.gaps.share)}) reported an aspect the taxonomy cannot express.` }),
        el("div", { class: "chips" }, metrics.gaps.topKeywords.map((row) => el("span", { class: "chip", text: `${row.keyword} ${row.count}` }))),
      ),
    );
  }

  function render() {
    document.getElementById("subtitle").textContent =
      `${N} skills · workspace ${dataset.workspace} · tagged by ${dataset.model} (${dataset.effort} effort) · taxonomy v${metrics.taxonomyVersion}`;
    document.getElementById("tab-explore").setAttribute("aria-selected", state.tab === "explore" ? "true" : "false");
    document.getElementById("tab-metrics").setAttribute("aria-selected", state.tab === "metrics" ? "true" : "false");
    document.getElementById("explore").hidden = state.tab !== "explore";
    document.getElementById("metrics").hidden = state.tab !== "metrics";
    if (state.tab === "metrics") {
      renderMetrics();
      return;
    }
    const matches = matching(state.selected, state.query);
    const active = document.activeElement;
    renderFacets(matches);
    renderResults(matches);
    renderDetail(matches);
    if (active && active.type === "search") {
      const input = document.querySelector("input[type=search]");
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  document.getElementById("tab-explore").addEventListener("click", () => {
    state.tab = "explore";
    render();
  });
  document.getElementById("tab-metrics").addEventListener("click", () => {
    state.tab = "metrics";
    render();
  });
  render();
})();
