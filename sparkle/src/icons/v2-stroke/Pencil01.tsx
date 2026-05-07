import type { SVGProps } from "react";
import * as React from "react";

const SvgPencil01 = (props: SVGProps<SVGSVGElement>) => (
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
      d="M16.268 2.268a3.863 3.863 0 1 1 5.463 5.464l-11.279 11.28c-.251.25-.438.44-.65.604a4 4 0 0 1-.565.368c-.236.127-.485.22-.816.348l-5.55 2.134a1.035 1.035 0 0 1-1.337-1.338l2.134-5.55c.127-.331.222-.58.348-.816q.16-.297.368-.565c.164-.212.353-.398.604-.65zM4.302 19.698l2.84-1.093-1.749-1.748zM20.268 3.732c-.7-.7-1.836-.7-2.537 0L6.463 15l.14.138 2.258 2.26q.067.067.137.139l11.27-11.269c.7-.7.7-1.836 0-2.536"
    />
  </svg>
);
export default SvgPencil01;
