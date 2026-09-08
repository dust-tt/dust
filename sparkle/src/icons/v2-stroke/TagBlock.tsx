import type { SVGProps } from "react";
import * as React from "react";

const SvgTagBlock = (props: SVGProps<SVGSVGElement>) => (
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
      d="M4.935 17c0-.552.546-1 1.22-1H20.78c.673 0 1.219.448 1.219 1s-.546 1-1.219 1H6.154c-.673 0-1.219-.448-1.219-1M4.935 12c0-.552.546-1 1.22-1H20.78c.673 0 1.219.448 1.219 1s-.546 1-1.219 1H6.154c-.673 0-1.219-.448-1.219-1M4.935 7c0-.552.546-1 1.22-1H20.78C21.454 6 22 6.448 22 7s-.546 1-1.219 1H6.154c-.673 0-1.219-.448-1.219-1M5.008 2H3.007c-.37 0-.71.206-.884.531-.356.666.123 1.48.878 1.48h2.002c.37 0 .71-.207.884-.534C6.241 2.81 5.762 2 5.008 2M5.017 20.009H2.999A.996.996 0 1 0 3 22h2.018a.996.996 0 1 0 0-1.991"
    />
  </svg>
);
export default SvgTagBlock;
