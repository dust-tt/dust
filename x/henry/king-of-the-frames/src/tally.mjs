import fs from "node:fs/promises";
import path from "node:path";

import {
  appendRunEvent,
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
        rankingCount: 0,
        rankSum: 0,
        firstPlaceVotes: 0,
        pairwiseWins: 0,
        pairwiseComparisons: 0,
      });
    }
    return stats.get(agentId);
  };

  let decidedMatchups = 0;
  let noVoteMatchups = 0;
  let totalSlotVotes = 0;
  let totalNoneVotes = 0;
  let totalRankings = 0;
  let invalidRankingReplyCount = 0;
  for (const matchup of feedback.matchups ?? []) {
    const slots = mapping[matchup.packId]?.slots;
    if (!slots) {
      throw new Error(`Missing private mapping for ${matchup.packId}`);
    }
    const slotEntries = Object.entries(slots);
    for (const [, candidate] of slotEntries) {
      getStats(candidate.agentId, candidate.label).matchesPlayed += 1;
    }

    const rankings = Array.isArray(matchup.rankings) ? matchup.rankings : [];
    const usesStructuredRankings =
      matchup.reviewType === "ranking" || rankings.length > 0;
    const rankingVotesBySlot = {};
    const expectedSlots = new Set(slotEntries.map(([slot]) => slot));
    for (const ranking of rankings) {
      if (
        !Array.isArray(ranking.slots) ||
        ranking.slots.length !== slotEntries.length ||
        new Set(ranking.slots).size !== slotEntries.length ||
        ranking.slots.some((slot) => !expectedSlots.has(slot))
      ) {
        throw new Error(`Invalid structured ranking for ${matchup.packId}`);
      }
      totalRankings += 1;
      const firstSlot = ranking.slots[0];
      rankingVotesBySlot[firstSlot] =
        Number(rankingVotesBySlot[firstSlot] ?? 0) + 1;
      for (let rankIndex = 0; rankIndex < ranking.slots.length; rankIndex += 1) {
        const slot = ranking.slots[rankIndex];
        const candidate = slots[slot];
        const candidateStats = getStats(candidate.agentId, candidate.label);
        candidateStats.rankingCount += 1;
        candidateStats.rankSum += rankIndex + 1;
        if (rankIndex === 0) {
          candidateStats.firstPlaceVotes += 1;
        }
        // O(k²) is bounded here because review payloads contain at most five slots.
        for (
          let lowerRankIndex = rankIndex + 1;
          lowerRankIndex < ranking.slots.length;
          lowerRankIndex += 1
        ) {
          const lowerSlot = ranking.slots[lowerRankIndex];
          const lowerCandidate = slots[lowerSlot];
          const lowerStats = getStats(
            lowerCandidate.agentId,
            lowerCandidate.label,
          );
          candidateStats.pairwiseWins += 1;
          candidateStats.pairwiseComparisons += 1;
          lowerStats.pairwiseComparisons += 1;
        }
      }
    }
    invalidRankingReplyCount += Array.isArray(
      matchup.rankingValidationErrors,
    )
      ? matchup.rankingValidationErrors.length
      : 0;

    const effectiveVotesBySlot = usesStructuredRankings
      ? rankingVotesBySlot
      : matchup.votesBySlot;
    const votes = slotEntries.map(([slot, candidate]) => ({
      slot,
      candidate,
      votes: Number(effectiveVotesBySlot?.[slot] ?? 0),
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
    .map(({ rankSum, ...candidate }) => ({
      ...candidate,
      averageRank:
        candidate.rankingCount === 0
          ? null
          : rankSum / candidate.rankingCount,
      pairwiseWinRate:
        candidate.pairwiseComparisons === 0
          ? null
          : candidate.pairwiseWins / candidate.pairwiseComparisons,
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
    totalRankings,
    invalidRankingReplyCount,
    candidates,
  };
}

function markdown(summary) {
  const lines = [
    "# Blind output evaluation tally",
    "",
    `- Matchups: ${summary.matchupCount}`,
    `- Decided: ${summary.decidedMatchups}`,
    `- No slot votes: ${summary.noVoteMatchups}`,
    `- Slot votes: ${summary.totalSlotVotes}`,
    `- None suitable votes: ${summary.totalNoneVotes}`,
    `- Complete rankings: ${summary.totalRankings}`,
    `- Invalid ranking replies: ${summary.invalidRankingReplyCount}`,
    `- Unique reviewers: ${summary.uniqueReviewerCount ?? "unknown"}`,
  ];
  if (summary.totalRankings > 0) {
    lines.push(
      "",
      "| Candidate | Rankings | First place | Average rank | Pairwise W/L | Pairwise win |",
      "|---|---:|---:|---:|---:|---:|",
    );
    for (const candidate of summary.candidates) {
      const pairwiseLosses =
        candidate.pairwiseComparisons - candidate.pairwiseWins;
      const averageRank = candidate.averageRank?.toFixed(2) ?? "—";
      const pairwiseWin =
        candidate.pairwiseWinRate === null
          ? "—"
          : `${(candidate.pairwiseWinRate * 100).toFixed(1)}%`;
      const cells = [
        candidate.label,
        candidate.rankingCount,
        candidate.firstPlaceVotes,
        averageRank,
        `${candidate.pairwiseWins}/${pairwiseLosses}`,
        pairwiseWin,
      ];
      lines.push(`| ${cells.join(" | ")} |`);
    }
  }
  lines.push(
    "",
    "| Candidate | Played | Decided | Outright | Tie share | Raw votes | Win rate |",
    "|---|---:|---:|---:|---:|---:|---:|",
  );
  for (const candidate of summary.candidates) {
    const cells = [
      candidate.label,
      candidate.matchesPlayed,
      candidate.decided,
      candidate.outrightWins,
      candidate.tieShare.toFixed(2),
      candidate.rawVotes,
      `${(candidate.winRate * 100).toFixed(1)}%`,
    ];
    lines.push(`| ${cells.join(" | ")} |`);
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const feedback = await readJson(path.resolve(requireArg(args, "feedback")));
  const mapping = await readJson(path.resolve(requireArg(args, "mapping")));
  const outRoot = path.resolve(requireArg(args, "out"));
  const logPath =
    typeof args.log === "string" ? path.resolve(args.log) : undefined;
  await appendRunEvent(logPath, "tally_started");
  const summary = tally(feedback, mapping);
  await writeJson(path.join(outRoot, "summary.json"), summary);
  await fs.mkdir(outRoot, { recursive: true });
  await fs.writeFile(path.join(outRoot, "SUMMARY.md"), markdown(summary));
  await appendRunEvent(logPath, "tally_completed", {
    matchupCount: summary.matchupCount,
    rankingCount: summary.totalRankings,
  });
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
