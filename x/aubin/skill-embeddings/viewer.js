/* global dataset */
const byId = (id) => document.getElementById(id);
const palette = [
  "#39785a",
  "#ac703a",
  "#627ec0",
  "#a45b87",
  "#7c8646",
  "#4c929e",
  "#b6534d",
  "#8272a9",
  "#776450",
  "#567e92",
];
let experiment =
  dataset.clusters.find((item) => item.k === 5) ?? dataset.clusters[0];
let selected = 0;
let clusterFilter = null;
let zoom = 1;
let pan = { x: 0, y: 0 };
let drag = null;
let moved = false;
const names = dataset.skills.map((skill) => skill.text.toLowerCase());
const plot = byId("plot");
const coordinates = dataset.coordinates;
const extent =
  Math.max(
    0.000001,
    ...coordinates.flatMap(([x, y]) => [Math.abs(x), Math.abs(y)]),
  ) * 1.18;
const color = (label) => palette[label % palette.length];

byId("subtitle").textContent =
  `${dataset.workspace} · ${dataset.skills.length} skills · ${dataset.model} · ${dataset.dimensions} dimensions`;
byId("variance").textContent =
  `${(dataset.explainedVariance.reduce((sum, value) => sum + value, 0) * 100).toFixed(1)}%`;
byId("silhouette-label").textContent =
  `Cosine silhouette · sample of ${dataset.silhouetteSampleSize}`;
for (const item of dataset.clusters) {
  const option = document.createElement("option");
  option.value = String(item.k);
  option.textContent = `${item.k} clusters`;
  byId("cluster-count").append(option);
}
byId("cluster-count").value = String(experiment.k);

function visibleIndices() {
  const query = byId("search").value.toLowerCase().trim();
  return dataset.skills
    .map((_, index) => index)
    .filter(
      (index) =>
        names[index].includes(query) &&
        (clusterFilter === null || experiment.labels[index] === clusterFilter),
    );
}

function svgElement(tag, attributes = {}, text = null) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  if (text !== null) {
    element.textContent = text;
  }
  return element;
}

function draw() {
  plot.replaceChildren();
  const defs = svgElement("defs");
  const clip = svgElement("clipPath", { id: "plot-clip" });
  clip.append(svgElement("rect", { x: 65, y: 20, width: 800, height: 480 }));
  defs.append(clip);
  plot.append(defs);
  for (let i = 0; i <= 4; i++) {
    const x = 65 + i * 200;
    const y = 20 + i * 120;
    plot.append(
      svgElement("line", { x1: x, x2: x, y1: 20, y2: 500, stroke: "#e9ede7" }),
    );
    plot.append(
      svgElement("line", { x1: 65, x2: 865, y1: y, y2: y, stroke: "#e9ede7" }),
    );
    plot.append(
      svgElement(
        "text",
        { x, y: 523, "text-anchor": "middle" },
        ((((x - 465 - pan.x) / 230) * extent) / zoom).toFixed(2),
      ),
    );
    plot.append(
      svgElement(
        "text",
        { x: 55, y: y + 4, "text-anchor": "end" },
        ((-((y - 260 - pan.y) / 230) * extent) / zoom).toFixed(2),
      ),
    );
  }
  plot.append(
    svgElement(
      "text",
      { x: 465, y: 553, "text-anchor": "middle" },
      `PC1 · ${(dataset.explainedVariance[0] * 100).toFixed(1)}%`,
    ),
  );
  plot.append(
    svgElement(
      "text",
      { transform: "translate(17 260) rotate(-90)", "text-anchor": "middle" },
      `PC2 · ${(dataset.explainedVariance[1] * 100).toFixed(1)}%`,
    ),
  );
  const points = svgElement("g", { "clip-path": "url(#plot-clip)" });
  const visible = visibleIndices();
  // Draw the selected point last so it remains selectable among overlapping points.
  const ordered = visible.filter((index) => index !== selected);
  if (visible.includes(selected)) {
    ordered.push(selected);
  }
  for (const index of ordered) {
    const [px, py] = coordinates[index];
    const x = 465 + (px / extent) * 230 * zoom + pan.x;
    const y = 260 - (py / extent) * 230 * zoom + pan.y;
    const circle = svgElement("circle", {
      cx: x,
      cy: y,
      r: index === selected ? 8 : 6,
      fill: color(experiment.labels[index]),
      opacity: 0.88,
      stroke: index === selected ? "#1e322a" : "white",
      "stroke-width": 2,
    });
    circle.append(
      svgElement(
        "title",
        {},
        `${dataset.skills[index].name} · Cluster ${experiment.labels[index] + 1}`,
      ),
    );
    points.append(circle);
    const labels = byId("labels").value;
    if (labels === "all" || (labels === "selected" && index === selected)) {
      points.append(
        svgElement(
          "text",
          { x: x + 12, y: y + 4, "pointer-events": "none" },
          dataset.skills[index].name,
        ),
      );
    }
  }
  plot.append(points);
}

