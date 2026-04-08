import { notFound } from "next/navigation";
import { getLatestReport } from "@/lib/reports";
import Link from "next/link";

interface PageProps {
  params: { name: string };
}

export default async function ComponentDetailPage({ params }: PageProps) {
  const report = getLatestReport();
  if (!report) notFound();

  const name = decodeURIComponent(params.name);
  const component =
    report.components.find((c) => c.name === name) ??
    report.allElements?.customComponents?.find((c) => c.name === name);
  if (!component) notFound();

  const fileCount = new Set(component.locations.map((l) => l.filePath)).size;
  const topFiles = [...new Set(component.locations.map((l) => l.filePath))].slice(0, 20);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/components" className="text-gray-400 hover:text-gray-200 text-sm underline underline-offset-2 decoration-1 transition-colors">
          ← Components
        </Link>
        <span className="text-gray-600">/</span>
        <h1 className="text-2xl font-semibold text-gray-50 font-mono">{component.name}</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Usages", value: component.usageCount.toLocaleString() },
          { label: "Files", value: fileCount },
          {
            label: "Default Usage",
            value: `${component.usageCount > 0 ? Math.round((component.defaultUsageCount / component.usageCount) * 100) : 0}%`,
          },
          { label: "Unique Props", value: component.props.length },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl p-4">
            <p className="text-xs text-gray-300 uppercase tracking-widest mb-1">{label}</p>
            <p className="text-2xl font-semibold text-gray-50">{value}</p>
          </div>
        ))}
      </div>

      {/* Props table */}
      {component.props.length > 0 && (
        <div className="p-5">
          <h2 className="text-sm font-semibold text-gray-200 mb-4 tracking-wide">Props Breakdown</h2>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <th className="text-left pb-2 text-xs text-gray-300 uppercase tracking-widest">Prop</th>
                <th className="text-right pb-2 text-xs text-gray-300 uppercase tracking-widest">Count</th>
                <th className="text-left pb-2 text-xs text-gray-300 uppercase tracking-widest pl-6">Top Values</th>
              </tr>
            </thead>
            <tbody>
              {component.props
                .sort((a, b) => b.totalCount - a.totalCount)
                .map((prop) => {
                  const isUnused = prop.totalCount === 0;
                  const topValues = Object.entries(prop.frequency)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 3);
                  return (
                    <tr
                      key={prop.name}
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", opacity: isUnused ? 0.5 : 1 }}
                    >
                      <td className="py-2 font-mono flex items-center gap-2">
                        <span className={isUnused ? "text-gray-400" : "text-blue-400"}>{prop.name}</span>
                        {isUnused && (
                          <span
                            className="text-xs px-1.5 py-0.5 rounded font-sans font-medium text-orange-300"
                            style={{ background: "rgba(251,146,60,0.1)", border: "1px solid rgba(251,146,60,0.2)" }}
                          >
                            unused
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right text-gray-300 tabular-nums">{prop.totalCount}</td>
                      <td className="py-2 pl-6">
                        <div className="flex gap-2 flex-wrap">
                          {topValues.map(([val, count]) => (
                            <span
                              key={val}
                              className="text-xs rounded px-2 py-0.5 font-mono text-gray-200"
                              style={{ background: "#1b1c1e", border: "1px solid rgba(255,255,255,0.06)" }}
                            >
                              {val}{" "}
                              <span className="text-gray-400">×{count}</span>
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {/* File locations */}
      <div className="p-5">
        <h2 className="text-sm font-semibold text-gray-200 mb-4 tracking-wide">
          Used in {fileCount} files
        </h2>
        <ul className="space-y-1">
          {topFiles.map((file) => {
            const count = component.locations.filter((l) => l.filePath === file).length;
            return (
              <li
                key={file}
                className="flex items-center justify-between py-1.5 last:border-0"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
              >
                <span className="text-xs font-mono text-gray-300">{file}</span>
                <span className="text-xs text-gray-400 ml-2 tabular-nums">{count}×</span>
              </li>
            );
          })}
          {fileCount > 20 && (
            <li className="text-xs text-gray-400 pt-1">
              +{fileCount - 20} more files…
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
