import type { SVGProps } from "react";
import * as React from "react";
const SvgFilm = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#111418"
      d="M2 3.993A1 1 0 0 1 2.992 3h18.016c.548 0 .992.445.992.993v16.014a1 1 0 0 1-.992.993H2.992A.993.993 0 0 1 2 20.007V3.993ZM8 5v14h8V5H8ZM4 5v2h2V5H4Zm14 0v2h2V5h-2ZM4 9v2h2V9H4Zm14 0v2h2V9h-2ZM4 13v2h2v-2H4Zm14 0v2h2v-2h-2ZM4 17v2h2v-2H4Zm14 0v2h2v-2h-2Z"
    />
  </svg>
);
export default SvgFilm;
