import type { SVGProps } from "react";
import * as React from "react";
const SvgPencilSquare = (props: SVGProps<SVGSVGElement>) => (
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
      d="M20.67 3.33a1.125 1.125 0 0 0-1.59 0l-1.158 1.157 1.591 1.59L20.67 4.92c.44-.439.44-1.151 0-1.59Zm-2.217 3.808-1.591-1.59-8.401 8.4a3.75 3.75 0 0 0-.942 1.581l-.404 1.356 1.356-.404a3.75 3.75 0 0 0 1.58-.942l8.402-8.4Zm-.434-4.87a2.625 2.625 0 0 1 3.712 3.713L11.112 16.6A5.25 5.25 0 0 1 8.9 17.919l-2.685.8a.75.75 0 0 1-.933-.933l.8-2.685a5.25 5.25 0 0 1 1.32-2.214L18.018 2.27ZM5.25 6.75a1.5 1.5 0 0 0-1.5 1.5v10.5a1.5 1.5 0 0 0 1.5 1.5h10.5a1.5 1.5 0 0 0 1.5-1.5V14a.75.75 0 0 1 1.5 0v4.75a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V8.25a3 3 0 0 1 3-3H10a.75.75 0 0 1 0 1.5H5.25Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgPencilSquare;
