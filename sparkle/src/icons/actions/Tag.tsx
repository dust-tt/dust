import type { SVGProps } from "react";
import * as React from "react";
const SvgTag = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="M15 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M11 2 1 12l11 11 10-10-.756-7.558a3 3 0 0 0-2.686-2.686L11 2Zm8.916 10.256L12 20.172 3.828 12l7.916-7.916 6.615.662a1 1 0 0 1 .895.895l.662 6.615Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgTag;
