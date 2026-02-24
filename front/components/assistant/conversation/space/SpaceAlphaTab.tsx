import { LinkWrapper } from "@dust-tt/sparkle";

export const SpaceAlphaTab = () => {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto px-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 py-8">
        <p>
          This feature is currently in alpha, and only available to a select
          group of customers. We are very interested in your feedback to improve
          the feature.
        </p>
        <p>
          Share them to{" "}
          <LinkWrapper
            href="mailto:project-feedback@dust.tt"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:text-blue-600"
          >
            project-feedback@dust.tt
          </LinkWrapper>
          .{" "}
        </p>
      </div>
    </div>
  );
};
