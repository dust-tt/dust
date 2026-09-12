import Link from "next/link";
import { notFound } from "next/navigation";
import { getLatestReport } from "@/lib/reports";
import { computeFolderDetail } from "@/lib/metrics";

interface PageProps {
  params: { path: string[] };
}

export default async function FolderDetailPage({ params }: PageProps) {
  const report = getLatestReport();
  if (!report) notFound();

  const folder = params.path.join("/");
  const detail = computeFolderDetail(report, folder);
  if (!detail) notFound();

  const maxUsage = detail.components[0]?.usageInFolder ?? 1;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/folders" className="text-gray-400 hover:text-gray-200 text-sm underline underline-offset-2 decoration-1 transition-colors">
          ← Folders
        </Link>
        <span className="text-gray-600">/</span>
        <h1 className="text-xl font-semibold text-gray-50 font-mono">{folder}</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Sparkle Usages", value: detail.sparkleUsages.toLocaleString() },
          { label: "Custom Usages", value: detail.customUsages.toLocaleString() },
          { label: "Components", value: detail.components.length },
          { label: "Files", value: detail.fileCount },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl p-4">
            <p className="text-xs text-gray-300 uppercase tracking-widest mb-1">{label}</p>
            <p className="text-2xl font-semibold text-gray-50">{value}</p>
          </div>
        ))}
      </div>

      {/* Components */}
      <div className="p-5">
        <h2 className="text-sm font-semibold text-gray-200 mb-4 tracking-wide">Components</h2>
        <ul className="space-y-1.5">
          {detail.components.map((c) => (
            <li key={c.name} className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5 shrink-0 w-56">
                <Link
                  href={`/components/${encodeURIComponent(c.name)}`}
                  className="font-mono underline underline-offset-2 decoration-1 hover:opacity-70 transition-opacity truncate"
                  style={{ color: c.isSparkle ? "#00d992" : "#60a5fa" }}
                >
                  {c.name}
                </Link>
              </div>
              <div className="relative flex-1 h-5 bg-gray-800 rounded overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded"
                  style={{
                    width: `${(c.usageInFolder / maxUsage) * 100}%`,
                    background: c.isSparkle ? "#00d992" : "#6b8afd",
                  }}
                />
                <span
                  className="absolute inset-y-0 right-2 flex items-center text-gray-200 tabular-nums"
                  style={{ fontSize: "10px" }}
                >
                  {c.usageInFolder}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Files */}
      <div className="p-5">
        <h2 className="text-sm font-semibold text-gray-200 mb-4 tracking-wide">
          Files ({detail.fileCount})
        </h2>
        <ul className="space-y-1">
          {detail.files.map((file) => (
            <li
              key={file}
              className="py-1.5 text-xs font-mono text-gray-400"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
            >
              {file}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
