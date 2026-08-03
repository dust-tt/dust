import { GovernancePageLayout } from "@app/components/pages/workspace/governance/GovernancePageLayout";
import { cn, LoadingBlock } from "@dust-tt/sparkle";

function SkeletonRow() {
  return (
    <div className="flex w-full items-center justify-between gap-4 p-4">
      <div className="flex flex-col gap-2">
        <LoadingBlock className="h-5 w-44" />
        <LoadingBlock className="h-4 w-80" />
      </div>
      <LoadingBlock className="h-8 w-52 rounded-lg" />
    </div>
  );
}

interface SkeletonSectionProps {
  labelWidth: string;
  rows: number;
}

function SkeletonSection({ labelWidth, rows }: SkeletonSectionProps) {
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center gap-2">
        <LoadingBlock className="h-5 w-5 rounded-md" />
        <LoadingBlock className={cn("h-6", labelWidth)} />
      </div>
      <div className="w-full divide-y divide-border rounded-xl border border-border">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  );
}

export function GovernancePageSkeleton() {
  return (
    <GovernancePageLayout>
      <div className="flex items-center justify-between">
        <div className="flex flex-1 flex-col gap-2">
          <LoadingBlock className="h-6 w-40" />
          <LoadingBlock className="h-5 w-56" />
        </div>
        <LoadingBlock className="h-9 w-20 rounded-lg" />
      </div>
      <div className="w-full rounded-xl bg-muted-background px-4 py-3">
        <LoadingBlock className="h-4 w-96" />
      </div>
      <div className="flex w-full flex-col gap-8">
        <SkeletonSection labelWidth="w-20" rows={2} />
        <SkeletonSection labelWidth="w-16" rows={2} />
        <SkeletonSection labelWidth="w-32" rows={2} />
        <SkeletonSection labelWidth="w-44" rows={2} />
      </div>
    </GovernancePageLayout>
  );
}
