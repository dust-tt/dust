import type { SVGProps } from "react";
import * as React from "react";

const SvgSave = (props: SVGProps<SVGSVGElement>) => (
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
      d="M7 19v-6h10v6h2V7.828L16.172 5H5v14zM17 3l4 4v14H3V3zM9 15v4h6v-4z"
    />
  </svg>
);
export default SvgSave;
