import React, { useEffect } from "react";
import type { ReactMarkdownProps } from "react-markdown/lib/complex-types";
import { visit } from "unist-util-visit";

import type { MCPReferenceCitation } from "./MCPReferenceCitation";

export type CitationsContextType = {
  references: {
    [key: string]: MCPReferenceCitation;
  };
  updateActiveReferences: (doc: MCPReferenceCitation, index: number) => void;
};

export const CitationsContext = React.createContext<CitationsContextType>({
  references: {},
  updateActiveReferences: () => null,
});

function isCiteProps(props: ReactMarkdownProps): props is ReactMarkdownProps & {
  references: string;
} {
  return Object.prototype.hasOwnProperty.call(props, "references");
}

export function CiteBlock(props: ReactMarkdownProps) {
  const { references, updateActiveReferences } =
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
      <span className="inline-flex space-x-1">
        {refs.map((r, i) => {
          const document = references[r.ref];
          const link = document.href;

          return (
            <div key={`${r.ref}-${i}`}>
              <a
                href={link ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="group flex flex-row items-center justify-center space-x-1 rounded-lg bg-muted-background p-1 text-xs font-medium text-muted-foreground dark:bg-muted-background-night dark:text-muted-foreground-night">
                  <span className="grayscale-[100%] transition-all duration-150 ease-in-out group-hover:grayscale-0">
                    {document.icon}
                  </span>
                  <span>{r.counter}</span>
                </div>
              </a>
            </div>
          );
        })}
      </span>
    );
  } else {
    const { children } = props;
    return <sup>{children}</sup>;
  }
}

export function getCiteDirective() {
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
    return (tree: any) => {
      visit(tree, ["textDirective"], (node) => {
        if (node.name === "cite" && node.children[0]?.value) {
          const data = node.data || (node.data = {});

          const references = node.children[0]?.value
            .split(",")
            .map((s: string) => s.trim())
            // Citations used to be 2 characters long, but are now 3 characters long.
            // We support both for backward compatibility.
            .filter((s: string) => s.length === 2 || s.length === 3)
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
