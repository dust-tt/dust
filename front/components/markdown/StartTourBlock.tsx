/**
 * Markdown directive plugin for starting the welcome tour guide.
 *
 * This module provides a remark-directive plugin for parsing and rendering
 * start tour directives in markdown content, enabling the :startTour[label] syntax.
 *
 * When the onboarding agent wants to offer the user a button to start the tour,
 * it can include :startTour[Take a quick tour] in its message.
 */

import { Button } from "@dust-tt/sparkle";
import { visit } from "unist-util-visit";

import { useWelcomeTourGuide } from "@app/components/assistant/WelcomeTourGuideProvider";

/**
 * Remark directive plugin for parsing startTour directives.
 *
 * Transforms `:startTour[label]` into a custom HTML element
 * that can be rendered by the StartTourButton component.
 */
export function startTourDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
      if (node.name === "startTour") {
        const data = node.data || (node.data = {});
        data.hName = "startTour";
        data.hProperties = {
          label: node.children[0]?.value || "Take the tour",
        };
      }
    });
  };
}

/**
 * React component for rendering the start tour button in markdown.
 */
function StartTourButton({ label }: { label: string }) {
  const { startTour } = useWelcomeTourGuide();

  return (
    <span className="inline-block">
      <Button variant="highlight" label={label} size="sm" onClick={startTour} />
    </span>
  );
}

/**
 * Creates a React component plugin for rendering the start tour button in markdown.
 *
 * @returns A React component for rendering the start tour button
 */
export function getStartTourPlugin() {
  return StartTourButton;
}
