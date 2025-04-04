import { Page } from "@dust-tt/sparkle";

export function ToolsList({
  tools,
}: {
  tools: { name: string; description: string }[];
}) {
  return (
    <div className="mb-2 flex w-full flex-col gap-y-2 pt-2">
      <Page.SectionHeader title="Available Tools" />
      <div className="space-y-4 rounded-md border p-4">
        {tools && tools.length > 0 ? (
          tools.map(
            (tool: { name: string; description: string }, index: number) => (
              <div
                key={index}
                className="border-b pb-4 last:border-b-0 last:pb-0"
              >
                <h4 className="text-sm font-medium">{tool.name}</h4>
                {tool.description && (
                  <p className="mt-1 text-xs text-gray-500">
                    {tool.description}
                  </p>
                )}
              </div>
            )
          )
        ) : (
          <p className="text-sm text-gray-500">No tools available</p>
        )}
      </div>
    </div>
  );
}
