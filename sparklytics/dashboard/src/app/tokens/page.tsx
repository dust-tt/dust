import { getLatestReport, getReportsForTrend } from "@/lib/reports";
import { computeTrend } from "@/lib/metrics";
import { TrendChart } from "@/components/charts/TrendChart";
import type { TokenViolation } from "@/lib/types";

function ViolationTable({
  violations,
  limit = 30,
}: {
  violations: TokenViolation[];
  limit?: number;
}) {
  const shown = violations.slice(0, limit);
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ border: "1px solid #3d3a39" }}
    >
      <table className="w-full text-xs">
        <thead>
          <tr style={{ background: "#1b1c1e", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <th className="text-left px-3 py-2 text-gray-300 font-medium uppercase tracking-widest">File</th>
            <th className="text-left px-3 py-2 text-gray-300 font-medium uppercase tracking-widest">Property</th>
            <th className="text-left px-3 py-2 text-gray-300 font-medium uppercase tracking-widest">Value</th>
            <th className="text-right px-3 py-2 text-gray-300 font-medium uppercase tracking-widest">Line</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((v, i) => (
            <tr
              key={i}
              style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
              className="hover:bg-gray-800/40 transition-colors"
            >
              <td className="px-3 py-2 font-mono text-gray-300 truncate max-w-xs">{v.filePath}</td>
              <td className="px-3 py-2 text-gray-400">{v.property}</td>
              <td className="px-3 py-2 font-mono text-rose-400">{v.value}</td>
              <td className="px-3 py-2 text-right text-gray-400 tabular-nums">{v.line}</td>
            </tr>
          ))}
          {violations.length > limit && (
            <tr>
              <td colSpan={4} className="px-3 py-2 text-center text-gray-400">
                +{violations.length - limit} more violations
              </td>
            </tr>
          )}
          {violations.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-8 text-center text-gray-400">
                No violations detected.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ComplianceBadge({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  const color =
    pct >= 80 ? "text-green-400" : pct >= 50 ? "text-amber-400" : "text-rose-400";
  return <span className={`text-2xl font-semibold ${color}`}>{pct}%</span>;
}

export default async function TokensPage() {
  const report = getLatestReport();
  const allReports = getReportsForTrend(30);

  if (!report) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-400">No reports found. Run a scan first.</p>
      </div>
    );
  }

  const trendData = computeTrend(allReports);

  const tabs = [
    {
      id: "colors",
      label: "Colors",
      rate: report.summary.colorComplianceRate,
      total: report.colors.totalUsages,
      violations: report.colors.nonTokenColors.length,
      data: report.colors.nonTokenColors,
    },
    {
      id: "typography",
      label: "Typography",
      rate: report.summary.typographyComplianceRate,
      total: report.typography.totalUsages,
      violations: report.summary.nonTokenTypographyCount,
      data: report.typography.nonTokenTypography,
    },
    {
      id: "spacing",
      label: "Spacing",
      rate: report.summary.spacingComplianceRate,
      total: report.spacing.totalUsages,
      violations: report.summary.nonTokenSpacingCount,
      data: report.spacing.nonTokenSpacing,
    },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-50">Tokens</h1>
        <p className="text-sm text-gray-500 mt-1">
          Token compliance across colors, typography, and spacing
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {tabs.map((tab) => (
          <div key={tab.id} className="rounded-xl p-5">
            <p className="text-xs text-gray-300 uppercase tracking-widest mb-2">{tab.label}</p>
            <ComplianceBadge rate={tab.rate} />
            <p className="text-xs text-gray-400 mt-1 tabular-nums">
              {tab.violations} violations / {tab.total} usages
            </p>
            <div className="mt-3 h-1 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${tab.rate * 100}%`,
                  background: tab.rate >= 0.8 ? "#00d992" : tab.rate >= 0.5 ? "#ffbc33" : "#FF6363",
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Compliance trend */}
      <div className="p-5">
        <h2 className="text-sm font-semibold text-gray-200 mb-4 tracking-wide">Compliance Trend</h2>
        <TrendChart data={trendData} metrics={["colorComplianceRate"]} />
      </div>

      {/* Violation tables */}
      {tabs.map((tab) => (
        <div key={tab.id} className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-200 tracking-wide">
              {tab.label} Violations
            </h2>
            <span className="text-xs text-gray-400 tabular-nums">
              {tab.violations} issues
            </span>
          </div>
          <ViolationTable violations={tab.data} />
        </div>
      ))}
    </div>
  );
}
