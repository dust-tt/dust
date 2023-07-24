import * as React from "react";
import type { SVGProps } from "react";
const SvgServer = (props: SVGProps<SVGSVGElement>) => (
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
      fillRule="evenodd"
      d="M7.923 4.5a2.625 2.625 0 0 0-2.555 2.024L3.64 13.862A3.736 3.736 0 0 1 5.25 13.5h13.5c.576 0 1.121.13 1.609.362l-1.727-7.338A2.625 2.625 0 0 0 16.077 4.5H7.923ZM21 17.25A2.25 2.25 0 0 0 18.75 15H5.25a2.25 2.25 0 0 0 0 4.5h13.5A2.25 2.25 0 0 0 21 17.25Zm-19.5 0A3.75 3.75 0 0 0 5.25 21h13.5a3.75 3.75 0 0 0 3.75-3.75v-.228c0-.405-.047-.808-.14-1.202l-2.268-9.64A4.125 4.125 0 0 0 16.077 3H7.923a4.125 4.125 0 0 0-4.015 3.18L1.64 15.82a5.25 5.25 0 0 0-.14 1.202v.228Zm13.5 0a.75.75 0 0 1 .75-.75h.008a.75.75 0 0 1 .75.75v.008a.75.75 0 0 1-.75.75h-.008a.75.75 0 0 1-.75-.75v-.008Zm3 0a.75.75 0 0 1 .75-.75h.008a.75.75 0 0 1 .75.75v.008a.75.75 0 0 1-.75.75h-.008a.75.75 0 0 1-.75-.75v-.008Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgServer;
