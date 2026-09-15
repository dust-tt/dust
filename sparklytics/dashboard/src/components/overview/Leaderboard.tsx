import Link from "next/link";
import type { LeaderboardEntry } from "@/lib/types";

interface LeaderboardProps {
  entries: LeaderboardEntry[];
}

export function Leaderboard({ entries }: LeaderboardProps) {
  if (entries.length === 0) {
    return <p className="text-sm text-gray-500">No data available.</p>;
  }

  const max = entries[0].sparkleUsages;

  return (
    <div className="space-y-3">
      {entries.map((entry, i) => (
        <div key={entry.folder} className="flex items-center gap-3">
          <span className="text-xs text-gray-500 w-4 shrink-0 tabular-nums">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1.5">
              <Link
                href={`/folders/${entry.folder.split("/").map(encodeURIComponent).join("/")}`}
                className="text-sm text-gray-100 truncate font-mono tracking-tight underline underline-offset-2 decoration-1 hover:text-blue-400 transition-colors"
              >
                {entry.folder}/
              </Link>
              <span className="text-xs text-gray-400 shrink-0 ml-2 tabular-nums">
                {entry.sparkleUsages}
              </span>
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ background: "#1a1a1a", border: "1px solid #3d3a39" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${(entry.sparkleUsages / max) * 100}%`,
                  background: "linear-gradient(90deg, #00d992, #2fd6a1)",
                }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
