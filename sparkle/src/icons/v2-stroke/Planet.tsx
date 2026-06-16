import type { SVGProps } from "react";
import * as React from "react";

const SvgPlanet = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="2" />
    <path
      stroke="currentColor"
      strokeWidth="2"
      d="M9.09826 5.5C6.14545 3.4148 3.64299 2.35701 3 3C2 4 5.11373 9.49745 9.80816 14.1919C14.5026 18.8863 20 22 21 21C21.6358 20.3642 20.6085 17.9099 18.5691 15"
    />
  </svg>
);
export default SvgPlanet;
