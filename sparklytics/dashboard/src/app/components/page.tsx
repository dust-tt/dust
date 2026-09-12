import { getLatestReport } from "@/lib/reports";
import { AllComponentsList } from "@/components/components-page/AllComponentsList";

export default async function ComponentsPage() {
  const report = getLatestReport();

  if (!report) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-500">No reports found. Run a scan first.</p>
      </div>
    );
  }

  const sparkle = report.components;
  const custom = report.allElements?.customComponents ?? [];
  const totalAll = sparkle.length + custom.length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-50">Components</h1>
        <p className="text-sm text-gray-500 mt-1">
          {sparkle.length} Sparkle · {custom.length} external/local · {totalAll} total
        </p>
      </div>

      <AllComponentsList
        sparkleComponents={sparkle}
        customComponents={custom}
      />
    </div>
  );
}
