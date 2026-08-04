import Link from "next/link";
import { listReports, getAllReportIds } from "@/lib/reports";

function formatDate(ts: string): string {
  try {
    return new Date(ts).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

export default async function ReportsPage() {
  const metas = listReports().reverse(); // newest first
  const ids = getAllReportIds();

  if (metas.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-400">No reports found. Run a scan first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-50">Reports</h1>
          <p className="text-sm text-gray-500 mt-1">
            {metas.length} scan report{metas.length !== 1 ? "s" : ""}
          </p>
        </div>
        {metas.length >= 2 && (
          <Link
            href={`/reports/${encodeURIComponent(ids[ids.length - 1])}?baseline=${encodeURIComponent(ids[ids.length - 2])}`}
            className="text-sm text-blue-400 underline underline-offset-2 decoration-1 hover:opacity-70 transition-opacity"
          >
            Compare latest two →
          </Link>
        )}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #3d3a39" }}>
        <table className="w-full text-sm">
          <thead>
            <tr
              className="bg-gray-900"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
              <th className="text-left px-4 py-3 text-xs text-gray-300 uppercase tracking-widest">Date</th>
              <th className="text-right px-4 py-3 text-xs text-gray-300 uppercase tracking-widest">Files</th>
              <th className="text-right px-4 py-3 text-xs text-gray-300 uppercase tracking-widest">Duration</th>
              <th className="text-right px-4 py-3 text-xs text-gray-300 uppercase tracking-widest">Version</th>
              <th className="text-right px-4 py-3 text-xs text-gray-300 uppercase tracking-widest">Actions</th>
            </tr>
          </thead>
          <tbody>
            {metas.map((meta, i) => {
              const id = encodeURIComponent(
                meta.timestamp.replace(/[:.]/g, "-")
              );
              const isLatest = i === 0;
              const prevId =
                i < metas.length - 1
                  ? encodeURIComponent(metas[i + 1].timestamp.replace(/[:.]/g, "-"))
                  : null;
              return (
                <tr
                  key={meta.timestamp}
                  className="hover:bg-gray-800/40 transition-colors"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {isLatest && (
                        <span
                          className="text-xs rounded px-1.5 py-0.5 font-medium"
                          style={{ background: "rgba(0,217,146,0.1)", border: "1px solid rgba(0,217,146,0.2)", color: "#00d992" }}
                        >
                          latest
                        </span>
                      )}
                      <span className="text-gray-200">{formatDate(meta.timestamp)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300 tabular-nums">{meta.fileCount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-gray-400 tabular-nums">{meta.durationMs}ms</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-400 text-xs">
                    v{meta.sparkleVersion}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      <Link
                        href={`/reports/${id}`}
                        className="text-xs text-blue-400 underline underline-offset-2 decoration-1 hover:opacity-70 transition-opacity"
                      >
                        View
                      </Link>
                      {prevId && (
                        <Link
                          href={`/reports/${id}?baseline=${prevId}`}
                          className="text-xs text-gray-400 underline underline-offset-2 decoration-1 hover:text-gray-200 transition-colors"
                        >
                          Diff
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
