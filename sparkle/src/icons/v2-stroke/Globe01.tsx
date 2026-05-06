import type { SVGProps } from "react";
import * as React from "react";

const SvgGlobe01 = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#globe-01_svg__a)">
      <path
        fill="currentColor"
        d="M12 .965c6.095 0 11.035 4.94 11.035 11.035S18.095 23.035 12 23.035.965 18.095.965 12 5.905.965 12 .965m-8.903 12.07a8.97 8.97 0 0 0 6.546 7.614 16.34 16.34 0 0 1-2.624-7.614zm13.884 0a16.33 16.33 0 0 1-2.625 7.614 8.97 8.97 0 0 0 6.547-7.614zm-7.881 0A14.26 14.26 0 0 0 12 20.39a14.26 14.26 0 0 0 2.9-7.354zm5.256-9.685a16.34 16.34 0 0 1 2.625 7.615h3.922a8.97 8.97 0 0 0-6.547-7.615M12 3.61a14.26 14.26 0 0 0-2.9 7.355h5.8A14.26 14.26 0 0 0 12 3.61m-2.357-.26a8.97 8.97 0 0 0-6.546 7.615h3.922A16.34 16.34 0 0 1 9.643 3.35"
      />
    </g>
    <defs>
      <clipPath id="globe-01_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgGlobe01;
