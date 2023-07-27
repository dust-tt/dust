import type { SVGProps } from "react";
import * as React from "react";
const SvgClipboard = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10.5 3A1.501 1.501 0 0 0 9 4.5h6A1.5 1.5 0 0 0 13.5 3h-3Zm5.694.178A3 3 0 0 0 13.5 1.5h-3a3 3 0 0 0-2.693 1.678 48.94 48.94 0 0 0-1.487.15c-1.497.173-2.57 1.46-2.57 2.929V19.5a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3V6.257c0-1.47-1.073-2.756-2.57-2.93a48.951 48.951 0 0 0-1.486-.15ZM7.514 4.71c-.341.032-.681.068-1.02.107-.705.082-1.244.694-1.244 1.44V19.5a1.5 1.5 0 0 0 1.5 1.5h10.5a1.5 1.5 0 0 0 1.5-1.5V6.257c0-.746-.54-1.358-1.243-1.44-.34-.039-.68-.075-1.022-.107A1.5 1.5 0 0 1 15 6H9a1.5 1.5 0 0 1-1.485-1.29Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgClipboard;
