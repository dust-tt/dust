import type { SVGProps } from "react";
import * as React from "react";

const SvgParagraphWrap = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="currentColor"
      d="M15.269 15.269a1.034 1.034 0 1 1 1.462 1.462l-.233.234H18a1.965 1.965 0 1 0 0-3.93H3a1.035 1.035 0 0 1 0-2.07h15a4.036 4.036 0 1 1 0 8.07h-1.502l.233.234a1.034 1.034 0 1 1-1.462 1.462l-2-2a1.034 1.034 0 0 1 0-1.462zM10 16.965a1.035 1.035 0 0 1 0 2.07H3a1.035 1.035 0 0 1 0-2.07zm11-12a1.035 1.035 0 0 1 0 2.07H3a1.035 1.035 0 0 1 0-2.07z"
    />
  </svg>
);
export default SvgParagraphWrap;
