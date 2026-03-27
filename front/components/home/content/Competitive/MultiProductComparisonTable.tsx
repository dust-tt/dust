import { H2 } from "@app/components/home/ContentComponents";
import { cn } from "@dust-tt/sparkle";

export interface MultiProductComparisonColumn {
  key: string;
  label: string;
  highlight?: boolean;
}

interface MultiProductComparisonTableProps {
  title: string;
  columns: MultiProductComparisonColumn[];
  rows: Record<string, string>[];
}

export function MultiProductComparisonTable({
  title,
  columns,
  rows,
}: MultiProductComparisonTableProps) {
  const gridTemplate = `1fr ${columns.map(() => "1fr").join(" ")}`;
  const minWidth = (columns.length + 1) * 160;

  return (
    <section className="w-full">
      <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen border-y border-gray-100 bg-gray-50/50 py-12 md:py-6">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 text-center">
            <H2 className="text-center">{title}</H2>
          </div>

          <div className="overflow-x-auto pb-4">
            <div
              className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl"
              style={{ minWidth }}
            >
              {/* Header */}
              <div
                className="grid border-b border-gray-200 bg-gray-50 p-4 text-sm font-semibold"
                style={{ gridTemplateColumns: gridTemplate }}
              >
                <div className="text-xs uppercase tracking-wider text-gray-500">
                  Alternative
                </div>
                {columns.map((col) => (
                  <div
                    key={col.key}
                    className={cn(
                      "flex items-center justify-center gap-1 text-center text-xs uppercase tracking-wider",
                      col.highlight
                        ? "font-bold text-[#1C91FF]"
                        : "font-normal text-gray-700"
                    )}
                  >
                    {col.label}
                    {col.highlight && (
                      <span className="rounded bg-[#1C91FF]/10 px-1.5 py-0.5 text-[10px] text-[#1C91FF]">
                        #1 Pick
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Rows */}
              <div className="divide-y divide-gray-100">
                {rows.map((row, i) => (
                  <div
                    key={row.name}
                    className={cn(
                      "grid items-center p-4 text-sm transition-colors hover:bg-gray-50",
                      i % 2 === 0 ? "bg-white" : "bg-gray-50/30"
                    )}
                    style={{ gridTemplateColumns: gridTemplate }}
                  >
                    <div className="pr-4 font-semibold text-gray-800">
                      {row.name}
                    </div>
                    {columns.map((col) => (
                      <div
                        key={col.key}
                        className={cn(
                          "px-2 text-center",
                          col.highlight
                            ? "-mx-2 -my-4 flex h-full items-center justify-center border-x border-[#1C91FF]/10 bg-[#1C91FF]/5 px-2 py-6 font-bold text-gray-900"
                            : "text-gray-600"
                        )}
                      >
                        {row[col.key]}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
