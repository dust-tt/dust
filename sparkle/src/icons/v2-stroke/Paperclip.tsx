import type { SVGProps } from "react";
import * as React from "react";

const SvgPaperclip = (props: SVGProps<SVGSVGElement>) => (
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
      d="M13.021 2.768a4.5 4.5 0 1 1 6.363 6.363l-8.662 8.663a2.75 2.75 0 1 1-3.888-3.89l7.601-7.6a1 1 0 0 1 1.414 1.413L8.248 15.32a.75.75 0 1 0 1.06 1.06l8.663-8.662a2.5 2.5 0 1 0-3.536-3.535L5.42 13.198a4.25 4.25 0 1 0 6.01 6.01l9.015-9.016a1 1 0 0 1 1.414 1.415l-9.016 9.016a6.25 6.25 0 0 1-8.837-8.84z"
    />
  </svg>
);
export default SvgPaperclip;
