import { PageHeader } from "@/components/navigation/page-header";
import { CleanupTabs } from "@/components/navigation/cleanup-tabs";
import { StarsCleanupView } from "@/components/manager/stars-cleanup-view";
import { translate } from "@/lib/i18n/core";

export default function CleanupStarsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={translate("cleanupStarsTitle")}
        description={translate("cleanupStarsHint")}
        backHref="/profile"
      />
      <div className="mb-4 shrink-0">
        <CleanupTabs />
      </div>
      <StarsCleanupView />
    </div>
  );
}
