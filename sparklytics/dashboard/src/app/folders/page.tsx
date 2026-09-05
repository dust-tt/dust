import Link from "next/link";
import { notFound } from "next/navigation";
import { getLatestReport } from "@/lib/reports";
import { computeFolderList } from "@/lib/metrics";

export default async function FoldersPage() {
  const report = getLatestReport();
  if (!report) notFound();

  const folders = computeFolderList(report);
  const max = folders[0]?.sparkleUsages ?? 1;

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-50">Folders</h1>
        <p className="text-sm text-gray-500 mt-1">
          {folders.length} folders · sorted by Sparkle usage
        </p>
      </div>

      <div className="p-5">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <th className="text-left pb-2 text-xs text-gray-300 uppercase tracking-widest w-64">Folder</th>
              <th className="text-left pb-2 text-xs text-gray-300 uppercase tracking-widest pl-4">Sparkle usage</th>
              <th className="text-right pb-2 text-xs text-gray-300 uppercase tracking-widest">Custom</th>
              <th className="text-right pb-2 text-xs text-gray-300 uppercase tracking-widest">Files</th>
            </tr>
          </thead>
          <tbody>
            {folders.map((f) => (
              <tr
                key={f.folder}
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
              >
                <td className="py-2 pr-4 w-64">
                  <Link
                    href={`/folders/${f.folder.split("/").map(encodeURIComponent).join("/")}`}
                    className="font-mono text-blue-400 underline underline-offset-2 decoration-1 hover:opacity-70 transition-opacity text-xs"
                  >
                    {f.folder}
                  </Link>
                </td>
                <td className="py-2 pl-4 w-full">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1 h-5 bg-gray-800 rounded overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 rounded"
                        style={{
                          width: `${(f.sparkleUsages / max) * 100}%`,
                          background: "#00d992",
                        }}
                      />
                      <span
                        className="absolute inset-y-0 right-2 flex items-center text-gray-200 tabular-nums"
                        style={{ fontSize: "10px" }}
                      >
                        {f.sparkleUsages.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="py-2 text-right text-gray-500 tabular-nums">
                  {f.customUsages > 0 ? f.customUsages.toLocaleString() : "—"}
                </td>
                <td className="py-2 text-right text-gray-500 tabular-nums">{f.fileCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
