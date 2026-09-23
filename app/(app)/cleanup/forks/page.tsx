import { PageHeader } from "@/components/navigation/page-header";
import { CleanupTabs } from "@/components/navigation/cleanup-tabs";
import { ForksCleanupView } from "@/components/manager/forks-cleanup-view";
import { translate } from "@/lib/i18n/core";

export default function CleanupForksPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={translate("cleanupForksTitle")}
        description={translate("cleanupForksHint")}
        backHref="/profile"
      />
      <div className="mb-4 shrink-0">
        <CleanupTabs />
      </div>
      <ForksCleanupView />
    </div>
  );
}
