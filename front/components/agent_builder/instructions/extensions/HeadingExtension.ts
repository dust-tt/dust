import { markdownHeaderClasses } from "@dust-tt/sparkle";
import { mergeAttributes } from "@tiptap/core";
import { Heading } from "@tiptap/extension-heading";

export const HeadingExtension = Heading.extend({
  levels: [1, 2, 3, 4, 5, 6],
  renderHTML({ node, HTMLAttributes }) {
    const level = this.options.levels.includes(node.attrs.level)
      ? node.attrs.level
      : this.options.levels[0];
    const classes: { [index: number]: string } = {
      1: markdownHeaderClasses.h1,
      2: markdownHeaderClasses.h2,
      3: markdownHeaderClasses.h3,
      4: markdownHeaderClasses.h4,
      5: markdownHeaderClasses.h5,
      6: markdownHeaderClasses.h6,
    };
    return [
      `h${level}`,
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: `${classes[level]}`,
      }),
      0,
    ];
  },
});
