import type { SVGProps } from "react";
import * as React from "react";
const SvgArrowGoBack = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 25"
    {...props}
  >
    <path
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={0.5}
      d="M8.618 6.35h4.224c4.092 0 7.408 3.337 7.408 7.45 0 4.113-3.316 7.45-7.408 7.45H4.539v-2.3h8.303c2.825 0 5.119-2.305 5.119-5.15 0-2.846-2.294-5.15-5.12-5.15H8.619v3.886l-.41-.345-5.368-4.5-.23-.191.23-.191 5.368-4.5.41-.345V6.35Z"
    />
  </svg>
);
export default SvgArrowGoBack;
