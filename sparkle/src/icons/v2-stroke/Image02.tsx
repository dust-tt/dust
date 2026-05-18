import type { SVGProps } from "react";
import * as React from "react";

const SvgImage02 = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#image-02_svg__a)">
      <path
        fill="currentColor"
        d="M15.371 9.479c.358-.117.74-.13 1.104-.043l.154.043.209.084c.197.093.357.212.49.325.166.142.35.325.535.511l2.992 2.994q.108-.682.11-1.393a8.965 8.965 0 1 0-15.03 6.6l8.202-8.2c.186-.187.369-.37.536-.512.176-.15.402-.313.698-.41M16 11.477c-.086.074-.2.186-.4.386L7.635 19.83a8.964 8.964 0 0 0 12.554-4.179l-3.789-3.787c-.2-.2-.313-.312-.399-.386M9.465 8.5a.965.965 0 1 0-1.93 0 .965.965 0 0 0 1.93 0m13.57 3.5c0 6.095-4.94 11.035-11.035 11.035a11 11 0 0 1-6.66-2.238A11.02 11.02 0 0 1 .965 12C.965 5.906 5.905.965 12 .965S23.035 5.905 23.035 12m-11.5-3.5a3.035 3.035 0 1 1-6.07 0 3.035 3.035 0 0 1 6.07 0"
      />
    </g>
    <defs>
      <clipPath id="image-02_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgImage02;
