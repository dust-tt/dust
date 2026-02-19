import type { SVGProps } from "react";
import * as React from "react";

const SvgSun = (props: SVGProps<SVGSVGElement>) => (
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
      d="M12 18.875a6 6 0 1 1 0-12 6 6 0 0 1 0 12m-1-17h2v3h-2zm0 19h2v3h-2zM3.515 5.804 4.929 4.39 7.05 6.51 5.636 7.925zM16.95 19.239l1.414-1.414 2.121 2.121-1.414 1.414zm2.121-14.85 1.414 1.415-2.121 2.121-1.414-1.414zM5.636 17.826l1.414 1.414L4.93 21.36l-1.414-1.414zM23 11.875v2h-3v-2zm-19 0v2H1v-2z"
    />
  </svg>
);
export default SvgSun;
