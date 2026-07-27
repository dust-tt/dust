import { Icon, Terminal } from "@dust-tt/sparkle";

interface SandboxFunctionPublishValidationDetailsProps {
  input: {
    slug: string;
    description: string;
  };
}

export function SandboxFunctionPublishValidationDetails({
  input,
}: SandboxFunctionPublishValidationDetailsProps) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background text-muted-foreground">
        <Icon visual={Terminal} size="sm" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="wrap-break-word text-sm font-medium leading-5 text-foreground">
          {input.slug}
        </p>
        <p className="whitespace-pre-wrap wrap-break-word text-sm leading-5 text-muted-foreground">
          {input.description}
        </p>
      </div>
    </div>
  );
}
