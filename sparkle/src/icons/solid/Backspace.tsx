import type { SVGProps } from "react";
import * as React from "react";
const SvgBackspace = (props: SVGProps<SVGSVGElement>) => (
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
      d="M6.535 3h14.464a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6.535a1 1 0 0 1-.833-.445l-5.333-8a1 1 0 0 1 0-1.11l5.333-8A1 1 0 0 1 6.535 3Zm6.464 7.586-2.828-2.829-1.414 1.415L11.585 12l-2.828 2.828 1.414 1.415 2.828-2.829 2.829 2.829 1.414-1.415L14.413 12l2.829-2.828-1.414-1.415-2.829 2.829Z"
    />
  </svg>
);
export default SvgBackspace;
