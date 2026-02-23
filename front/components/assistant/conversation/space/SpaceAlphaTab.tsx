import { LinkWrapper } from "@dust-tt/sparkle";

export const SpaceAlphaTab = () => {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto px-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 py-8">
        <p>
          This feature is currently in alpha, and only available in the Dust
          workspace ("projects" feature flag). The goal is to get feedback from
          internal usage and quickly iterate.
        </p>
        <p>
          Share your feedback in the{" "}
          <LinkWrapper
            href="https://dust4ai.slack.com/archives/C09T7N4S6GG"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:text-blue-600"
          >
            initiative slack channel
          </LinkWrapper>
          .{" "}
        </p>
      </div>
    </div>
  );
};
