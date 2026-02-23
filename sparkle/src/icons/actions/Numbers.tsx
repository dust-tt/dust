import type { SVGProps } from "react";
import * as React from "react";

const SvgNumbers = (props: SVGProps<SVGSVGElement>) => (
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
      d="M9 18H4v-8h5zm-2-2v-4H6v4zm6 0V8h-1v8zm2 2h-5V6h5zm4-2V4h-1v12zm2 2h-5V2h5zm1 4H3v-2h19z"
    />
  </svg>
);
export default SvgNumbers;
