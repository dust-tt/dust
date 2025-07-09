import type { SVGProps } from "react";
import * as React from "react";
const SvgTShirt = (props: SVGProps<SVGSVGElement>) => (
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
      d="m14.514 5 3.216-3.229L23.25 7.5s-2.178 2.327-4.251 4.329V22h-14V11.83C3.748 10.486.65 7.25.65 7.25l5.604-5.5S8.055 3.565 9.484 5h5.03Zm.828 2H8.656L6.17 4.515 3.342 7.343 6.999 11v9h10v-9l3.657-3.657-2.829-2.828L15.342 7Z"
    />
  </svg>
);
export default SvgTShirt;
