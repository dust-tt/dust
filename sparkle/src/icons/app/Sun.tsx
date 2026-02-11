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
      d="M12 18.875a6 6 0 1 1 0-12 6 6 0 0 1 0 12Zm-1-17h2v3h-2v-3Zm0 19h2v3h-2v-3ZM3.515 5.804 4.929 4.39 7.05 6.51 5.636 7.925 3.515 5.804ZM16.95 19.239l1.414-1.414 2.121 2.121-1.414 1.414-2.121-2.121Zm2.121-14.85 1.414 1.415-2.121 2.121-1.414-1.414L19.07 4.39ZM5.636 17.826l1.414 1.414L4.93 21.36l-1.414-1.414 2.121-2.121ZM23 11.875v2h-3v-2h3Zm-19 0v2H1v-2h3Z"
    />
  </svg>
);
export default SvgSun;
