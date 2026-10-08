import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const TEXT_EXTENSIONS = new Set([
  ".csv",
  ".html",
  ".json",
  ".md",
  ".sql",
  ".tsv",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

const SECRET_PATTERNS = [
  { name: "Slack token", pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/i },
  { name: "API key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    name: "serialized access or refresh token",
    pattern:
      /["'](?:access_token|refresh_token|client_secret)["']\s*:\s*["'][^"']{8,}["']/i,
  },
];

const DEFAULT_OUTPUT_CONFIG = {
  type: "frame",
};

const DEFAULT_REVIEW_CONFIG = {
  type: "winner",
};

const AGENT_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const ITEM_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const REASONING_EFFORTS = new Set([
  "none",
  "minimal",
  "light",
  "low",
  "medium",
  "high",
  "xhigh",
  "maximal",
]);

export function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (!part.startsWith("--")) {
      throw new Error(`Unexpected argument: ${part}`);
    }
    const key = part.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      parsed[key] = next;
      index += 1;
    } else {
      parsed[key] = true;
    }
  }
  return parsed;
}

export function requireArg(args, key) {
  const value = args[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing --${key}`);
  }
  return value;
}

export async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function loadJsonl(filePath) {
  const body = await fs.readFile(filePath, "utf8");
  return body
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${filePath}:${index + 1}: ${error.message}`);
      }
    });
}

