import PokeNavbar from "@app/components/poke/PokeNavbar";

interface PokeLayoutProps {
  children: React.ReactNode;
}

export default function PokeLayout({ children }: PokeLayoutProps) {
  return (
    <div>
      <PokeNavbar />
      <div className="flex flex-col p-6">{children}</div>;
    </div>
  );
}
