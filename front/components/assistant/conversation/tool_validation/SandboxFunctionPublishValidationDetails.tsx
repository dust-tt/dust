interface SandboxFunctionPublishValidationDetailsProps {
  input: {
    slug: string;
    description: string;
    path: string;
  };
}

export function SandboxFunctionPublishValidationDetails({
  input,
}: SandboxFunctionPublishValidationDetailsProps) {
  return (
    <div className="flex flex-col gap-3 pt-2">
      <p className="text-sm text-muted-foreground">
        Do you want to publish this function to this Pod?
      </p>

      <dl className="divide-y divide-separator overflow-hidden rounded-xl border border-separator bg-background">
        <div className="flex flex-col gap-1 px-3 py-2.5">
          <dt className="text-xs font-medium text-muted-foreground">
            Function
          </dt>
          <dd className="wrap-break-word text-sm font-medium text-foreground">
            {input.slug}
          </dd>
        </div>
        <div className="flex flex-col gap-1 px-3 py-2.5">
          <dt className="text-xs font-medium text-muted-foreground">
            Description
          </dt>
          <dd className="whitespace-pre-wrap wrap-break-word text-sm text-foreground">
            {input.description}
          </dd>
        </div>
        <div className="flex flex-col gap-1 px-3 py-2.5">
          <dt className="text-xs font-medium text-muted-foreground">
            Source file
          </dt>
          <dd className="break-all font-mono text-xs text-foreground">
            {input.path}
          </dd>
        </div>
      </dl>
    </div>
  );
}
