import { cn, LoadingBlock, Page, Toggle01Left } from "@dust-tt/sparkle";

const SkeletonRow = () => (
  <div className="flex w-full items-center justify-between gap-4 p-4">
    <div className="flex flex-col gap-2">
      <LoadingBlock className="h-5 w-44" />
      <LoadingBlock className="h-4 w-80" />
    </div>
    <LoadingBlock className="h-8 w-52 rounded-lg" />
  </div>
);

const SkeletonSection = ({
  labelWidth,
  rows,
}: {
  labelWidth: string;
  rows: number;
}) => (
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

export const GovernancePageSkeleton = () => {
  return (
    <Page>
      <Page.Header
        title="Workspace & Governance"
        description="Manage what members can do in your workspace."
        icon={Toggle01Left}
      />
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
    </Page>
  );
};
