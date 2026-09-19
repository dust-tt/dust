"use strict";
(() => {
  const { taxonomy, skills, metrics, cosines } = dataset;
  const N = skills.length;
  const weighted = taxonomy.filter((facet) => facet.weight > 0);
  const facetsById = new Map(taxonomy.map((facet) => [facet.id, facet]));
  const indexById = new Map(skills.map((skill, index) => [skill.id, index]));
  const NARROWING_PATH = ["function", "subject", "task", "output"];
  const METHODS = ["idf-cosine", "jaccard"];
  const PRIMARY_FACETS = ["function", "task", "subject"];
  // Blue sequential ramp, steps 100..700, for magnitudes (counts, similarities).
  const SEQ = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"];
  // Scatter colours are an all-pairs form: only three categorical slots validate, so the map
  // colours at most three tags at a time and everything else stays neutral.
  const MAX_COLOURED = 3;
  const MATRIX_MAX = 60;

  // ---- tag similarity (same definitions as similarity.ts) --------------------------------

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

  function facetJaccard(i, j, facetId) {
    const left = new Set(skills[i].tags[facetId] || []);
    const right = new Set(skills[j].tags[facetId] || []);
    if (left.size === 0 && right.size === 0) {
      return null;
    }
    let intersection = 0;
    for (const tag of left) {
      if (right.has(tag)) {
        intersection++;
      }
    }
    return intersection / (left.size + right.size - intersection);
  }

  function jaccard(i, j) {
    let total = 0;
    let weights = 0;
    for (const facet of weighted) {
      const value = facetJaccard(i, j, facet.id);
      if (value === null) {
        continue;
      }
      total += facet.weight * value;
      weights += facet.weight;
    }
    return weights === 0 ? 0 : total / weights;
  }

  const similarity = (i, j, method) => (i === j ? 1 : method === "idf-cosine" ? idfCosine(i, j) : jaccard(i, j));

  // Embedding cosine from the strict upper triangle exported by the evaluate stage.
  function cosine(i, j) {
    if (!cosines) {
      return null;
    }
    if (i === j) {
      return 1;
    }
    const a = Math.min(i, j);
    const b = Math.max(i, j);
    return cosines.values[a * N - (a * (a + 1)) / 2 + (b - a - 1)];
  }

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

  function rankOf(self, other, score) {
    let rank = 1;
    const target = score(other);
    for (let candidate = 0; candidate < N; candidate++) {
      if (candidate !== self && candidate !== other && score(candidate) > target) {
        rank++;
      }
    }
    return rank;
  }

  function meanPairwise(members, score) {
    if (members.length < 2) {
      return null;
    }
    let sum = 0;
    let count = 0;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const value = score(members[i], members[j]);
        if (value !== null) {
          sum += value;
          count++;
        }
      }
    }
    return count === 0 ? null : sum / count;
  }

  // ---- state and DOM helpers ----------------------------------------------------------------

  const state = {
    tab: "explore",
    selected: new Map(),
    query: "",
    skill: null,
    method: "jaccard",
    map: { facet: "function", method: "jaccard", coloured: [], multiples: false },
    segments: { a: "function", b: "subject", primaryOnly: false },
    compare: { a: null, b: null, source: "selection", method: "jaccard", queryA: "", queryB: "" },
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

  const SVG_NS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs, ...children) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (key.startsWith("on")) {
        node.addEventListener(key.slice(2), value);
      } else if (key === "text") {
        node.textContent = value;
      } else {
        node.setAttribute(key, String(value));
      }
    }
    for (const child of children.flat()) {
      if (child) {
        node.append(child);
      }
    }
    return node;
  }

  const pct = (value) => (value === null || value === undefined ? "–" : `${(value * 100).toFixed(0)}%`);
  const num = (value, digits = 2) =>
    value === null || value === undefined ? "–" : Number(value).toFixed(digits);
  const hasTag = (skill, facetId, tag) => (skill.tags[facetId] || []).includes(tag);
  const primary = (skill, facetId) => (skill.tags[facetId] || [])[0];

  function seqColor(t) {
    const clamped = Math.max(0, Math.min(1, t));
    return SEQ[Math.round(clamped * (SEQ.length - 1))];
  }
  function seqInk(t) {
    return Math.round(Math.max(0, Math.min(1, t)) * (SEQ.length - 1)) >= 5 ? "#ffffff" : "#0b0b0b";
  }

  const tooltip = document.getElementById("tooltip");
  function showTooltip(event, title, lines) {
    tooltip.replaceChildren(el("strong", { text: title }), ...lines.map((line) => el("div", { text: line })));
    tooltip.hidden = false;
    moveTooltip(event);
  }
  function moveTooltip(event) {
    const pad = 12;
    const box = tooltip.getBoundingClientRect();
    let x = event.clientX + pad;
    let y = event.clientY + pad;
    if (x + box.width > window.innerWidth - 8) {
      x = event.clientX - box.width - pad;
    }
    if (y + box.height > window.innerHeight - 8) {
      y = event.clientY - box.height - pad;
    }
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  }
  function hideTooltip() {
    tooltip.hidden = true;
  }

  function skillTooltipLines(index) {
    const skill = skills[index];
    return [
      `function: ${(skill.tags.function || []).join(", ")}`,
      `task: ${(skill.tags.task || []).join(", ")}`,
      `subject: ${(skill.tags.subject || []).join(", ")}`,
    ];
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

  function setSelection(query, tab) {
    state.selected = new Map();
    for (const { facet, tag } of query) {
      const tags = state.selected.get(facet) || new Set();
      tags.add(tag);
      state.selected.set(facet, tags);
    }
    state.query = "";
    if (tab) {
      state.tab = tab;
    }
    render();
  }

  function selectionLabel() {
    return [...state.selected]
      .map(([facet, tags]) => `${facet}: ${[...tags].join(" & ")}`)
      .join(" · ");
  }

  function openCompare(a, b) {
    state.compare.a = a;
    if (b !== undefined) {
      state.compare.b = b;
    }
    state.tab = "compare";
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
    if (options.only) {
      classes.push("only");
    }
    return el("button", {
      type: "button",
      class: classes.join(" "),
      title: `${facetId}: ${tag}${options.primary ? " (primary)" : ""}`,
      text: tag,
      onclick: (event) => {
        event.stopPropagation();
        toggleTag(facetId, tag);
        if (state.tab !== "explore") {
          state.tab = "explore";
          render();
        }
      },
    });
  }

  function toggle(options, current, onPick, labels) {
    return el(
      "div",
      { class: "toggle", role: "group" },
      options.map((option) =>
        el("button", {
          type: "button",
          "aria-pressed": current === option ? "true" : "false",
          text: labels ? labels[option] : option,
          onclick: () => onPick(option),
        }),
      ),
    );
  }

  function facetSelect(value, onChange, exclude) {
    const select = el("select", { onchange: (event) => onChange(event.target.value) });
    for (const facet of weighted) {
      if (facet.id === exclude) {
        continue;
      }
      select.append(el("option", { value: facet.id, text: facet.label, selected: facet.id === value }));
    }
    return select;
  }

  function table(headers, rows) {
    return el(
      "table",
      {},
      el("thead", {}, el("tr", {}, headers.map((header) => el("th", { class: header.num ? "num" : undefined, text: header.label })))),
      el(
        "tbody",
        {},
        rows.map((row) =>
          el("tr", {}, row.map((cell, position) => el("td", { class: headers[position].num ? "num" : undefined }, cell instanceof Node ? cell : String(cell)))),
        ),
      ),
    );
  }

  // ---- Explore tab -----------------------------------------------------------------------------

  function renderFacets(matches) {
    const container = document.getElementById("facets");
    container.replaceChildren();
    container.append(
      el("input", {
        type: "search",
        id: "explore-search",
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
          el("div", { class: "facet-title" }, el("span", { text: facet.label }), el("span", { text: `${rows.length} tags` })),
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
        el("span", { class: "muted", text: state.selected.size ? selectionLabel() : "Pick tags on the left to narrow the list." }),
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
            PRIMARY_FACETS.flatMap((facetId) =>
              (skill.tags[facetId] || []).map((tag, position) => chip(facetId, tag, { primary: position === 0 })),
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
      el("button", {
        type: "button",
        class: "mini",
        text: "vs",
        title: "Compare these two skills",
        onclick: (event) => {
          event.stopPropagation();
          openCompare(self, other);
        },
      }),
    );
  }

  function renderDetail() {
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
      metrics.reference && metrics.reference.embeddingNeighbors ? metrics.reference.embeddingNeighbors[skill.id] || [] : null;
    const embeddingIds = new Set((embeddingNeighbors || []).map((neighbor) => neighbor.id));

    const path = NARROWING_PATH.map((facetId, depth) => {
      const query = NARROWING_PATH.slice(0, depth + 1).map((id) => ({ facet: id, tag: primary(skill, id) }));
      const selected = new Map(query.map((item) => [item.facet, new Set([item.tag])]));
      return { facetId, primary: primary(skill, facetId), query, size: matching(selected, "").length };
    });

    container.replaceChildren(
      el(
        "div",
        { class: "results-head" },
        el("h2", { text: skill.name }),
        el("button", { type: "button", class: "mini", text: "Compare…", onclick: () => openCompare(self) }),
      ),
      el("p", {
        class: "muted",
        text: `${skill.id} · ${skill.tokenCount} tokens · confidence ${skill.confidence}${skill.truncated ? " · instructions truncated for tagging" : ""}`,
      }),
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
      skill.uncoveredAspects.length ? el("p", { class: "muted", text: `Uncovered aspects: ${skill.uncoveredAspects.join(", ")}` }) : null,
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
              el("td", {}, el("button", { type: "button", class: "link", text: `${step.facetId}: ${step.primary}`, onclick: () => setSelection(step.query) })),
              el("td", { class: "num", text: String(step.size) }),
            ),
          ),
        ),
      ),
      el("h3", { text: "Similar by tags" }),
      toggle(METHODS, state.method, (method) => {
        state.method = method;
        render();
      }),
      embeddingNeighbors ? el("p", { class: "muted", text: "● also in the top-10 embedding neighbors" }) : null,
      ...tagNeighbors.map((neighbor) => neighborRow(self, neighbor.index, neighbor.score, embeddingIds.has(skills[neighbor.index].id))),
      embeddingNeighbors
        ? el(
            "div",
            {},
            el("h3", { text: `Embedding neighbors (${metrics.referenceModel})` }),
            el("p", { class: "muted", text: "● also in the top-10 tag neighbors" }),
            ...embeddingNeighbors.map((neighbor) => neighborRow(self, indexById.get(neighbor.id), neighbor.score, tagNeighborIds.has(neighbor.id))),
          )
        : null,
      el("h3", { text: "Description" }),
      el("p", { text: skill.description }),
      el("details", {}, el("summary", { text: `Instructions (${skill.instructions.length} chars)` }), el("pre", { text: skill.instructions })),
      skill.tools.length ? el("p", { class: "muted", text: `Tools: ${skill.tools.join(", ")}` }) : null,
    );
  }

  // ---- Map tab: classical MDS of tag distance ------------------------------------------------

  const layoutCache = new Map();
  function seededRandom(seed) {
    let value = seed >>> 0;
    return () => {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  function layout(method) {
    if (layoutCache.has(method)) {
      return layoutCache.get(method);
    }
    const n = N;
    const squared = new Float64Array(n * n);
    const rowMean = new Float64Array(n);
    let grand = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const distance = 1 - similarity(i, j, method);
        const value = distance * distance;
        squared[i * n + j] = value;
        squared[j * n + i] = value;
        rowMean[i] += value;
        rowMean[j] += value;
        grand += 2 * value;
      }
    }
    for (let i = 0; i < n; i++) {
      rowMean[i] /= n;
    }
    grand /= n * n;
    const gram = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        gram[i * n + j] = -0.5 * (squared[i * n + j] - rowMean[i] - rowMean[j] + grand);
      }
    }
    const random = seededRandom(7);
    const components = [];
    for (let component = 0; component < 2; component++) {
      let vector = Float64Array.from({ length: n }, () => random() - 0.5);
      let lambda = 0;
      for (let iteration = 0; iteration < 400; iteration++) {
        const next = new Float64Array(n);
        for (let i = 0; i < n; i++) {
          let sum = 0;
          const row = i * n;
          for (let j = 0; j < n; j++) {
            sum += gram[row + j] * vector[j];
          }
          next[i] = sum;
        }
        for (const previous of components) {
          let dot = 0;
          for (let i = 0; i < n; i++) {
            dot += next[i] * previous.vector[i];
          }
          for (let i = 0; i < n; i++) {
            next[i] -= dot * previous.vector[i];
          }
        }
        let norm = 0;
        for (let i = 0; i < n; i++) {
          norm += next[i] * next[i];
        }
        norm = Math.sqrt(norm);
        if (norm < 1e-12) {
          break;
        }
        let delta = 0;
        for (let i = 0; i < n; i++) {
          next[i] /= norm;
          delta += Math.abs(next[i] - vector[i]);
        }
        vector = next;
        lambda = norm;
        if (delta < 1e-7) {
          break;
        }
      }
      components.push({ vector, lambda });
    }
    const scale = components.map((component) => Math.sqrt(Math.max(component.lambda, 0)));
    let xs = Array.from({ length: n }, (_, i) => components[0].vector[i] * scale[0]);
    let ys = Array.from({ length: n }, (_, i) => components[1].vector[i] * scale[1]);
    const normalize = (values) => {
      const min = Math.min(...values);
      const max = Math.max(...values);
      const span = max - min || 1;
      return values.map((value) => 0.05 + (0.9 * (value - min)) / span);
    };
    xs = normalize(xs);
    ys = normalize(ys);
    // Skills with identical tag sets land on the same point; spread duplicates on a small spiral.
    const seen = new Map();
    for (let i = 0; i < n; i++) {
      const key = `${xs[i].toFixed(5)},${ys[i].toFixed(5)}`;
      const k = seen.get(key) || 0;
      seen.set(key, k + 1);
      if (k > 0) {
        const radius = 0.012 * Math.sqrt(k);
        xs[i] += radius * Math.cos(k * 2.399963);
        ys[i] += radius * Math.sin(k * 2.399963);
      }
    }
    const result = { xs, ys, explained: components.map((component) => component.lambda) };
    layoutCache.set(method, result);
    return result;
  }

  function colourOf(index) {
    const skill = skills[index];
    const facetId = state.map.facet;
    for (const tag of skill.tags[facetId] || []) {
      const slot = state.map.coloured.indexOf(tag);
      if (slot !== -1) {
        return `var(--series-${slot + 1})`;
      }
    }
    return "var(--neutral-mark)";
  }

  function toggleColoured(tag) {
    const coloured = state.map.coloured;
    const position = coloured.indexOf(tag);
    if (position !== -1) {
      coloured.splice(position, 1);
    } else {
      if (coloured.length >= MAX_COLOURED) {
        coloured.shift();
      }
      coloured.push(tag);
    }
    render();
  }

  function renderMap() {
    const container = document.getElementById("map");
    container.replaceChildren();
    const m = state.map;
    const facet = facetsById.get(m.facet);
    const { xs, ys } = layout(m.method);
    const matches = state.selected.size || state.query ? new Set(matching(state.selected, state.query)) : null;
    const counts = new Map();
    for (const skill of skills) {
      for (const tag of skill.tags[m.facet] || []) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    const legendTags = facet.tags
      .map((tag) => ({ id: tag.id, description: tag.description, count: counts.get(tag.id) || 0 }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));

    const controls = el(
      "div",
      { class: "controls" },
      el("label", {}, "Colour by", facetSelect(m.facet, (value) => {
        m.facet = value;
        m.coloured = [];
        render();
      })),
      el("label", {}, "Distance", toggle(METHODS, m.method, (method) => {
        m.method = method;
        render();
      })),
      toggle([false, true], m.multiples, (value) => {
        m.multiples = value;
        render();
      }, { false: "One map", true: "One panel per tag" }),
      matches
        ? el("span", { class: "muted" }, `Highlighting ${matches.size} skills from Explore (${selectionLabel() || state.query}) · `, el("button", { type: "button", class: "link", text: "clear", onclick: () => setSelection([]) }))
        : el("span", { class: "muted", text: "Layout: classical MDS of tag distance, 1 − similarity. Position has no axis meaning; distance does." }),
    );
    container.append(controls);

    const dimmed = (index) => matches !== null && !matches.has(index);

    if (m.multiples) {
      const grid = el("div", { class: "multiples" });
      for (const row of legendTags) {
        const members = new Set();
        skills.forEach((skill, index) => {
          if (hasTag(skill, m.facet, row.id)) {
            members.add(index);
          }
        });
        const panel = svg("svg", { viewBox: "0 0 200 140", role: "img", "aria-label": `${row.id}: ${row.count} skills` });
        for (let index = 0; index < N; index++) {
          if (!members.has(index)) {
            panel.append(svg("circle", { cx: 6 + xs[index] * 188, cy: 6 + ys[index] * 128, r: 2, fill: "var(--neutral-mark)", opacity: 0.55 }));
          }
        }
        for (const index of members) {
          panel.append(svg("circle", { cx: 6 + xs[index] * 188, cy: 6 + ys[index] * 128, r: 3.2, fill: "var(--series-1)", stroke: "var(--paper)", "stroke-width": 1, opacity: dimmed(index) ? 0.35 : 1 }));
        }
        grid.append(
          el(
            "div",
            {
              class: "multiple",
              role: "button",
              tabindex: "0",
              title: `${row.description}\nClick to colour this tag on the map.`,
              onclick: () => {
                if (!m.coloured.includes(row.id)) {
                  toggleColoured(row.id);
                }
                m.multiples = false;
                render();
              },
              onkeydown: (event) => {
                if (event.key === "Enter") {
                  event.currentTarget.click();
                }
              },
            },
            el("div", { class: "title" }, el("span", { text: row.id }), el("span", { class: "muted", text: String(row.count) })),
            panel,
          ),
        );
      }
      container.append(el("div", { class: "panel" }, el("h2", { text: `${facet.label}: one panel per tag, members in blue` }), grid));
      return;
    }

    const width = 1000;
    const height = 680;
    const plot = svg("svg", { class: "map-svg", viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "Skills laid out by tag distance" });
    const circles = [];
    const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => {
      const ca = colourOf(a) === "var(--neutral-mark)" ? 0 : 1;
      const cb = colourOf(b) === "var(--neutral-mark)" ? 0 : 1;
      return ca - cb;
    });
    for (const index of order) {
      const cx = 24 + xs[index] * (width - 48);
      const cy = 24 + ys[index] * (height - 48);
      const circle = svg("circle", {
        class: `hit${dimmed(index) ? " dim" : ""}`,
        cx,
        cy,
        r: state.skill === index ? 7 : 5,
        fill: colourOf(index),
        stroke: state.skill === index ? "var(--ink)" : "var(--paper)",
        "stroke-width": state.skill === index ? 2.5 : 1.2,
        tabindex: "0",
        onpointermove: (event) => showTooltip(event, skills[index].name, skillTooltipLines(index)),
        onpointerleave: hideTooltip,
        onclick: () => {
          state.skill = index;
          render();
        },
        onfocus: () => {
          const box = circle.getBoundingClientRect();
          showTooltip({ clientX: box.left + 8, clientY: box.top + 8 }, skills[index].name, skillTooltipLines(index));
        },
        onblur: hideTooltip,
      });
      circle.append(svg("title", { text: skills[index].name }));
      circles[index] = circle;
      plot.append(circle);
    }

    const isolate = (tag) => {
      for (let index = 0; index < N; index++) {
        const member = tag === null ? true : hasTag(skills[index], m.facet, tag);
        circles[index].classList.toggle("dim", dimmed(index) || !member);
      }
    };
    const legend = el("div", { class: "panel sticky" }, el("h2", { text: facet.label }), el("p", { class: "muted", text: `Click up to ${MAX_COLOURED} tags to colour them. Hover a tag to isolate its members.` }));
    for (const row of legendTags) {
      const slot = m.coloured.indexOf(row.id);
      legend.append(
        el(
          "button",
          {
            type: "button",
            class: "legend-row",
            "aria-pressed": slot !== -1 ? "true" : "false",
            title: row.description,
            onclick: () => toggleColoured(row.id),
            onpointerenter: () => isolate(row.id),
            onpointerleave: () => isolate(null),
            onfocus: () => isolate(row.id),
            onblur: () => isolate(null),
          },
          el("span", { class: "swatch", style: slot !== -1 ? `background: var(--series-${slot + 1})` : undefined }),
          el("span", { text: row.id }),
          el("span", { class: "count", text: String(row.count) }),
        ),
      );
    }
    if (state.skill !== null) {
      legend.append(
        el("h3", { text: "Selected" }),
        el("p", {}, el("button", { type: "button", class: "link", text: skills[state.skill].name, onclick: () => {
          state.tab = "explore";
          render();
        } })),
      );
    }
    container.append(el("div", { class: "map-layout" }, el("div", { class: "panel" }, plot), legend));
  }

  // ---- Segments tab: facet × facet bucket heatmap --------------------------------------------

  function renderSegments() {
    const container = document.getElementById("segments");
    container.replaceChildren();
    const s = state.segments;
    const member = (skill, facetId, tag) => (s.primaryOnly ? primary(skill, facetId) === tag : hasTag(skill, facetId, tag));
    const tagsOf = (facetId) => {
      const counts = new Map();
      for (const skill of skills) {
        for (const tag of facetsById.get(facetId).tags) {
          if (member(skill, facetId, tag.id)) {
            counts.set(tag.id, (counts.get(tag.id) || 0) + 1);
          }
        }
      }
      return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    };
    const rows = tagsOf(s.a);
    const cols = tagsOf(s.b);
    const cells = new Map();
    let max = 1;
    for (const [rowTag] of rows) {
      for (const [colTag] of cols) {
        const members = [];
        skills.forEach((skill, index) => {
          if (member(skill, s.a, rowTag) && member(skill, s.b, colTag)) {
            members.push(index);
          }
        });
        cells.set(`${rowTag}|${colTag}`, members);
        max = Math.max(max, members.length);
      }
    }
    const nonEmpty = [...cells.values()].filter((members) => members.length > 0);
    const tight = nonEmpty.filter((members) => members.length >= 2 && members.length <= 10);
    const covered = new Set(tight.flat()).size;

    container.append(
      el(
        "div",
        { class: "controls" },
        el("label", {}, "Rows", facetSelect(s.a, (value) => {
          s.a = value;
          if (s.b === value) {
            s.b = weighted.find((facet) => facet.id !== value).id;
          }
          render();
        })),
        el("label", {}, "Columns", facetSelect(s.b, (value) => {
          s.b = value;
          render();
        }, s.a)),
        toggle([false, true], s.primaryOnly, (value) => {
          s.primaryOnly = value;
          render();
        }, { false: "Any position (matches Explore)", true: "Primary tag only" }),
        el("span", { class: "muted", text: `${nonEmpty.length} non-empty cells · ${tight.length} tight (2–10) · ${pct(covered / N)} of skills in a tight cell · click a cell to open it in Explore` }),
      ),
    );

    const heat = el("table", { class: "heat" });
    const head = el("tr", {}, el("th", {}));
    for (const [colTag, count] of cols) {
      head.append(el("th", { class: "col", title: `${colTag}: ${count}` }, el("span", {}, el("button", { type: "button", class: "link", text: colTag, onclick: () => setSelection([{ facet: s.b, tag: colTag }], "explore") }))));
    }
    head.append(el("th", { class: "col" }, el("span", { class: "muted", text: "total" })));
    heat.append(el("thead", {}, head));
    const body = el("tbody");
    for (const [rowTag, rowCount] of rows) {
      const tr = el("tr", {}, el("th", { class: "row" }, el("button", { type: "button", class: "link", text: rowTag, title: rowTag, onclick: () => setSelection([{ facet: s.a, tag: rowTag }], "explore") })));
      for (const [colTag] of cols) {
        const members = cells.get(`${rowTag}|${colTag}`);
        const t = members.length === 0 ? 0 : Math.sqrt(members.length / max);
        const cell = el("button", {
          type: "button",
          class: "cell",
          style: members.length ? `background:${seqColor(t)};color:${seqInk(t)}` : undefined,
          text: members.length ? String(members.length) : "",
          "aria-label": `${rowTag} × ${colTag}: ${members.length} skills`,
          onclick: () => {
            if (members.length) {
              setSelection([{ facet: s.a, tag: rowTag }, { facet: s.b, tag: colTag }], "explore");
            }
          },
          onpointermove: (event) => {
            const lines = [`${members.length} skills`];
            if (members.length >= 2) {
              lines.push(`mean tag similarity (${state.method}): ${num(meanPairwise(members, (i, j) => similarity(i, j, state.method)), 3)}`);
              if (cosines) {
                lines.push(`mean embedding cosine: ${num(meanPairwise(members, cosine), 3)} (global ${num(metrics.reference && metrics.reference.globalMeanCosine, 3)})`);
              }
            }
            if (members.length && members.length <= 4) {
              lines.push(...members.map((index) => skills[index].name));
            }
            showTooltip(event, `${rowTag} × ${colTag}`, lines);
          },
          onpointerleave: hideTooltip,
        });
        tr.append(el("td", {}, cell));
      }
      tr.append(el("td", { class: "num muted", style: "padding-left:8px;font-size:11px", text: String(rowCount) }));
      body.append(tr);
    }
    const totals = el("tr", {}, el("th", { class: "row muted", text: "total" }));
    for (const [, count] of cols) {
      totals.append(el("td", { class: "num muted", style: "font-size:11px;text-align:center", text: String(count) }));
    }
    body.append(totals);
    heat.append(body);

    container.append(
      el(
        "div",
        { class: "panel", style: "overflow:auto" },
        el("h2", { text: `${facetsById.get(s.a).label} × ${facetsById.get(s.b).label}` }),
        el("p", { class: "muted", text: `Each cell is the number of skills carrying both tags${s.primaryOnly ? " as their primary tag; Explore filters on any position, so an opened bucket can be larger" : ""}. Colour is square-root scaled; hover for cohesion, click to open the bucket.` }),
        el("div", { class: "scale" }, "1", el("span", { class: "ramp" }), String(max)),
        heat,
      ),
    );
  }

  // ---- Compare tab -----------------------------------------------------------------------------

  function picker(side) {
    const c = state.compare;
    const key = side === "a" ? "queryA" : "queryB";
    const chosen = c[side];
    const query = c[key].trim().toLowerCase();
    const options = query
      ? skills
          .map((skill, index) => ({ skill, index }))
          .filter(({ skill }) => `${skill.name}\n${skill.summary}`.toLowerCase().includes(query))
          .slice(0, 8)
      : [];
    return el(
      "div",
      { class: "picker" },
      el("h3", { text: side === "a" ? "Skill A" : "Skill B" }),
      el("input", {
        type: "search",
        id: `pick-${side}`,
        placeholder: "Type to search a skill",
        value: c[key],
        oninput: (event) => {
          c[key] = event.target.value;
          render();
        },
      }),
      el(
        "div",
        { class: "options" },
        options.map(({ skill, index }) =>
          el("button", {
            type: "button",
            text: skill.name,
            onclick: () => {
              c[side] = index;
              c[key] = "";
              render();
            },
          }),
        ),
      ),
      chosen === null
        ? el("p", { class: "muted", text: side === "a" ? "Or select a skill in Explore." : "Or click a cell of the matrix below, or “vs” next to a neighbor in Explore." })
        : el(
            "div",
            { class: "skill-card" },
            el("div", { class: "name", text: skills[chosen].name }),
            el("div", { class: "muted", text: skills[chosen].summary }),
            el("div", { class: "chips", style: "margin-top:6px" }, PRIMARY_FACETS.flatMap((facetId) => (skills[chosen].tags[facetId] || []).map((tag, position) => chip(facetId, tag, { primary: position === 0 })))),
          ),
    );
  }

  function seriate(items, score) {
    if (items.length === 0) {
      return [];
    }
    const remaining = new Set(items);
    let current = items.reduce((best, item) => {
      const total = items.reduce((sum, other) => sum + (other === item ? 0 : score(item, other)), 0);
      return total > best.total ? { item, total } : best;
    }, { item: items[0], total: -Infinity }).item;
    const order = [current];
    remaining.delete(current);
    while (remaining.size) {
      let next = null;
      let bestScore = -Infinity;
      for (const candidate of remaining) {
        const value = score(current, candidate);
        if (value > bestScore || (value === bestScore && skills[candidate].id < skills[next].id)) {
          bestScore = value;
          next = candidate;
        }
      }
      order.push(next);
      remaining.delete(next);
      current = next;
    }
    return order;
  }

  function renderCompare() {
    const container = document.getElementById("compare");
    container.replaceChildren();
    const c = state.compare;
    if (c.a === null && state.skill !== null) {
      c.a = state.skill;
    }
    container.append(el("div", { class: "panel compare-head" }, picker("a"), picker("b")));

    if (c.a !== null && c.b !== null) {
      const a = c.a;
      const b = c.b;
      const totalWeight = weighted.reduce((sum, facet) => sum + facet.weight, 0);
      const scoreTiles = [
        ["Jaccard (facet-weighted)", num(jaccard(a, b), 3), `B ranks #${rankOf(a, b, (other) => similarity(a, other, "jaccard"))} among A's tag neighbors`],
        ["IDF cosine", num(idfCosine(a, b), 3), `B ranks #${rankOf(a, b, (other) => similarity(a, other, "idf-cosine"))}`],
        [
          cosines ? `Embedding cosine (${cosines.model})` : "Embedding cosine",
          cosines ? num(cosine(a, b), 3) : "–",
          cosines ? `B ranks #${rankOf(a, b, (other) => cosine(a, other))} · global mean ${num(metrics.reference && metrics.reference.globalMeanCosine, 3)}` : "no reference",
        ],
      ];
      container.append(
        el(
          "div",
          { class: "scores" },
          scoreTiles.map(([label, value, note]) => el("div", { class: "tile" }, el("div", { class: "muted", text: label }), el("div", { class: "value", text: value }), el("div", { class: "muted", text: note }))),
        ),
      );
      const rows = taxonomy.map((facet) => {
        const left = skills[a].tags[facet.id] || [];
        const right = skills[b].tags[facet.id] || [];
        const shared = left.filter((tag) => right.includes(tag));
        const onlyA = left.filter((tag) => !right.includes(tag));
        const onlyB = right.filter((tag) => !left.includes(tag));
        const value = facetJaccard(a, b, facet.id);
        const share = facet.weight / totalWeight;
        return [
          el("span", {}, el("strong", { text: facet.id }), el("span", { class: "muted", text: ` w${facet.weight}` })),
          el("div", { class: "chips" }, shared.length ? shared.map((tag) => chip(facet.id, tag, { shared: true })) : el("span", { class: "muted", text: "–" })),
          el("div", { class: "chips" }, onlyA.length ? onlyA.map((tag) => chip(facet.id, tag, { only: true })) : el("span", { class: "muted", text: "–" })),
          el("div", { class: "chips" }, onlyB.length ? onlyB.map((tag) => chip(facet.id, tag, { only: true })) : el("span", { class: "muted", text: "–" })),
          facet.weight === 0 || value === null
            ? el("span", { class: "muted", text: facet.weight === 0 ? "not weighted" : "no tags" })
            : el(
                "span",
                {},
                el("span", { class: "contrib-track", style: `width:${Math.round(140 * share * 2)}px` }, el("span", { class: "contrib", style: `width:${Math.round(140 * share * 2 * value)}px` })),
                `${num(value, 2)}`,
              ),
        ];
      });
      container.append(
        el(
          "div",
          { class: "panel" },
          el("h2", { text: `${skills[a].name} vs ${skills[b].name}` }),
          el("p", { class: "muted", text: "Per facet: tags both skills share, tags only A has, tags only B has. The bar is the facet's Jaccard; its track width is the facet's weight in the overall score." }),
          table([{ label: "facet" }, { label: "shared" }, { label: "only A" }, { label: "only B" }, { label: "jaccard × weight" }], rows),
        ),
      );
    }

    // Similarity matrix of the current Explore selection, or of A's nearest skills.
    const selection = matching(state.selected, state.query);
    let items;
    let title;
    if (c.source === "neighbors" && c.a !== null) {
      items = [c.a, ...neighbors(c.a, 19, c.method).map((neighbor) => neighbor.index)];
      title = `${skills[c.a].name} and its 19 nearest by ${c.method}`;
    } else {
      items = selection;
      title = state.selected.size || state.query ? `Explore selection: ${selectionLabel() || state.query} (${selection.length})` : `All skills (${selection.length})`;
    }
    const header = el(
      "div",
      { class: "controls" },
      toggle(["selection", "neighbors"], c.source, (value) => {
        c.source = value;
        render();
      }, { selection: "Explore selection", neighbors: "A's 20 nearest" }),
      toggle(METHODS, c.method, (value) => {
        c.method = value;
        render();
      }),
      el("span", { class: "muted", text: title }),
    );
    const matrixPanel = el("div", { class: "panel", style: "overflow:auto" }, el("h2", { text: "Similarity matrix" }), header);
    if (items.length < 2) {
      matrixPanel.append(el("p", { class: "muted", text: "Select at least two skills in Explore, or pick skill A and switch to its nearest skills." }));
    } else if (items.length > MATRIX_MAX) {
      matrixPanel.append(el("p", { class: "muted", text: `${items.length} skills is too many to draw. Narrow the Explore selection to at most ${MATRIX_MAX}, or switch to A's nearest skills.` }));
    } else {
      const order = seriate(items, (i, j) => similarity(i, j, c.method));
      const small = order.length > 24;
      const heat = el("table", { class: "heat" });
      const head = el("tr", {}, el("th", {}));
      for (const col of order) {
        head.append(el("th", { class: "col", title: skills[col].name }, el("span", { text: small ? "" : skills[col].name.slice(0, 22) })));
      }
      heat.append(el("thead", {}, head));
      const body = el("tbody");
      for (const row of order) {
        const tr = el("tr", {}, el("th", { class: "row" }, el("button", { type: "button", class: "link", text: skills[row].name, title: skills[row].name, onclick: () => {
          c.a = row;
          render();
        } })));
        for (const col of order) {
          const value = similarity(row, col, c.method);
          const active = (c.a === row && c.b === col) || (c.a === col && c.b === row);
          tr.append(
            el(
              "td",
              {},
              el("button", {
                type: "button",
                class: `cell${small ? " small" : ""}${active ? " active" : ""}`,
                style: `background:${seqColor(value)};color:${seqInk(value)}`,
                text: row === col ? "" : num(value, 2).replace(/^0/, ""),
                "aria-label": `${skills[row].name} vs ${skills[col].name}: ${num(value, 3)}`,
                onclick: () => {
                  if (row !== col) {
                    c.a = row;
                    c.b = col;
                    render();
                  }
                },
                onpointermove: (event) => {
                  const lines = [`${c.method}: ${num(value, 3)}`];
                  if (cosines && row !== col) {
                    lines.push(`embedding cosine: ${num(cosine(row, col), 3)}`);
                  }
                  showTooltip(event, `${skills[row].name} × ${skills[col].name}`, lines);
                },
                onpointerleave: hideTooltip,
              }),
            ),
          );
        }
        body.append(tr);
      }
      heat.append(body);
      matrixPanel.append(
        el("p", { class: "muted", text: "Rows and columns follow a nearest-neighbor chain, so blocks of similar skills sit together. Click a cell to compare that pair." }),
        el("div", { class: "scale" }, "0", el("span", { class: "ramp" }), "1"),
        heat,
      );
    }
    container.append(matrixPanel);
  }

  // ---- Metrics tab -----------------------------------------------------------------------------

  function bar(share) {
    return el("span", {}, el("span", { class: "bar", style: `width:${Math.max(2, Math.round(share * 120))}px` }), ` ${pct(share)}`);
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
    container.append(el("div", { class: "tiles" }, tiles.map(([label, value]) => el("div", { class: "tile" }, el("div", { class: "muted", text: label }), el("div", { class: "value", text: String(value) })))));

    const reference = metrics.reference;
    if (reference) {
      container.append(
        el(
          "section",
          { class: "panel" },
          el("h2", { text: `Agreement with embeddings (${metrics.referenceModel})` }),
          el("p", { class: "muted", text: `Global mean cosine between skills: ${num(reference.globalMeanCosine, 3)}. Neighbor overlap is the share of a skill's top-k tag neighbors that are also among its top-k embedding neighbors.` }),
          el(
            "div",
            { class: "grid-2" },
            el(
              "div",
              {},
              el("h3", { text: "Neighbor overlap@k" }),
              table([{ label: "k" }, { label: "idf-cosine", num: true }, { label: "jaccard", num: true }, { label: "random", num: true }], reference.neighborOverlap.map((row) => [row.k, pct(row["idf-cosine"]), pct(row.jaccard), pct(row.random)])),
              el("h3", { text: "Spearman correlation over all pairs" }),
              table([{ label: "method" }, { label: "rho", num: true }], METHODS.map((method) => [method, num(reference.spearman[method], 3)])),
            ),
            el(
              "div",
              {},
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
            [...reference.bucketCohesion.single, ...reference.bucketCohesion.pairs, reference.bucketCohesion.triple].map((row) => [row.facets.join(" × "), row.buckets, num(row.meanLift, 3), pct(row.shareAboveGlobal)]),
          ),
          el(
            "div",
            { class: "grid-2" },
            el("div", {}, el("h3", { text: "Most cohesive tags (z vs random groups)" }), table([{ label: "tag" }, { label: "n", num: true }, { label: "cosine", num: true }, { label: "lift", num: true }, { label: "z", num: true }], reference.tagCohesion.slice(0, 20).map((row) => [row.key, row.count, num(row.meanCosine, 3), num(row.lift, 3), num(row.z, 1)]))),
            el("div", {}, el("h3", { text: "Least cohesive tags" }), table([{ label: "tag" }, { label: "n", num: true }, { label: "cosine", num: true }, { label: "lift", num: true }, { label: "z", num: true }], reference.tagCohesion.slice(-20).map((row) => [row.key, row.count, num(row.meanCosine, 3), num(row.lift, 3), num(row.z, 1)]))),
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
          segmentation.collisions.slice(0, 40).map((group) => [el("span", {}, group.ids.flatMap((id, position) => [position ? " · " : null, skillLink(id)])), group.size, num(group.meanCosine, 3)]),
        ),
      ),
    );

    container.append(
      el(
        "section",
        { class: "panel" },
        el("h2", { text: "Facet distributions" }),
        el(
          "div",
          { class: "grid-2" },
          metrics.facets.map((facet) =>
            el(
              "div",
              {},
              el("h3", { text: `${facet.id} · coverage ${pct(facet.coverage)} · ${num(facet.meanTagsPerSkill, 2)} tags/skill · entropy ${num(facet.normalizedEntropy, 2)}` }),
              table([{ label: "tag" }, { label: "n", num: true }, { label: "share" }], facet.tags.map((row) => [row.id, row.count, bar(row.share)])),
              facet.rare.length ? el("p", { class: "muted", text: `Rare (< 3 skills): ${facet.rare.join(", ")}` }) : null,
            ),
          ),
        ),
      ),
    );

    const families = metrics.families;
    container.append(
      el(
        "section",
        { class: "panel" },
        el("h2", { text: "Known groups" }),
        el("p", { class: "muted", text: `Bracketed team labels in names imply a function. Accuracy ${pct(families.prefixFunction.accuracy)} on ${families.prefixFunction.evaluated} labeled skills (team labels were ${dataset.maskNamePrefix ? "hidden from" : "visible to"} the tagger). Global mean tag similarity: idf-cosine ${num(families.globalTagMeans["idf-cosine"], 3)}, jaccard ${num(families.globalTagMeans.jaccard, 3)}.` }),
        el(
          "div",
          { class: "grid-2" },
          el("div", {}, el("h3", { text: "Team label → function" }), table([{ label: "label" }, { label: "expected" }, { label: "n", num: true }, { label: "correct", num: true }, { label: "observed" }], families.prefixFunction.perPrefix.map((row) => [row.prefix, row.expected.join(" | "), row.count, row.correct, Object.entries(row.observed).map(([tag, count]) => `${tag} ${count}`).join(", ")]))),
          el(
            "div",
            {},
            el("h3", { text: "Name families" }),
            table(
              [{ label: "family" }, { label: "n", num: true }, { label: "idf-cosine", num: true }, { label: "jaccard", num: true }, { label: "cosine", num: true }, { label: "purity fn / task / subject" }],
              families.nameFamilies.filter((row) => row.count >= 2).map((row) => [row.id, row.count, num(row.meanTagSimilarity["idf-cosine"], 3), num(row.meanTagSimilarity.jaccard, 3), num(row.meanCosine, 3), PRIMARY_FACETS.map((facet) => `${row.purity[facet].tag} ${pct(row.purity[facet].share)}`).join(" / ")]),
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
          table([{ label: "facet" }, { label: "mean Jaccard", num: true }, { label: "exact", num: true }, { label: "primary match", num: true }], metrics.stability.perFacet.map((row) => [row.facet, num(row.meanJaccard, 2), pct(row.exactMatchShare), pct(row.primaryMatchShare)])),
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

  // ---- render loop -----------------------------------------------------------------------------

  const TABS = ["explore", "map", "segments", "compare", "metrics"];

  function render() {
    hideTooltip();
    document.getElementById("subtitle").textContent =
      `${N} skills · workspace ${dataset.workspace} · tagged by ${dataset.model} (${dataset.effort} effort) · taxonomy v${metrics.taxonomyVersion}`;
    for (const button of document.querySelectorAll("[data-tab]")) {
      button.setAttribute("aria-selected", button.dataset.tab === state.tab ? "true" : "false");
    }
    for (const tab of TABS) {
      document.getElementById(tab).hidden = tab !== state.tab;
    }
    const active = document.activeElement;
    const activeId = active && active.id;
    const caret = active && typeof active.selectionStart === "number" ? active.selectionStart : null;
    switch (state.tab) {
      case "explore": {
        const matches = matching(state.selected, state.query);
        renderFacets(matches);
        renderResults(matches);
        renderDetail();
        break;
      }
      case "map":
        renderMap();
        break;
      case "segments":
        renderSegments();
        break;
      case "compare":
        renderCompare();
        break;
      case "metrics":
        renderMetrics();
        break;
    }
    if (activeId) {
      const restored = document.getElementById(activeId);
      if (restored && restored.type === "search") {
        restored.focus();
        if (caret !== null) {
          restored.setSelectionRange(caret, caret);
        }
      }
    }
  }

  for (const button of document.querySelectorAll("[data-tab]")) {
    button.addEventListener("click", () => {
      state.tab = button.dataset.tab;
      render();
    });
  }
  render();
})();
