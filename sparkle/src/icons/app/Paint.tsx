import type { SVGProps } from "react";
import * as React from "react";
const SvgPaint = (props: SVGProps<SVGSVGElement>) => (
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
      d="M9.586 5 7.293 2.707l1.414-1.414L20.414 13l-7.293 7.293a3 3 0 0 1-4.242 0l-5.172-5.172a3 3 0 0 1 0-4.242L9.586 5ZM11 6.414l-5.879 5.879a.997.997 0 0 0-.293.707h12.758L11 6.414Z"
      clipRule="evenodd"
    />
    <path
      fill="currentColor"
      d="m20.995 16.964-1.767 1.768a2.5 2.5 0 1 0 3.535 0l-1.768-1.768Z"
    />
  </svg>
);
export default SvgPaint;
