import { Err, Ok, type Result } from "@app/types/shared/result";

export async function getPageElements(
  tab: chrome.tabs.Tab
): Promise<Result<string, Error>> {
  if (!tab?.id) {
    return new Err(new Error("No active tab found."));
  }
  const [execution] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const w = window as unknown as {
        __dustElementMap: Record<string, WeakRef<HTMLElement>>;
      };

      w.__dustElementMap = {};
      let elementIdCounter = 0;

      const FORM_CONTROLS = [
        "button",
        "input",
        "select",
        "textarea",
        "[contenteditable='true']",
      ];

      const NAVIGATION = [
        "a[href]",
        '[role="link"]',
        '[role="tab"]',
        '[role="menuitem"]',
        '[role="menuitemcheckbox"]',
        '[role="menuitemradio"]',
      ];

      const CLICK_TARGETS = [
        '[role="button"]',
        '[role="switch"]',
        '[role="option"]',
        '[role="treeitem"]',
        '[role="gridcell"]',
      ];

      const INPUT_WIDGETS = [
        '[role="checkbox"]',
        '[role="radio"]',
        '[role="combobox"]',
        '[role="listbox"]',
        '[role="searchbox"]',
        '[role="spinbutton"]',
        '[role="slider"]',
      ];

      const FOCUSABLE = ["[tabindex]:not([tabindex='-1'])"];

      const CONTENT = [
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "p",
        "li",
        '[role="heading"]',
        '[role="paragraph"]',
      ];

      const selector = [
        ...FORM_CONTROLS,
        ...NAVIGATION,
        ...CLICK_TARGETS,
        ...INPUT_WIDGETS,
        ...FOCUSABLE,
        ...CONTENT,
      ].join(", ");

      const elements: {
        elementId: string;
        tag: string;
        type: "content" | "interactive";
        role: string;
        name: string;
        inputType: string | null;
        coords: {
          x: number;
          y: number;
        };
      }[] = [];

      const nodes = document.querySelectorAll<HTMLElement>(selector);

      const getElementName = (el: HTMLElement): string => {
        // 1. Explicit accessible name — highest priority
        const ariaLabel = el.getAttribute("aria-label");
        if (ariaLabel) {
          return ariaLabel;
        }

        const ariaLabelledBy = el.getAttribute("aria-labelledby");
        if (ariaLabelledBy) {
          const labelEl = document.getElementById(ariaLabelledBy);
          if (labelEl?.textContent) {
            return labelEl.textContent.trim();
          }
        }

        const placeholder = el.getAttribute("placeholder");
        if (placeholder) {
          return placeholder;
        }

        const title = el.getAttribute("title");
        if (title) {
          return title;
        }

        const alt = el.getAttribute("alt");
        if (alt) {
          return alt;
        }

        // 2. Associated <label>
        if (el.id) {
          const label = document
            .querySelector(`label[for="${el.id}"]`)
            ?.textContent?.trim();
          if (label) {
            return label;
          }
        }

        // 3. Text content (non-empty)
        const text = el.textContent;
        if (text) {
          return text;
        }

        // 4. SVG icon hints — check child SVGs for title or aria-label
        const svg = el.querySelector("svg");
        if (svg) {
          const svgAriaLabel = svg.getAttribute("aria-label");
          if (svgAriaLabel) {
            return svgAriaLabel;
          }

          const svgTitle = svg.querySelector("title")?.textContent?.trim();
          if (svgTitle) {
            return svgTitle;
          }
        }

        // 5. <img> inside the element
        const img = el.querySelector("img");
        if (img) {
          const imgAlt = img.getAttribute("alt")?.trim();
          if (imgAlt) {
            return imgAlt;
          }
        }

        return "";
      };

      nodes.forEach((el) => {
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") {
          return;
        }
        if (el.getAttribute("aria-hidden") === "true") {
          return;
        }

        const elementId = `element_${elementIdCounter++}`;
        w.__dustElementMap[elementId] = new WeakRef<HTMLElement>(el);

        const tag = el.tagName.toLowerCase();
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          return;
        }

        elements.push({
          elementId,
          tag,
          type: CONTENT.includes(tag) ? "content" : "interactive",
          role: el.getAttribute("role") ?? tag,
          name: getElementName(el),
          inputType: el.getAttribute("type"),
          coords: {
            x: Math.round(rect.x + rect.width / 2),
            y: Math.round(rect.y + rect.height / 2),
          },
        });
      });

      return JSON.stringify(elements);
    },
  });

  const result =
    (execution && typeof execution.result === "string"
      ? execution.result
      : JSON.stringify([])) ?? JSON.stringify([]);

  return new Ok(result);
}
