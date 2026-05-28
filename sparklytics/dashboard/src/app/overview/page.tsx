import Link from "next/link";
import { getLatestReport, getReportsForTrend } from "@/lib/reports";
import {
  computeTrend,
  computeLeaderboard,
  computeInsights,
  computeForecast,
  computeUnusedProps,
  computeLeastUsedComponents,
  computeMostUsedNonSparkle,
  computeRecentlyAdded,
} from "@/lib/metrics";
import { TrendChart } from "@/components/charts/TrendChart";
import { SparkleRatioChart } from "@/components/charts/SparkleRatioChart";
import { InsightCards } from "@/components/overview/InsightCards";
import { Leaderboard } from "@/components/overview/Leaderboard";
import { UnusedPropsTable } from "@/components/overview/UnusedPropsTable";
import { LeastUsedTable } from "@/components/overview/LeastUsedTable";
import type { TrendPoint } from "@/lib/types";

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl p-5">
      <p className="text-xs text-gray-300 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-3xl font-semibold ${accent ?? "text-gray-50"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default async function OverviewPage() {
  const report = getLatestReport();
  const allReports = getReportsForTrend(30);
  const previous = allReports.length >= 2 ? allReports[allReports.length - 2] : null;

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <h1 className="text-2xl font-bold text-gray-50 mb-3">No reports found</h1>
        <p className="text-gray-400 mb-6 max-w-md">
          Run a scan to generate your first report:
        </p>
        <pre className="bg-gray-900 border border-gray-800 rounded-lg px-6 py-4 text-sm text-gray-300 font-mono">
          cd sparklytics/scanner{"\n"}
          npm install && npm run build{"\n"}
          node dist/index.js scan --target-dir ../../front --output ../dashboard/reports
        </pre>
      </div>
    );
  }

  const trendData: TrendPoint[] = computeTrend(allReports);
  const insights = computeInsights(report, previous);
  const leaderboard = computeLeaderboard(report);
  const forecast = computeForecast(trendData, "healthScore", 14);
  const unusedProps = computeUnusedProps(report);
  const leastUsed = computeLeastUsedComponents(report);
  const mostUsedNonSparkle = computeMostUsedNonSparkle(report);
  const recentlyAdded = computeRecentlyAdded(allReports);

  const healthColor =
    report.summary.healthScore >= 70
      ? "text-green-400"
      : report.summary.healthScore >= 40
      ? "text-amber-400"
      : "text-rose-400";

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-50">Health Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Last scan:{" "}
          {new Date(report.meta.timestamp).toLocaleString()} ·{" "}
          {report.meta.fileCount} files · v{report.meta.sparkleVersion}
        </p>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Health Score"
          value={`${report.summary.healthScore}/100`}
          accent={healthColor}
          sub={previous ? `${report.summary.healthScore > previous.summary.healthScore ? "▲" : "▼"} from ${previous.summary.healthScore}` : undefined}
        />
        <StatCard
          label="Adoption Rate"
          value={`${(report.summary.adoptionRate * 100).toFixed(1)}%`}
          sub={`${report.summary.totalComponents} components used`}
        />
        <StatCard
          label="Total Usages"
          value={report.summary.totalUsages.toLocaleString()}
          sub={`Across ${report.meta.fileCount} files`}
        />
        <StatCard
          label="Color Compliance"
          value={`${(report.summary.colorComplianceRate * 100).toFixed(0)}%`}
          sub={`${report.summary.nonTokenColors} violations`}
          accent={report.summary.colorComplianceRate >= 0.8 ? "text-green-400" : "text-rose-400"}
        />
      </div>

      {/* Charts + Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend chart */}
        <div className="lg:col-span-2 p-5">
          <h2 className="text-sm font-semibold text-gray-200 mb-4 tracking-wide">
            Trend (last {trendData.length} scans)
          </h2>
          <TrendChart data={trendData} metrics={["healthScore", "adoptionRate"]} />
        </div>

        {/* Insights */}
        <div className="p-5">
          <h2 className="text-sm font-semibold text-gray-200 mb-4 tracking-wide">Top Insights</h2>
          <InsightCards insights={insights} />
        </div>
      </div>

      {/* Sparkle ratio evolution */}
      <div className="p-5">
        <h2 className="text-sm font-semibold text-gray-200 mb-1 tracking-wide">
          Sparkle vs Other Components
        </h2>
        <p className="text-xs text-gray-400 mb-4">Share of Sparkle usages out of all component renders over time</p>
        <SparkleRatioChart data={trendData} />
      </div>

      {/* Component lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Unused props */}
        <div className="p-5">
          <h2 className="text-sm font-semibold text-gray-200 tracking-wide">Unused Component Props</h2>
          <p className="text-xs text-gray-400 mt-0.5 mb-4">List of unused component props sorted by how many times the component is used</p>
          <UnusedPropsTable entries={unusedProps} />
        </div>

        {/* Least used Sparkle components */}
        <div className="p-5">
          <h2 className="text-sm font-semibold text-gray-200 tracking-wide">Least Used Sparkle Components</h2>
          <p className="text-xs text-gray-400 mt-0.5 mb-4">List of Sparkle components that are used infrequently</p>
          <LeastUsedTable entries={leastUsed} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Most used non-Sparkle */}
        <div className="p-5">
          <h2 className="text-sm font-semibold text-gray-200 tracking-wide">Most Used Non-Sparkle Components</h2>
          <p className="text-xs text-gray-400 mt-0.5 mb-4">List of Non-Sparkle components sorted by how many times they're used</p>
          {mostUsedNonSparkle.length === 0 ? (
            <p className="text-xs text-gray-500">No custom components found.</p>
          ) : (() => {
            const max = mostUsedNonSparkle[0].usageCount;
            return (
              <ul className="space-y-1.5">
                {mostUsedNonSparkle.map((c) => (
                  <li key={c.name} className="flex items-center gap-3 text-xs">
                    <Link href={`/components/${encodeURIComponent(c.name)}`} className="font-mono text-blue-400 underline underline-offset-2 decoration-1 hover:opacity-70 transition-opacity shrink-0 w-40 truncate">{c.name}</Link>
                    <div className="relative flex-1 h-5 bg-gray-800 rounded overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 rounded"
                        style={{ width: `${(c.usageCount / max) * 100}%`, background: "#6b8afd" }}
                      />
                      <span className="absolute inset-y-0 right-2 flex items-center text-gray-200 tabular-nums" style={{ fontSize: "10px" }}>
                        {c.usageCount.toLocaleString()}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            );
          })()}
        </div>

        {/* Recently added */}
        <div className="p-5">
          <h2 className="text-sm font-semibold text-gray-200 tracking-wide">Recently Created Components</h2>
          <p className="text-xs text-gray-400 mt-0.5 mb-4">List of components created in the last 30 days</p>
          {recentlyAdded.length === 0 ? (
            <p className="text-xs text-gray-500">No new components detected across scans.</p>
          ) : (
            <ul className="space-y-0">
              {recentlyAdded.map((name) => (
                <li
                  key={name}
                  className="py-1.5 text-xs"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                >
                  <Link href={`/components/${encodeURIComponent(name)}`} className="font-mono underline underline-offset-2 decoration-1 hover:opacity-70 transition-opacity" style={{ color: "#00d992" }}>{name}</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Leaderboard + Compliance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5">
          <h2 className="text-sm font-semibold text-gray-200 mb-4 tracking-wide">
            Top Folders by Sparkle Usage
          </h2>
          <Leaderboard entries={leaderboard} />
        </div>

        <div className="p-5">
          <h2 className="text-sm font-semibold text-gray-200 mb-4 tracking-wide">
            Compliance Summary
          </h2>
          <div className="space-y-4">
            {[
              { label: "Color tokens", rate: report.summary.colorComplianceRate, violations: report.summary.nonTokenColors },
              { label: "Typography scale", rate: report.summary.typographyComplianceRate, violations: report.summary.nonTokenTypographyCount },
              { label: "Spacing scale", rate: report.summary.spacingComplianceRate, violations: report.summary.nonTokenSpacingCount },
            ].map(({ label, rate, violations }) => (
              <div key={label}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-gray-200">{label}</span>
                  <span className="text-gray-400 tabular-nums">
                    {(rate * 100).toFixed(0)}% · {violations} issues
                  </span>
                </div>
                <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${rate * 100}%`,
                      background: rate >= 0.8 ? "#00d992" : rate >= 0.5 ? "#ffbc33" : "#FF6363",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
