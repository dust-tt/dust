import { PluginList } from "@app/components/poke/plugins/PluginList";
import PokeNavbar from "@app/components/poke/PokeNavbar";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withSuperUserAuthRequirements<object>(
  async () => {
    return {
      props: {},
    };
  }
);

export default function ListPokePlugins() {
  return (
    <div className="min-h-screen bg-structure-50 pb-48">
      <PokeNavbar />
      <div className="mx-auto h-full flex-grow flex-col items-center justify-center p-8 pt-8">
        <PluginList resourceType="global" />
      </div>
    </div>
  );
}
