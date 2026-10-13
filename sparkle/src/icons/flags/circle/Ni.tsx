import type { SVGProps } from "react";
import * as React from "react";

const SvgNi = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#F0F0F0"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#338AF3"
      d="M10 0A10 10 0 0 0 .992 5.652h18.016A10 10 0 0 0 10 0M10 20a10 10 0 0 0 9.008-5.652H.992A10 10 0 0 0 10 20"
    />
    <path
      fill="#FFDA44"
      d="M10 6.957a3.043 3.043 0 1 0 0 6.087 3.043 3.043 0 0 0 0-6.087m0 4.782a1.74 1.74 0 1 1 0-3.478 1.74 1.74 0 0 1 0 3.478"
    />
    <path fill="#0052B4" d="M11.507 10.435 10 10l-1.506.435-.502.87h4.017z" />
    <path fill="#338AF3" d="m10 7.826-1.004 1.74L10 10l1.004-.435z" />
    <path fill="#6DA544" d="M8.494 10.435h3.013l-.503-.87H8.996z" />
  </svg>
);
export default SvgNi;
