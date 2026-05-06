import type { SVGProps } from "react";
import * as React from "react";

const SvgPencilLine = (props: SVGProps<SVGSVGElement>) => (
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
      d="M21 19.965a1.035 1.035 0 0 1 0 2.07h-8a1.035 1.035 0 0 1 0-2.07z"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M16.268 2.268a3.863 3.863 0 1 1 5.463 5.464l-11.28 11.28c-.25.25-.437.44-.649.604a4 4 0 0 1-.565.368c-.236.127-.485.22-.816.348l-5.55 2.134a1.035 1.035 0 0 1-1.337-1.338l2.134-5.55c.127-.331.221-.58.348-.816q.161-.297.367-.565c.165-.212.354-.398.605-.65zM4.301 19.698l2.84-1.093-1.748-1.748zM20.268 3.732c-.7-.7-1.837-.7-2.537 0L6.462 15l.14.138 2.259 2.26.137.139 11.27-11.269c.7-.7.7-1.836 0-2.536"
    />
  </svg>
);
export default SvgPencilLine;
