import type { SVGProps } from "react";
import * as React from "react";
const SvgTSquare = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#000"
      d="M2 3.5c0-.552-.052-.5.5-.5h19c.552 0 .5-.052.5.5v17c0 .552.052.5-.5.5h-19c-.552 0-.5.052-.5-.5v-17ZM4 5v14h16V5H4Zm3 3h10v3h-2v-1h-2v4h1.5v2h-5v-2H11v-4H9v1H7V8Z"
    />
  </svg>
);
export default SvgTSquare;
