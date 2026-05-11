import type { SVGProps } from "react";
import * as React from "react";

const SvgSearchLg = (props: SVGProps<SVGSVGElement>) => (
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
      d="M18.965 11.5a7.465 7.465 0 1 0-7.465 7.465c2.01 0 3.833-.797 5.175-2.089a1 1 0 0 1 .201-.201 7.44 7.44 0 0 0 2.089-5.175m2.07 0c0 2.26-.788 4.335-2.102 5.969l2.798 2.8a1.034 1.034 0 1 1-1.462 1.462l-2.8-2.798a9.535 9.535 0 1 1 3.566-7.433"
    />
  </svg>
);
export default SvgSearchLg;
