import type { SVGProps } from "react";
import * as React from "react";
const SvgCup = (props: SVGProps<SVGSVGElement>) => (
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
      fillRule="evenodd"
      d="M11 4a1 1 0 0 0-.653 1.757 17.81 17.81 0 0 0-5.583 1.46A2.97 2.97 0 0 0 3 9.93V10H1v2h2v5.615C3 19.485 4.79 21 7 21h10c2.21 0 4-1.515 4-3.385V12h2v-2h-2v-.07a2.968 2.968 0 0 0-1.764-2.714 17.811 17.811 0 0 0-5.583-1.459A1 1 0 0 0 13 4h-2Zm-6 8v5.615c0 .935.895 1.693 2 1.693h10c1.105 0 2-.758 2-1.693V11H5v1Zm.675-3a15.818 15.818 0 0 1 12.65 0H5.675Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgCup;