function renderList() {
  const visible = visibleIndices();
  byId("visible-count").textContent =
    `${visible.length} of ${dataset.skills.length} skills shown`;
  byId("export").disabled = visible.length === 0;
  byId("skill-list").replaceChildren();
  for (const index of visible) {
    const skill = dataset.skills[index];
    const row = document.createElement("tr");
    row.dataset.selected = String(index === selected);
    const nameCell = document.createElement("td");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = skill.name;
    button.setAttribute("aria-pressed", String(index === selected));
    button.addEventListener("click", () => selectSkill(index));
    nameCell.append(button);
    row.append(nameCell);
    for (const [value, className] of [
      [String(experiment.labels[index] + 1), ""],
      [skill.description, "description-cell"],
      [String(skill.tokenCount), ""],
    ]) {
      const cell = document.createElement("td");
      cell.className = className;
      cell.textContent = value;
      row.append(cell);
    }
    byId("skill-list").append(row);
  }
  if (!visible.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent =
      "No skills match. Clear the search or select another cluster.";
    row.append(cell);
    byId("skill-list").append(row);
  }
}

function selectSkill(index) {
  selected = index;
  const skill = dataset.skills[index];
  byId("detail-name").textContent = skill.name;
  byId("detail-description").textContent = skill.description;
  byId("detail-meta").textContent =
    `Cluster ${experiment.labels[index] + 1} · ${skill.tokenCount} tokens · ${skill.id}`;
  byId("detail-text").textContent = skill.text;
  const neighbors = dataset.skills
    .map((other, otherIndex) => ({
      index: otherIndex,
      similarity: skill.embedding.reduce(
        (sum, value, dimension) => sum + value * other.embedding[dimension],
        0,
      ),
    }))
    .filter((item) => item.index !== index)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 6);
  byId("neighbors").replaceChildren();
  for (const neighbor of neighbors) {
    const button = document.createElement("button");
    button.type = "button";
    const name = document.createElement("span");
    name.textContent = dataset.skills[neighbor.index].name;
    const score = document.createElement("strong");
    score.textContent = Math.max(-1, Math.min(1, neighbor.similarity)).toFixed(
      3,
    );
    button.append(name, score);
    button.addEventListener("click", () => {
      clusterFilter = null;
      byId("search").value = "";
      renderList();
      selectSkill(neighbor.index);
      renderLegend();
    });
    byId("neighbors").append(button);
  }
  draw();
  // Keep keyboard focus on the originating row while updating selection state.
  const visible = visibleIndices();
  for (const row of byId("skill-list").rows) {
    const button = row.querySelector("button");
    const rowIndex = visible[row.sectionRowIndex];
    row.dataset.selected = String(rowIndex === selected);
    button?.setAttribute("aria-pressed", String(rowIndex === selected));
  }
}

