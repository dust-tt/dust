import { Logo } from "@dust-tt/sparkle";
import Link from "next/link";

export const SuperUserNavbar: React.FC = () => (
  <nav className="flex items-center justify-between bg-brand px-4 py-6 pr-8">
    <div className="flex items-center">
      <Logo type="colored-grey" className="-mr-5 h-4 w-32 p-0" />
      <div className="text-stucture-300 text-sm italic">Super User Panel</div>
    </div>
    <div>
      <ul className="flex space-x-4">
        <li>
          <Link href="/super-user">
            <span className="cursor-pointer text-structure-0">Dashboard</span>
          </Link>
        </li>
        <li>
          <Link href="/super-user/link_1">
            <span className="cursor-pointer text-structure-0">Link 1</span>
          </Link>
        </li>
        <li>
          <Link href="/super-user/link_2">
            <span className="cursor-pointer text-structure-0">Link 2</span>
          </Link>
        </li>
      </ul>
    </div>
  </nav>
);

export default SuperUserNavbar;
