import type { SVGProps } from "react";
import * as React from "react";
const SvgSpeak = (props: SVGProps<SVGSVGElement>) => (
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
      d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10H2l2.929-2.929A9.97 9.97 0 0 1 2 12C2 6.477 6.477 2 12 2Zm0 2a8 8 0 0 0-8 8c0 2.152.85 4.165 2.343 5.657l1.415 1.414-.93.929H12a8 8 0 1 0 0-16Zm4 9a4 4 0 0 1-8 0h8ZM8.75 9c.656 0 1.274.308 1.624.833a.751.751 0 0 1-1.248.834c-.049-.073-.178-.167-.376-.167s-.327.094-.376.167a.751.751 0 0 1-1.248-.834C7.476 9.308 8.094 9 8.75 9Zm6.5 0c.656 0 1.273.308 1.624.833a.751.751 0 0 1-1.248.834c-.049-.073-.178-.167-.376-.167s-.327.094-.376.167a.751.751 0 0 1-1.248-.834c.35-.525.968-.833 1.624-.833Z"
    />
  </svg>
);
export default SvgSpeak;
