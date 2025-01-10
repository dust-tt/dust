import PokeNavbar from "@app/components/poke/PokeNavbar";
import { TemplatesDataTable } from "@app/components/poke/templates/TemplatesDataTable";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withSuperUserAuthRequirements<object>(
  async () => {
    return {
      props: {},
    };
  }
);

export default function ListTemplates() {
  return (
    <div className="min-h-screen bg-structure-50 pb-48">
      <PokeNavbar />
      <div className="mx-auto h-full flex-grow flex-col items-center justify-center p-8 pt-8">
        <TemplatesDataTable />
      </div>
    </div>
  );
}
