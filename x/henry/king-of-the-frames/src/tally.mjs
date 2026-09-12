import fs from "node:fs/promises";
import path from "node:path";

import {
  parseArgs,
  readJson,
  requireArg,
  stderr,
  stdout,
  writeJson,
} from "./lib.mjs";

export function tally(feedback, mapping) {
  const stats = new Map();
  const getStats = (agentId, label) => {
    if (!stats.has(agentId)) {
      stats.set(agentId, {
        agentId,
        label,
        matchesPlayed: 0,
        decided: 0,
        outrightWins: 0,
        tieShare: 0,
        rawVotes: 0,
      });
    }
    return stats.get(agentId);
  };

  let decidedMatchups = 0;
  let noVoteMatchups = 0;
  let totalSlotVotes = 0;
  let totalNoneVotes = 0;
  for (const matchup of feedback.matchups ?? []) {
    const slots = mapping[matchup.packId]?.slots;
    if (!slots) {
      throw new Error(`Missing private mapping for ${matchup.packId}`);
    }
    const slotEntries = Object.entries(slots);
    for (const [, candidate] of slotEntries) {
      getStats(candidate.agentId, candidate.label).matchesPlayed += 1;
    }

    const votes = slotEntries.map(([slot, candidate]) => ({
      slot,
      candidate,
      votes: Number(matchup.votesBySlot?.[slot] ?? 0),
    }));
    const voteCount = votes.reduce((sum, vote) => sum + vote.votes, 0);
    totalSlotVotes += voteCount;
    totalNoneVotes += Number(matchup.noneVotes ?? 0);
    for (const vote of votes) {
      getStats(vote.candidate.agentId, vote.candidate.label).rawVotes +=
        vote.votes;
    }

    if (voteCount === 0) {
      noVoteMatchups += 1;
      continue;
    }
    decidedMatchups += 1;
    for (const [, candidate] of slotEntries) {
      getStats(candidate.agentId, candidate.label).decided += 1;
    }
    const topVotes = Math.max(...votes.map(({ votes: count }) => count));
    const leaders = votes.filter(({ votes: count }) => count === topVotes);
    if (leaders.length === 1) {
      getStats(
        leaders[0].candidate.agentId,
        leaders[0].candidate.label,
      ).outrightWins += 1;
    } else {
      for (const leader of leaders) {
        getStats(leader.candidate.agentId, leader.candidate.label).tieShare +=
          1 / leaders.length;
      }
    }
  }

  const candidates = [...stats.values()]
    .map((candidate) => ({
      ...candidate,
      winRate:
        candidate.decided === 0
          ? 0
          : (candidate.outrightWins + candidate.tieShare) / candidate.decided,
    }))
    .sort(
      (left, right) =>
        right.winRate - left.winRate || right.rawVotes - left.rawVotes,
    );
  return {
    collectedAt: feedback.collectedAt ?? null,
    uniqueReviewerCount: feedback.uniqueReviewerCount ?? null,
    matchupCount: (feedback.matchups ?? []).length,
    decidedMatchups,
    noVoteMatchups,
    totalSlotVotes,
    totalNoneVotes,
    candidates,
  };
}

function markdown(summary) {
  const lines = [
    "# Blind Frame evaluation tally",
    "",
    `- Matchups: ${summary.matchupCount}`,
    `- Decided: ${summary.decidedMatchups}`,
    `- No slot votes: ${summary.noVoteMatchups}`,
    `- Slot votes: ${summary.totalSlotVotes}`,
    `- None suitable votes: ${summary.totalNoneVotes}`,
    `- Unique reviewers: ${summary.uniqueReviewerCount ?? "unknown"}`,
    "",
    "| Candidate | Played | Decided | Outright | Tie share | Raw votes | Win rate |",
    "|---|---:|---:|---:|---:|---:|---:|",
  ];
  for (const candidate of summary.candidates) {
    lines.push(
      `| ${candidate.label} | ${candidate.matchesPlayed} | ${candidate.decided} | ${candidate.outrightWins} | ${candidate.tieShare.toFixed(2)} | ${candidate.rawVotes} | ${(candidate.winRate * 100).toFixed(1)}% |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const feedback = await readJson(path.resolve(requireArg(args, "feedback")));
  const mapping = await readJson(path.resolve(requireArg(args, "mapping")));
  const outRoot = path.resolve(requireArg(args, "out"));
  const summary = tally(feedback, mapping);
  await writeJson(path.join(outRoot, "summary.json"), summary);
  await fs.mkdir(outRoot, { recursive: true });
  await fs.writeFile(path.join(outRoot, "SUMMARY.md"), markdown(summary));
  stdout(`Tallied ${summary.matchupCount} matchup(s).`);
}

const isMain =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  main().catch((error) => {
    stderr(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
