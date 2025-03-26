/** DOM text parsing */

export const extractPage = (url: string) => {
  const defaultExtractor = () => {
    const textDOMfFromPage = () => {
      type TextDOM = {
        nodeType: "text" | "clickable" | "input" | "image" | null;
        tagName: string | null;
        element: Element;
        text: string | null;
        value: string | null;
        children: TextDOM[];
      };

      const textDOMFromPage = () => {
        const CLICKABLE_INPUTS = [
          "button",
          "checkbox",
          // "color",
          // "file",
          // "image",
          "radio",
          "reset",
          "submit",
        ];

        const FILLABLE_INPUTS = [
          "date",
          "datetime-local",
          "email",
          "month",
          "number",
          "password",
          "range",
          "search",
          "tel",
          "text",
          "time",
          "url",
          "week",
          "",
        ];

        const traverseDOM = (
          element: Element,
          tree: TextDOM,
          depth: number = 0
        ) => {
          const skipTags = ["SCRIPT", "STYLE"];
          if (skipTags.includes(element.tagName)) {
            return;
          }

          // Process all child nodes in order
          for (const node of Array.from(element.childNodes)) {
            if (skipTags.includes(node.nodeName)) {
              continue;
            }

            let child: TextDOM | null = null;

            if (node.nodeType === 3) {
              // [t]
              const text = node.textContent?.trim();
              if (text?.length) {
                child = {
                  nodeType: "text",
                  element: node.parentElement!,
                  tagName: null,
                  text,
                  value: null,
                  children: [],
                };
                tree.children.push(child);
              }
            } else if (node.nodeType === 1) {
              // [v] | [c] | [i] | null
              const el = node as Element;

              if (el.tagName === "IMG") {
                // [v]
                const text = el.getAttribute("alt") || null;
                child = {
                  nodeType: "image",
                  tagName: el.tagName,
                  element: el,
                  text,
                  value: null,
                  children: [],
                };
              } else if (
                // [c]
                el.tagName === "A" ||
                el.tagName === "BUTTON" ||
                el.getAttribute("role") === "button" ||
                // el.getAttribute("tabindex") ||
                el.getAttribute("onclick") ||
                (el as HTMLElement).onclick ||
                (el.tagName === "INPUT" &&
                  CLICKABLE_INPUTS.includes(el.getAttribute("type") || ""))
              ) {
                const ariaLabel = el.getAttribute("aria-label");
                child = {
                  nodeType: "clickable",
                  tagName: el.tagName,
                  element: el,
                  text: ariaLabel, // Use aria-label as text if available
                  value: null,
                  children: [],
                };
              } else if (
                // [i]
                el.tagName === "TEXTAREA" ||
                el.getAttribute("contenteditable") === "true" ||
                (el.tagName === "INPUT" &&
                  FILLABLE_INPUTS.includes(el.getAttribute("type") || ""))
              ) {
                const placeholder =
                  el.getAttribute("placeholder") ||
                  el.getAttribute("aria-label") ||
                  el.getAttribute("data-placeholder") ||
                  null;
                // console.log("PLACEHOLDER", placeholder);
                // console.log(el);
                const value = (el as HTMLInputElement).value || null;
                child = {
                  nodeType: "input",
                  tagName: el.tagName,
                  element: el,
                  text: placeholder, // Use placeholder as text if available
                  value,
                  children: [],
                };
                // TODO(spolu): handle select
              } else {
                const placeholder =
                  el.getAttribute("placeholder") ||
                  el.getAttribute("aria-label") ||
                  el.getAttribute("data-placeholder") ||
                  null;
                // null
                child = {
                  nodeType: placeholder ? "text" : null,
                  tagName: el.tagName,
                  element: el,
                  text: placeholder,
                  value: null,
                  children: [],
                };
              }

              // Add child to tree.
              tree.children.push(child);

              // Recursively traverse children element/tree: el/child.
              traverseDOM(el, child, depth + 1);
            }
          }
        };

        const body: TextDOM = {
          nodeType: null,
          element: document.body,
          tagName: null,
          text: null,
          value: null,
          children: [],
        };

        traverseDOM(document.body, body, 0);

        return body;
      };

      const renderTree = (node: TextDOM | null, indent: string) => {
        if (!node) {
          return { render: "" };
        }

        const lines: string[] = [];

        if (node.nodeType !== null) {
          let out = "";
          switch (node.nodeType) {
            case "text":
              out = `[t]${node.text ? ` ${node.text}` : ""}`;
              break;
            case "clickable":
              out = `[c]${node.text ? ` ${node.text}` : ""}`;
              break;
            case "input":
              out = `[i]${node.text ? ` ${node.text}` : ""}`;
              if (node.value) {
                out += ` {value: "${node.value}"}`;
              }
              break;
            case "image":
              out = `[v]${node.text ? ` ${node.text}` : ""}`;
              break;
          }
          if (out) {
            lines.push(`${indent}${out}`);
          }
        }

        const hasNonNullChild = node.children.some(
          (child) => child.nodeType !== null
        );
        const childIndent = hasNonNullChild ? indent + "  " : indent;

        node.children.forEach((child) => {
          const { render: childRender } = renderTree(child, childIndent);
          if (childRender) {
            lines.push(childRender);
          }
        });

        return { render: lines.join("\n") };
      };

      const tree = textDOMFromPage();
      const { render } = renderTree(tree, "");
      const header = `\
// The following  "text DOM" page representation is computed by striping everything but textual [t],
// clickable [c], input [i], and image [v] elements. The origin DOM structure is preserved through
// the indentation of these elements in the text DOM representation.
//
// URL: ${window.location.href}`;

      const extract = `${header}\n${render}`;
      // console.log("----------------------------");
      // console.log(extract);
      return extract;
    };

    //return document.documentElement.innerText;
    return textDOMfFromPage();
  };

  const gdocsExtractor = () => {
    // What an incredible hack. Docs always have script tags with malformed JS that contain
    // `DOCS_modelChunk`s, which can be parsed to reconstruct the entire plain-text doc.
    const contents = Array.from(document.scripts)
      .map((s) => {
        try {
          if (s.innerHTML.toString().startsWith("DOCS_modelChunk =")) {
            return s.innerHTML;
          }
          return null;
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const content = contents
      .map((c) => {
        try {
          const arr = JSON.parse(
            (c || "").split("=", 2)[1].trim().split("},{")[0] + "}]"
          );
          return arr[0].s;
        } catch {
          // ignore
        }
        return null;
      })
      .filter(Boolean)
      .join("\n");

    if (content.length > 0) {
      return content;
    }

    return document.body.innerText;
  };

  const u = new URL(url);
  // console.log('URL', u);

  switch (u.host) {
    case "docs.google.com":
      if (u.pathname.startsWith("/document")) {
        return gdocsExtractor;
      }
      return defaultExtractor;
    default:
      return defaultExtractor;
  }
};
