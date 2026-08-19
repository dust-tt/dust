import { useFilePreviewContext } from "@app/components/assistant/conversation/FilePreviewContext";
import { Button, CodeBrowser } from "@dust-tt/sparkle";

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
  const { openFilePreview } = useFilePreviewContext();
  const sourceFileName = input.path.split("/").pop() || input.path;

  return (
    <div className="flex flex-col gap-3 py-2 sm:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="heading-base wrap-break-word text-foreground">
          {input.slug}
        </p>
        <p className="max-w-md whitespace-pre-wrap wrap-break-word text-sm leading-5 text-muted-foreground">
          {input.description}
        </p>
      </div>
      <Button
        label="View source"
        variant="outline"
        size="xs"
        icon={CodeBrowser}
        className="shrink-0 self-start"
        onClick={() =>
          openFilePreview({
            filePath: input.path,
            title: sourceFileName,
            contentType: "application/typescript",
          })
        }
      />
    </div>
  );
}
