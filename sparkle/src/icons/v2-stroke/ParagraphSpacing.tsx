import type { SVGProps } from "react";
import * as React from "react";

const SvgParagraphSpacing = (props: SVGProps<SVGSVGElement>) => (
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
      d="M6 2.965c.274 0 .537.11.731.304l3 3A1.034 1.034 0 1 1 8.268 7.73L7.035 6.498v11.004l1.233-1.233a1.034 1.034 0 1 1 1.463 1.462l-3 3a1.035 1.035 0 0 1-1.463 0l-3-3a1.034 1.034 0 1 1 1.463-1.462l1.234 1.233V6.498L3.73 7.731A1.034 1.034 0 1 1 2.268 6.27l3-3 .076-.07c.184-.15.416-.234.656-.234m15 14a1.035 1.035 0 0 1 0 2.07h-8a1.035 1.035 0 0 1 0-2.07zm0-4a1.035 1.035 0 0 1 0 2.07h-8a1.035 1.035 0 0 1 0-2.07zm0-4a1.035 1.035 0 0 1 0 2.07h-8a1.035 1.035 0 0 1 0-2.07zm0-4a1.035 1.035 0 0 1 0 2.07h-8a1.035 1.035 0 0 1 0-2.07z"
    />
  </svg>
);
export default SvgParagraphSpacing;
