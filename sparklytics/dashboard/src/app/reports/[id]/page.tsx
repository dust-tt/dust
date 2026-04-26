import { notFound } from "next/navigation";
import Link from "next/link";
import { getReport } from "@/lib/reports";
import { diffReports } from "@/lib/diff";
import { computeHealthScore } from "@/lib/metrics";

interface PageProps {
  params: { id: string };
  searchParams: { baseline?: string };
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-gray-400">—</span>;
  const positive = delta > 0;
  return (
    <span className={positive ? "text-green-400" : "text-rose-400"}>
      {positive ? "+" : ""}
      {delta}
    </span>
  );
}

export default async function ReportDetailPage({ params, searchParams }: PageProps) {
  const id = decodeURIComponent(params.id);
  const baselineId = searchParams.baseline ? decodeURIComponent(searchParams.baseline) : null;

  const report = getReport(id);
  if (!report) notFound();

  const baseline = baselineId ? getReport(baselineId) : null;
  const diff = baseline ? diffReports(baseline, report) : null;

  const healthScore = computeHealthScore(report);
  const healthColor =
    healthScore >= 70 ? "text-green-400" : healthScore >= 40 ? "text-amber-400" : "text-rose-400";

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/reports" className="text-gray-400 hover:text-gray-200 text-sm underline underline-offset-2 decoration-1 transition-colors">
          ← Reports
        </Link>
        <span className="text-gray-600">/</span>
        <h1 className="text-xl font-semibold text-gray-50">
          {new Date(report.meta.timestamp).toLocaleString()}
        </h1>
        {diff && (
          <span className="text-xs text-gray-400">
            vs {new Date(baseline!.meta.timestamp).toLocaleString()}
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl p-4">
          <p className="text-xs text-gray-300 uppercase tracking-widest mb-1">Health Score</p>
          <div className="flex items-end gap-2">
            <span className={`text-3xl font-semibold ${healthColor}`}>{healthScore}</span>
            {diff && <DeltaBadge delta={diff.healthScoreDelta} />}
          </div>
        </div>
        <div className="rounded-xl p-4">
          <p className="text-xs text-gray-300 uppercase tracking-widest mb-1">Adoption Rate</p>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-semibold text-gray-50">
              {(report.summary.adoptionRate * 100).toFixed(1)}%
            </span>
            {diff && (
              <span className={diff.adoptionRateDelta >= 0 ? "text-green-400" : "text-rose-400"}>
                {diff.adoptionRateDelta >= 0 ? "+" : ""}
                {(diff.adoptionRateDelta * 100).toFixed(1)}%
              </span>
            )}
          </div>
        </div>
        <div className="rounded-xl p-4">
          <p className="text-xs text-gray-300 uppercase tracking-widest mb-1">Files Scanned</p>
          <span className="text-3xl font-semibold text-gray-50">{report.meta.fileCount.toLocaleString()}</span>
        </div>
        <div className="rounded-xl p-4">
          <p className="text-xs text-gray-300 uppercase tracking-widest mb-1">Duration</p>
          <span className="text-3xl font-semibold text-gray-50">{report.meta.durationMs}ms</span>
        </div>
      </div>

      {/* Diff view */}
      {diff && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {diff.addedComponents.length > 0 && (
            <div
              className="rounded-xl p-5"
              style={{
                background: "rgba(95, 201, 146, 0.05)",
                border: "1px solid rgba(95, 201, 146, 0.2)",
              }}
            >
              <h3 className="text-sm font-semibold text-green-400 mb-3">
                + {diff.addedComponents.length} New Components
              </h3>
              <ul className="space-y-1">
                {diff.addedComponents.map((name) => (
                  <li key={name} className="text-xs font-mono text-green-300">{name}</li>
                ))}
              </ul>
            </div>
          )}
          {diff.removedComponents.length > 0 && (
            <div
              className="rounded-xl p-5"
              style={{
                background: "rgba(255, 99, 99, 0.05)",
                border: "1px solid rgba(255, 99, 99, 0.2)",
              }}
            >
              <h3 className="text-sm font-semibold text-rose-400 mb-3">
                − {diff.removedComponents.length} Removed Components
              </h3>
              <ul className="space-y-1">
                {diff.removedComponents.map((name) => (
                  <li key={name} className="text-xs font-mono text-rose-300">{name}</li>
                ))}
              </ul>
            </div>
          )}
          {diff.changedComponents.length > 0 && (
            <div className="rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-200 mb-3">
                ± {diff.changedComponents.length} Changed Components
              </h3>
              <ul className="space-y-1.5">
                {diff.changedComponents.slice(0, 15).map((c) => (
                  <li key={c.name} className="flex justify-between text-xs">
                    <span className="font-mono text-gray-300">{c.name}</span>
                    <span className={c.delta > 0 ? "text-green-400" : "text-rose-400"}>
                      {c.delta > 0 ? "+" : ""}{c.delta}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Top components */}
      <div className="p-5">
        <h2 className="text-sm font-semibold text-gray-200 mb-4 tracking-wide">
          Top Components ({report.summary.totalComponents} total)
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <th className="text-left pb-2 text-xs text-gray-300 uppercase tracking-widest">Component</th>
              <th className="text-right pb-2 text-xs text-gray-300 uppercase tracking-widest">Usages</th>
              <th className="text-right pb-2 text-xs text-gray-300 uppercase tracking-widest">Props</th>
            </tr>
          </thead>
          <tbody>
            {report.components.slice(0, 20).map((comp) => (
              <tr
                key={comp.name}
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
              >
                <td className="py-2 font-mono text-xs" style={{ color: "#00d992" }}>
                  <Link href={`/components/${encodeURIComponent(comp.name)}`} className="underline underline-offset-2 decoration-1 hover:opacity-70 transition-opacity" style={{ color: "#00d992" }}>{comp.name}</Link>
                </td>
                <td className="py-2 text-right text-gray-300 tabular-nums">{comp.usageCount.toLocaleString()}</td>
                <td className="py-2 text-right text-gray-400 tabular-nums">{comp.props.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
