import { rename } from "node:fs/promises";
import { CONFIG_ENV_PATH } from "./paths";

const TMP_PATH = `${CONFIG_ENV_PATH}.tmp`;
const BAK_PATH = `${CONFIG_ENV_PATH}.bak`;

interface EnvVar {
  key: string;
  value: string;
}

// Matches lines like: export KEY=value  export KEY="value"  export KEY='value'
const EXPORT_PATTERN = /^export ([A-Za-z_][A-Za-z0-9_]*)=(.*)/;

function unquoteValue(raw: string): string {
  if (
    raw.length >= 2 &&
    ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")))
  ) {
    return raw.slice(1, -1);
  }
  return raw;
}

function quoteValue(value: string): string {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) return value;
  if (!value.includes("'")) return `'${value}'`;
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`");
  return `"${escaped}"`;
}

async function readContent(): Promise<string> {
  const file = Bun.file(CONFIG_ENV_PATH);
  if (!(await file.exists())) return "";
  return file.text();
}

async function backupContent(content: string): Promise<void> {
  if (content) await Bun.write(BAK_PATH, content);
}

export async function listConfigVars(): Promise<EnvVar[]> {
  const content = await readContent();
  const vars: EnvVar[] = [];
  for (const line of content.split("\n")) {
    const match = EXPORT_PATTERN.exec(line);
    const key = match?.[1];
    const rawValue = match?.[2];
    if (key !== undefined && rawValue !== undefined) {
      vars.push({ key, value: unquoteValue(rawValue) });
    }
  }
  return vars;
}

export async function getConfigVar(key: string): Promise<string | null> {
  const vars = await listConfigVars();
  return vars.find((v) => v.key === key)?.value ?? null;
}

export async function setConfigVar(key: string, value: string): Promise<void> {
  if (value.includes("\n")) {
    throw new Error("Value must not contain newlines");
  }
  const content = await readContent();
  await backupContent(content);
  const newLine = `export ${key}=${quoteValue(value)}`;
  const lines = content.split("\n");

  let found = false;
  const updated = lines.map((line) => {
    const match = EXPORT_PATTERN.exec(line);
    if (match && match[1] === key) {
      found = true;
      return newLine;
    }
    return line;
  });

  if (!found) {
    while (updated.length > 0 && updated[updated.length - 1]?.trim() === "") {
      updated.pop();
    }
    updated.push(newLine);
    updated.push("");
  }

  await Bun.write(TMP_PATH, updated.join("\n"));
  await rename(TMP_PATH, CONFIG_ENV_PATH);
}

export async function unsetConfigVar(key: string): Promise<boolean> {
  const content = await readContent();
  if (!content) return false;
  await backupContent(content);

  const lines = content.split("\n");
  let found = false;
  const updated = lines.filter((line) => {
    const match = EXPORT_PATTERN.exec(line);
    if (match && match[1] === key) {
      found = true;
      return false;
    }
    return true;
  });

  if (!found) return false;

  await Bun.write(TMP_PATH, updated.join("\n"));
  await rename(TMP_PATH, CONFIG_ENV_PATH);
  return true;
}
