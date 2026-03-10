import { Err, Ok, type Result } from "@app/types/shared/result";

export async function ensureDustPageUtils(
  tab: chrome.tabs.Tab
): Promise<Result<void, Error>> {
  if (!tab?.id) {
    return new Err(new Error("No active tab found."));
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const w = window as unknown as {
        __dustUtils?: unknown;
      };
      if (w.__dustUtils) {
        return; // already injected
      }

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

      w.__dustUtils = { selector, CONTENT, getElementName };
    },
  });

  return new Ok(undefined);
}
