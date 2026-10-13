import type { SVGProps } from "react";
import * as React from "react";

const SvgAf = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#D80027"
      d="M14.348.992A9.96 9.96 0 0 0 10.001 0a9.96 9.96 0 0 0-4.348.992L4.783 10l.87 9.008A9.96 9.96 0 0 0 10 20a9.96 9.96 0 0 0 4.347-.992l.87-9.008z"
    />
    <path
      fill="#000"
      d="M5.652.993A10 10 0 0 0 0 10a10 10 0 0 0 5.652 9.007z"
    />
    <path
      fill="#496E2D"
      d="M14.348.993v18.014A10 10 0 0 0 20 10 10 10 0 0 0 14.348.993"
    />
    <path
      fill="#FFDA44"
      d="M10 6.522a3.478 3.478 0 1 0 0 6.956 3.478 3.478 0 0 0 0-6.956m0 5.652a2.174 2.174 0 1 1 0-4.348 2.174 2.174 0 0 1 0 4.348"
    />
    <path
      fill="#FFDA44"
      d="M10 8.696a.87.87 0 0 0-.87.87v1.304h1.74V9.565a.87.87 0 0 0-.87-.87"
    />
  </svg>
);
export default SvgAf;
