import { H2 } from "@app/components/home/ContentComponents";
import { cn } from "@dust-tt/sparkle";

interface ComparisonTableRow {
  name: string;
  dust: string;
  ms: string;
  google: string;
  claude: string;
  perplexity: string;
}

interface ChatGptEnterpriseComparisonTableProps {
  title: string;
  rows: ComparisonTableRow[];
}

export function ChatGptEnterpriseComparisonTable({
  title,
  rows,
}: ChatGptEnterpriseComparisonTableProps) {
  return (
    <section className="w-full">
      <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen border-y border-gray-100 bg-gray-50/50 py-12 md:py-6">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 text-center">
            <H2 className="text-center">{title}</H2>
          </div>

          <div className="overflow-x-auto pb-4">
            <div className="min-w-[1000px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
              {/* Header */}
              <div className="grid grid-cols-6 border-b border-gray-200 bg-gray-50 p-4 text-sm font-semibold">
                <div className="text-xs uppercase tracking-wider text-gray-500">
                  Alternative
                </div>
                <div className="flex items-center justify-center gap-1 text-center text-xs font-bold uppercase tracking-wider text-[#1C91FF]">
                  Dust{" "}
                  <span className="rounded bg-[#1C91FF]/10 px-1.5 py-0.5 text-[10px] text-[#1C91FF]">
                    #1 Pick
                  </span>
                </div>
                <div className="text-center text-xs uppercase tracking-wider text-gray-700">
                  Microsoft 365 Copilot
                </div>
                <div className="text-center text-xs uppercase tracking-wider text-gray-700">
                  Google Gemini 3
                </div>
                <div className="text-center text-xs uppercase tracking-wider text-gray-700">
                  Claude Enterprise
                </div>
                <div className="text-center text-xs uppercase tracking-wider text-gray-700">
                  Perplexity Enterprise
                </div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-gray-100">
                {rows.map((row, i) => (
                  <div
                    key={row.name}
                    className={cn(
                      "grid grid-cols-6 items-center p-4 text-sm transition-colors hover:bg-gray-50",
                      i % 2 === 0 ? "bg-white" : "bg-gray-50/30"
                    )}
                  >
                    <div className="pr-4 font-semibold text-gray-800">
                      {row.name}
                    </div>
                    <div className="-mx-2 -my-4 flex h-full items-center justify-center border-x border-[#1C91FF]/10 bg-[#1C91FF]/5 px-2 py-6 text-center font-bold text-gray-900">
                      {row.dust}
                    </div>
                    <div className="px-2 text-center text-gray-600">
                      {row.ms}
                    </div>
                    <div className="px-2 text-center text-gray-600">
                      {row.google}
                    </div>
                    <div className="px-2 text-center text-gray-600">
                      {row.claude}
                    </div>
                    <div className="px-2 text-center text-gray-600">
                      {row.perplexity}
                    </div>
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
