import React, { useEffect } from "react";
import type { ReactMarkdownProps } from "react-markdown/lib/complex-types";
import { visit } from "unist-util-visit";

import { MarkdownCitation } from "@sparkle/components/message_markdown/MarkdownCitation";

export type CitationsContextType = {
  references: {
    [key: string]: MarkdownCitation;
  };
  updateActiveReferences: (doc: MarkdownCitation, index: number) => void;
  setHoveredReference: (index: number | null) => void;
};

export const CitationsContext = React.createContext<CitationsContextType>({
  references: {},
  updateActiveReferences: () => null,
  setHoveredReference: () => null,
});

function isCiteProps(props: ReactMarkdownProps): props is ReactMarkdownProps & {
  references: string;
} {
  return Object.prototype.hasOwnProperty.call(props, "references");
}

export function CiteBlock(props: ReactMarkdownProps) {
  const { references, updateActiveReferences, setHoveredReference } =
    React.useContext(CitationsContext);
  const refs =
    isCiteProps(props) && props.references
      ? (
          JSON.parse(props.references) as {
            counter: number;
            ref: string;
          }[]
        ).filter((r) => r.ref in references)
      : undefined;

  useEffect(() => {
    if (refs) {
      refs.forEach((r) => {
        const document = references[r.ref];
        updateActiveReferences(document, r.counter);
      });
    }
  }, [refs, references, updateActiveReferences]);

  if (refs) {
    return (
      <span className="s-inline-flex s-space-x-1">
        {refs.map((r, i) => {
          const document = references[r.ref];
          const link = document.href;

          return (
            <sup key={`${r.ref}-${i}`}>
              <a
                href={link ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                onMouseEnter={() => setHoveredReference(r.counter)}
              >
                <div className="s-hover:border-violet-400 s-flex s-h-4 s-w-4 s-items-center s-justify-center s-rounded-full s-border s-border-violet-200 s-bg-violet-100 s-text-xs s-font-semibold s-text-element-800">
                  {r.counter}
                </div>
              </a>
            </sup>
          );
        })}
      </span>
    );
  } else {
    const { children } = props;
    return <sup>{children}</sup>;
  }
}

export function citeDirective() {
  // Initialize a counter to keep track of citation references, starting from 1.
  let refCounter = 1;
  const refSeen: { [ref: string]: number } = {};

  const counter = (ref: string) => {
    if (!refSeen[ref]) {
      refSeen[ref] = refCounter++;
    }
    return refSeen[ref];
  };

  return () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (tree: any) => {
      visit(tree, ["textDirective"], (node) => {
        if (node.name === "cite" && node.children[0]?.value) {
          const data = node.data || (node.data = {});

          const references = node.children[0]?.value
            .split(",")
            .map((s: string) => s.trim())
            .filter((s: string) => s.length == 2)
            .map((ref: string) => ({
              counter: counter(ref),
              ref,
            }));

          // `sup` will then be mapped to a custom component `CiteBlock`.
          data.hName = "sup";
          data.hProperties = {
            references: JSON.stringify(references),
          };
        }
      });
    };
  };
}
