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
  if (
    !Array.isArray(config.agents) ||
    config.agents.length < 2 ||
    config.agents.length > 5
  ) {
    throw new Error("config.agents must contain two to five candidates");
  }
  const ids = new Set();
  for (const agent of config.agents) {
    if (!isNonEmptyString(agent?.id) || !/^[A-Za-z0-9_-]+$/.test(agent.id)) {
      throw new Error(
        "Every agent id must use only letters, digits, underscore, or hyphen",
      );
    }
    if (!isNonEmptyString(agent.label)) {
      throw new Error(`Agent ${agent.id} needs a label`);
    }
    if (ids.has(agent.id)) {
      throw new Error(`Duplicate agent id: ${agent.id}`);
    }
    ids.add(agent.id);
  }
  return config;
}

export function randomShuffle(values) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = crypto.randomInt(index + 1);
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
