import type { SVGProps } from "react";
import * as React from "react";
const SvgShoppingBasket = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#111418"
      d="M12.005 2a6 6 0 0 1 6 6v1h4v2h-1.167l-.757 9.083a1 1 0 0 1-.996.917H4.925a1 1 0 0 1-.997-.917L3.171 11H2.005V9h4V8a6 6 0 0 1 6-6Zm6.826 9H5.178l.667 8h12.319l.667-8Zm-5.826 2v4h-2v-4h2Zm-4 0v4h-2v-4h2Zm8 0v4h-2v-4h2Zm-5-9A4 4 0 0 0 8.01 7.8l-.005.2v1h8V8a4 4 0 0 0-3.8-3.995l-.2-.005Z"
    />
  </svg>
);
export default SvgShoppingBasket;
