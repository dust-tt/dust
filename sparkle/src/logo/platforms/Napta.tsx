import type { SVGProps } from "react";
import * as React from "react";

const SvgNapta = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#Napta_svg__a)">
      <path
        fill="#0C1824"
        d="M0 9.6c0-3.36 0-5.04.654-6.324A6 6 0 0 1 3.276.654C4.56 0 6.24 0 9.6 0h4.8c3.36 0 5.04 0 6.324.654a6 6 0 0 1 2.622 2.622C24 4.56 24 6.24 24 9.6v4.8c0 3.36 0 5.04-.654 6.324a6 6 0 0 1-2.622 2.622C19.44 24 17.76 24 14.4 24H9.6c-3.36 0-5.04 0-6.324-.654a6 6 0 0 1-2.622-2.622C0 19.44 0 17.76 0 14.4z"
      />
      <g fill="#00CB9C" clipPath="url(#Napta_svg__b)">
        <path d="M12 8a4 4 0 0 0-8 0v12h4V8l4 4zM16 16l-4-4v4a4 4 0 0 0 8 0V4h-4z" />
      </g>
    </g>
    <defs>
      <clipPath id="Napta_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
      <clipPath id="Napta_svg__b">
        <path fill="#fff" d="M4 4h16v16H4z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgNapta;
