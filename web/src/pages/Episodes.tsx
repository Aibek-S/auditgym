import { useDemo } from "../lib/data";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Panel";
import { EpisodeTable } from "../components/overview/EpisodeTable";

export function Episodes() {
  const data = useDemo();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Archive"
        title="Episodes"
        description="Fixtures pin the format; generated episodes vary names, ids, amounts and error combinations from a seed. Open any month to inspect the public files and the evaluator truth."
      />
      <Panel bodyClassName="">
        <EpisodeTable episodes={data.episodes} />
      </Panel>
    </div>
  );
}
