import type { SVGProps } from "react";
import * as React from "react";
const SvgFolderOpen = (props: SVGProps<SVGSVGElement>) => (
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
      d="M4 5v14h16V8h-9.414L8.472 5.373A1 1 0 0 0 7.692 5H4Zm7.414 1H22v15H2V3h5.563a3 3 0 0 1 2.338 1.12L11.414 6Z"
    />
  </svg>
);
export default SvgFolderOpen;
