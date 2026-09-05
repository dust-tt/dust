import fs from "node:fs/promises";
import path from "node:path";

import {
  listPackIds,
  parseArgs,
  randomShuffle,
  readJson,
  requireArg,
  stderr,
  stdout,
  validateConfig,
  writeJson,
} from "./lib.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = validateConfig(
    await readJson(path.resolve(requireArg(args, "config"))),
  );
  const packsRoot = path.resolve(requireArg(args, "packs"));
  const frameIndex = await readJson(
    path.resolve(requireArg(args, "frame-index")),
  );
  const outRoot = path.resolve(requireArg(args, "out"));
  const packIds = await listPackIds(packsRoot);
  const payloads = [];
  const mappings = {};
  const skipped = [];

  for (const packId of packIds) {
    const candidates = config.agents.map((agent) => ({
      agentId: agent.id,
      label: agent.label,
      frameUrl: frameIndex[packId]?.[agent.id],
    }));
    const missing = candidates.filter(
      ({ frameUrl }) => typeof frameUrl !== "string" || frameUrl.length === 0,
    );
    if (missing.length > 0) {
      skipped.push({
        packId,
        missingAgents: missing.map(({ agentId }) => agentId),
      });
      continue;
    }
    for (const candidate of candidates) {
      let parsed;
      try {
        parsed = new URL(candidate.frameUrl);
      } catch {
        throw new Error(
          `${packId}/${candidate.agentId} has an invalid Frame URL`,
        );
      }
      if (!["https:", "http:"].includes(parsed.protocol)) {
        throw new Error(
          `${packId}/${candidate.agentId} Frame URL must use HTTP or HTTPS`,
        );
      }
    }

    const shuffled = randomShuffle(candidates);
    const slots = shuffled.map((candidate, index) => ({
      slot: String(index + 1),
      frameUrl: candidate.frameUrl,
    }));
    const mapping = Object.fromEntries(
      shuffled.map((candidate, index) => [
        String(index + 1),
        { agentId: candidate.agentId, label: candidate.label },
      ]),
    );
    payloads.push({
      packId,
      slots,
      brief: (
        await fs.readFile(path.join(packsRoot, packId, "brief.md"), "utf8")
      ).trim(),
    });
    mappings[packId] = { slots: mapping };
  }

  await writeJson(path.join(outRoot, "payloads.json"), payloads);
  await writeJson(path.join(outRoot, "mapping.private.json"), mappings);
  await writeJson(path.join(outRoot, "skipped.json"), skipped);
  stdout(
    `Built ${payloads.length} blind matchup(s); skipped ${skipped.length} incomplete pack(s).`,
  );
  stdout(`Private mapping: ${path.join(outRoot, "mapping.private.json")}`);
}

main().catch((error) => {
  stderr(error.stack ?? error.message);
  process.exitCode = 1;
});
