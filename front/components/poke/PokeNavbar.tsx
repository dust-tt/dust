import { Logo } from "@dust-tt/sparkle";

export const PokeNavbar: React.FC = () => (
  <nav className="flex items-center justify-between bg-brand px-4 py-6 pr-8">
    <div className="flex items-center">
      <Logo type="colored-grey" className="-mr-5 h-4 w-32 p-0" />
      <div className="text-stucture-300 text-sm italic">Poké</div>
    </div>
  </nav>
);

export default PokeNavbar;
