import { useDemo } from "../lib/data";
import { useT } from "../lib/i18n";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Panel";
import { ArchiveTable } from "../components/overview/ArchiveTable";

export function Episodes() {
  const data = useDemo();
  const { t } = useT();
  return (
    <div className="space-y-6">
      <PageHeader title={t("episodes.title")} description={t("episodes.lead")} />
      <Panel bodyClassName="">
        <ArchiveTable episodes={data.episodes} />
      </Panel>
    </div>
  );
}