function renderLegend() {
  byId("legend").replaceChildren();
  const counts = new Map();
  for (const label of experiment.labels) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  for (const label of [null, ...counts.keys()].sort(
    (a, b) => (a ?? -1) - (b ?? -1),
  )) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-pressed", String(clusterFilter === label));
    if (label !== null) {
      const dot = document.createElement("span");
      dot.className = "swatch";
      dot.style.background = color(label);
      button.append(dot);
    }
    button.append(
      document.createTextNode(
        label === null
          ? "All clusters"
          : `Cluster ${label + 1} · ${counts.get(label)}`,
      ),
    );
    button.addEventListener("click", () => {
      clusterFilter = label;
      renderLegend();
      renderList();
      draw();
    });
    byId("legend").append(button);
  }
}

function updateExperiment() {
  experiment = dataset.clusters.find(
    (item) => item.k === Number(byId("cluster-count").value),
  );
  clusterFilter = null;
  byId("silhouette").textContent =
    experiment.silhouette === null ? "N/A" : experiment.silhouette.toFixed(3);
  byId("inertia").textContent = experiment.inertia.toFixed(2);
  byId("cluster-note").textContent =
    `Seed ${dataset.seed} · best of 3 K-means++ runs · ${experiment.converged ? "converged" : "iteration limit reached"}. Cluster numbers identify this run only.`;
  renderLegend();
  renderList();
  selectSkill(selected);
}

byId("search").addEventListener("input", () => {
  renderList();
  draw();
});
byId("cluster-count").addEventListener("change", updateExperiment);
byId("labels").addEventListener("change", draw);
byId("zoom-in").addEventListener("click", () => {
  zoom = Math.min(32, zoom * 1.4);
  draw();
});
byId("zoom-out").addEventListener("click", () => {
  zoom = Math.max(0.25, zoom / 1.4);
  draw();
});
byId("reset").addEventListener("click", () => {
  zoom = 1;
  pan = { x: 0, y: 0 };
  draw();
});
plot.addEventListener("pointerdown", (event) => {
  drag = { x: event.clientX, y: event.clientY, pan: { ...pan } };
  moved = false;
  plot.setPointerCapture(event.pointerId);
});
plot.addEventListener("pointermove", (event) => {
  if (!drag) {
    return;
  }
  const scale = 900 / plot.getBoundingClientRect().width;
  if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 4) {
    moved = true;
  }
  if (moved) {
    pan = {
      x: drag.pan.x + (event.clientX - drag.x) * scale,
      y: drag.pan.y + (event.clientY - drag.y) * scale,
    };
    draw();
  }
});
plot.addEventListener("pointerup", (event) => {
  if (!moved) {
    const rect = plot.getBoundingClientRect();
    const x = ((event.clientX - rect.left) * 900) / rect.width;
    const y = ((event.clientY - rect.top) * 570) / rect.height;
    let closest = null;
    let distance = 14;
    for (const index of visibleIndices()) {
      const [px, py] = coordinates[index];
      const candidate = Math.hypot(
        x - (465 + (px / extent) * 230 * zoom + pan.x),
        y - (260 - (py / extent) * 230 * zoom + pan.y),
      );
      if (candidate < distance) {
        closest = index;
        distance = candidate;
      }
    }
    if (closest !== null) {
      selectSkill(closest);
    }
  }
  drag = null;
});
plot.addEventListener("pointercancel", () => {
  drag = null;
});
byId("export").addEventListener("click", () => {
  const data = {
    workspace: dataset.workspace,
    model: dataset.model,
    dimensions: dataset.dimensions,
    seed: dataset.seed,
    k: experiment.k,
    normalized: true,
    skills: visibleIndices().map((index) => ({
      ...dataset.skills[index],
      cluster: experiment.labels[index] + 1,
      pca: coordinates[index],
    })),
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "selected-skills.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
updateExperiment();