export async function appendJsonl(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`);
}

export async function appendRunEvent(logPath, event, details = {}) {
  if (!logPath) {
    return;
  }
  await appendJsonl(logPath, {
    timestamp: new Date().toISOString(),
    event,
    ...details,
  });
}

export async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(rootPath) {
  if (!(await pathExists(rootPath))) {
    return [];
  }
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Symlinks are not allowed in packs: ${entryPath}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(entryPath)));
    } else if (entry.isFile() && !entry.name.startsWith(".")) {
      files.push(entryPath);
    }
  }
  return files;
}

export async function listPackIds(packsRoot) {
  const entries = await fs.readdir(packsRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
}

export async function collectPackAttachments(packDir) {
  const candidates = [
    ...(await walkFiles(path.join(packDir, "context", "data"))),
    ...(await walkFiles(path.join(packDir, "context", "notes"))),
    ...(await walkFiles(path.join(packDir, "attachments"))),
  ];
  const indexPath = path.join(packDir, "context", "INDEX.md");
  const files = (await pathExists(indexPath))
    ? [...candidates, indexPath]
    : candidates;
  const basenames = new Set();
  return files.sort().map((filePath) => {
    const name = path.basename(filePath);
    if (basenames.has(name)) {
      throw new Error(`Duplicate attachment basename in ${packDir}: ${name}`);
    }
    basenames.add(name);
    return { filePath, name };
  });
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeCandidates(candidates, { context, idKey }) {
  if (
    !Array.isArray(candidates) ||
    candidates.length < 2 ||
    candidates.length > 5
  ) {
    throw new Error(`${context} must contain two to five candidates`);
  }
  const ids = new Set();
  return candidates.map((candidate) => {
    const id = candidate?.[idKey];
    if (!isNonEmptyString(id) || !AGENT_ID_PATTERN.test(id)) {
      throw new Error(
        `${context} candidate ${idKey} must use only letters, digits, underscore, or hyphen`,
      );
    }
    if (!isNonEmptyString(candidate.label)) {
      throw new Error(`${context} candidate ${id} needs a label`);
    }
    if (ids.has(id)) {
      throw new Error(`${context} has duplicate candidate ${id}`);
    }
    ids.add(id);
    return { id, label: candidate.label.trim() };
  });
}

function normalizeModelSelection(modelSelection, { context, candidateId }) {
  if (modelSelection === undefined) {
    return undefined;
  }
  if (
    modelSelection === null ||
    typeof modelSelection !== "object" ||
    Array.isArray(modelSelection)
  ) {
    throw new Error(
      `${context} candidate ${candidateId} modelSelection must be an object`,
    );
  }
  if (!isNonEmptyString(modelSelection.providerId)) {
    throw new Error(
      `${context} candidate ${candidateId} modelSelection needs providerId`,
    );
  }
  if (!isNonEmptyString(modelSelection.modelId)) {
    throw new Error(
      `${context} candidate ${candidateId} modelSelection needs modelId`,
    );
  }
  if (
    modelSelection.reasoningEffort !== undefined &&
    !REASONING_EFFORTS.has(modelSelection.reasoningEffort)
  ) {
    throw new Error(
      `${context} candidate ${candidateId} modelSelection reasoningEffort must be ${[...REASONING_EFFORTS].join(", ")}`,
    );
  }
  return {
    providerId: modelSelection.providerId.trim(),
    modelId: modelSelection.modelId.trim(),
    ...(modelSelection.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: modelSelection.reasoningEffort }),
  };
}

function normalizeDatasetCandidates(candidates, { context }) {
  if (
    !Array.isArray(candidates) ||
    candidates.length < 2 ||
    candidates.length > 5
  ) {
    throw new Error(`${context} must contain two to five candidates`);
  }
  const ids = new Set();
  return candidates.map((candidate) => {
    const agentId = candidate?.agentId;
    const id = candidate?.id ?? agentId;
    if (!isNonEmptyString(id) || !AGENT_ID_PATTERN.test(id)) {
      throw new Error(
        `${context} candidate id must use only letters, digits, underscore, or hyphen`,
      );
    }
    if (!isNonEmptyString(agentId) || !AGENT_ID_PATTERN.test(agentId)) {
      throw new Error(
        `${context} candidate ${id} agentId must use only letters, digits, underscore, or hyphen`,
      );
    }
    if (!isNonEmptyString(candidate.label)) {
      throw new Error(`${context} candidate ${id} needs a label`);
    }
    if (ids.has(id)) {
      throw new Error(`${context} has duplicate candidate ${id}`);
    }
    ids.add(id);
    const modelSelection = normalizeModelSelection(candidate.modelSelection, {
      context,
      candidateId: id,
    });
    return {
      id,
      agentId,
      label: candidate.label.trim(),
      ...(modelSelection === undefined ? {} : { modelSelection }),
    };
  });
}

function secretType(body) {
  return SECRET_PATTERNS.find(({ pattern }) => pattern.test(body))?.name;
}

export async function loadDatasetItems(datasetPath) {
  const rows = await loadJsonl(datasetPath);
  if (rows.length === 0) {
    throw new Error(`No items found in ${datasetPath}`);
  }
  const datasetRoot = path.dirname(datasetPath);
  const itemIds = new Set();
  const candidateSpecs = new Map();
  const items = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const context = `${datasetPath}:${index + 1}`;
    if (!isNonEmptyString(row?.id) || !ITEM_ID_PATTERN.test(row.id)) {
      const allowedIdCharacters = "letters, digits, dot, underscore, or hyphen";
      throw new Error(
        `${context} id must start with a letter or digit and use only ${allowedIdCharacters}`,
      );
    }
    if (itemIds.has(row.id)) {
      throw new Error(`${context} has duplicate item id ${row.id}`);
    }
    itemIds.add(row.id);
    if (!isNonEmptyString(row.prompt)) {
      throw new Error(`${context} prompt must be a non-empty string`);
    }
    const promptSecret = secretType(row.prompt);
    if (promptSecret) {
      throw new Error(
        `${context} prompt looks like it contains a ${promptSecret}`,
      );
    }
    const candidates = normalizeDatasetCandidates(row.candidates, { context });
    for (const candidate of candidates) {
      const candidateSpec = JSON.stringify(candidate);
      const priorSpec = candidateSpecs.get(candidate.id);
      if (priorSpec !== undefined && priorSpec !== candidateSpec) {
        throw new Error(
          `${context} candidate ${candidate.id} must keep the same label, agentId, and modelSelection across items`,
        );
      }
      candidateSpecs.set(candidate.id, candidateSpec);
    }
    const attachmentPaths = row.attachments ?? [];
    if (!Array.isArray(attachmentPaths)) {
      throw new Error(`${context} attachments must be an array`);
    }
    const basenames = new Set();
    const attachments = [];
    for (const attachmentPath of attachmentPaths) {
      if (
        !isNonEmptyString(attachmentPath) ||
        path.isAbsolute(attachmentPath)
      ) {
        throw new Error(`${context} attachment paths must be relative strings`);
      }
      const filePath = path.resolve(datasetRoot, attachmentPath);
      const relativePath = path.relative(datasetRoot, filePath);
      if (
        relativePath === ".." ||
        relativePath.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativePath)
      ) {
        throw new Error(
          `${context} attachment is outside the dataset directory: ${attachmentPath}`,
        );
      }
      let stat;
      try {
        stat = await fs.lstat(filePath);
      } catch {
        throw new Error(
          `${context} attachment does not exist: ${attachmentPath}`,
        );
      }
      if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new Error(
          `${context} attachment must be a regular file: ${attachmentPath}`,
        );
      }
      const name = path.basename(filePath);
      if (basenames.has(name)) {
        throw new Error(`${context} has duplicate attachment basename ${name}`);
      }
      basenames.add(name);
      if (
        stat.size <= 5_000_000 &&
        TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase())
      ) {
        const attachmentBody = await fs.readFile(filePath, "utf8");
        const attachmentSecret = secretType(attachmentBody);
        if (attachmentSecret) {
          throw new Error(
            `${context} attachment ${attachmentPath} looks like it contains a ${attachmentSecret}`,
          );
        }
      }
      attachments.push({ filePath, name });
    }
    items.push({
      id: row.id,
      prompt: row.prompt,
      candidates,
      attachments,
    });
  }

  return items;
}

export async function validatePack(packsRoot, packId) {
  const packDir = path.join(packsRoot, packId);
  const errors = [];
  const briefPath = path.join(packDir, "brief.md");
  const manifestPath = path.join(packDir, "manifest.json");
  const indexPath = path.join(packDir, "context", "INDEX.md");

  for (const requiredPath of [briefPath, manifestPath, indexPath]) {
    if (!(await pathExists(requiredPath))) {
      errors.push(`Missing ${path.relative(packDir, requiredPath)}`);
    }
  }

  let attachments = [];
  try {
    attachments = await collectPackAttachments(packDir);
  } catch (error) {
    errors.push(error.message);
  }

  if (await pathExists(briefPath)) {
    const brief = await fs.readFile(briefPath, "utf8");
    if (brief.trim().length < 40) {
      errors.push("brief.md is too short to be a useful task");
    }
    if (
      !/no (?:additional|further) research|do not (?:perform|do) (?:additional|further) research/i.test(
        brief,
      )
    ) {
      errors.push("brief.md must explicitly prohibit additional research");
    }
  }

  if (await pathExists(manifestPath)) {
    try {
      const manifest = await readJson(manifestPath);
      if (manifest.version !== 1) {
        errors.push("manifest.json version must be 1");
      }
      if (manifest.packId !== packId) {
        errors.push(`manifest.json packId must equal directory name ${packId}`);
      }
      if (!Array.isArray(manifest.files)) {
        errors.push("manifest.json files must be an array");
      } else {
        const actualPaths = new Set(
          attachments.map(({ filePath }) =>
            path.relative(packDir, filePath).split(path.sep).join("/"),
          ),
        );
        const declaredPaths = new Set();
        for (const file of manifest.files) {
          if (
            !isNonEmptyString(file?.path) ||
            !isNonEmptyString(file?.description)
          ) {
            errors.push("Every manifest file needs path and description");
            continue;
          }
          declaredPaths.add(file.path);
          if (!actualPaths.has(file.path)) {
            errors.push(
              `Manifest references missing attached file: ${file.path}`,
            );
          }
        }
        for (const actualPath of actualPaths) {
          if (!declaredPaths.has(actualPath)) {
            errors.push(`Attached file missing from manifest: ${actualPath}`);
          }
        }
      }
    } catch (error) {
      errors.push(`Invalid manifest.json: ${error.message}`);
    }
  }

  const textFiles = [
    briefPath,
    manifestPath,
    indexPath,
    ...attachments.map(({ filePath }) => filePath),
  ];
  for (const filePath of textFiles) {
    if (
      !(await pathExists(filePath)) ||
      !TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase())
    ) {
      continue;
    }
    const stat = await fs.stat(filePath);
    if (stat.size > 5_000_000) {
      continue;
    }
    const body = await fs.readFile(filePath, "utf8");
    for (const secretPattern of SECRET_PATTERNS) {
      if (secretPattern.pattern.test(body)) {
        errors.push(
          `${path.relative(packDir, filePath)} looks like it contains a ${secretPattern.name}`,
        );
      }
    }
  }

  return { packId, attachmentCount: attachments.length, errors };
}

export function validateConfig(config) {
  if (!isNonEmptyString(config?.apiBaseUrl)) {
    throw new Error("config.apiBaseUrl is required");
  }
  if (config.agents !== undefined) {
    normalizeCandidates(config.agents, {
      context: "config.agents",
      idKey: "id",
    });
  }
  getOutputConfig(config);
  getReviewConfig(config);
  return config;
}

export async function loadEvaluationItems({ config, datasetPath, packsRoot }) {
  if (Boolean(datasetPath) === Boolean(packsRoot)) {
    throw new Error("Provide exactly one of --dataset or --packs");
  }
  if (datasetPath) {
    if (config.agents !== undefined) {
      throw new Error(
        "config.agents cannot be used with --dataset; define candidates on each dataset item",
      );
    }
    return loadDatasetItems(datasetPath);
  }
  if (config.agents === undefined) {
    throw new Error("config.agents is required when using --packs");
  }
  const candidates = normalizeCandidates(config.agents, {
    context: "config.agents",
    idKey: "id",
  });
  const packIds = await listPackIds(packsRoot);
  if (packIds.length === 0) {
    throw new Error(`No packs found in ${packsRoot}`);
  }
  const items = [];
  for (const packId of packIds) {
    const validation = await validatePack(packsRoot, packId);
    if (validation.errors.length > 0) {
      throw new Error(
        `${packId} is invalid:\n${validation.errors.map((error) => `- ${error}`).join("\n")}`,
      );
    }
    const packDir = path.join(packsRoot, packId);
    items.push({
      id: packId,
      prompt: (
        await fs.readFile(path.join(packDir, "brief.md"), "utf8")
      ).trim(),
      candidates,
      attachments: await collectPackAttachments(packDir),
    });
  }
  return items;
}

export function getOutputConfig(config) {
  const output = config.output ?? DEFAULT_OUTPUT_CONFIG;
  if (output?.type !== "frame" && output?.type !== "answer") {
    throw new Error('config.output.type must be either "frame" or "answer"');
  }
  return { type: output.type };
}

export function getReviewConfig(config) {
  const review = config.review ?? DEFAULT_REVIEW_CONFIG;
  if (review?.type !== "winner" && review?.type !== "ranking") {
    throw new Error('config.review.type must be either "winner" or "ranking"');
  }
  if (review.collection !== undefined && review.collection !== "google-form") {
    throw new Error('config.review.collection must be "google-form" when set');
  }
  return {
    type: review.type,
    ...(review.collection ? { collection: review.collection } : {}),
  };
}

export function randomShuffle(values) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = crypto.randomInt(index + 1);
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

export function createSeededRandom(seed) {
  if (typeof seed !== "string" || seed.length === 0) {
    throw new Error("seed must be a non-empty string");
  }
  let counter = 0;
  return () => {
    const digest = crypto
      .createHash("sha256")
      .update(`${seed}:${counter}`)
      .digest();
    counter += 1;
    return digest.readUInt32BE(0) / 2 ** 32;
  };
}

export function seededShuffle(values, random) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

export function mean(values) {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function percentile(values, fraction) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1),
  );
  return sorted[index];
}

export function sleep(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

export function stdout(message) {
  process.stdout.write(`${message}\n`);
}

export function stderr(message) {
  process.stderr.write(`${message}\n`);
}
