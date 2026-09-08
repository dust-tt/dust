import type { SVGProps } from "react";
import * as React from "react";

const SvgFaceHappy = (props: SVGProps<SVGSVGElement>) => (
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
      d="M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0m-4.5 1a1 1 0 0 1 1 1c0 1.224-.715 2.359-1.678 3.148A6.06 6.06 0 0 1 12 18.5a6.06 6.06 0 0 1-3.822-1.352C7.215 16.358 6.5 15.224 6.5 14a1 1 0 0 1 1-1zm-7.622 2c.144.202.331.408.568.602A4.06 4.06 0 0 0 12 16.5c1.007 0 1.911-.37 2.554-.898.237-.194.423-.4.568-.602zM9 7.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3m6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3m8 4.5c0 6.075-4.925 11-11 11S1 18.075 1 12 5.925 1 12 1s11 4.925 11 11"
    />
  </svg>
);
export default SvgFaceHappy;
