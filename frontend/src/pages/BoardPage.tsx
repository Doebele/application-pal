import { useQuery } from "@tanstack/react-query";
import type { Application } from "@application-pal/shared";
import { api } from "../lib/api";
import { useUiStore } from "../lib/store";
import { Topbar } from "../components/Topbar";
import { Board } from "../components/Board";
import { ImportDrawer } from "../components/ImportDrawer";
import { DetailDrawer } from "../components/DetailDrawer";

export function BoardPage() {
  const { cardVariant, isImportModalOpen, setImportModalOpen, selectedApplicationId, setSelectedApplicationId } = useUiStore();

  const { data: applications = [] } = useQuery<Application[]>({
    queryKey: ["applications"],
    queryFn: () => api.get("/api/applications").then((r) => r.data)
  });

  const selectedApp = applications.find((a) => a.id === selectedApplicationId) ?? null;

  return (
    <>
      <Topbar
        title="Board"
        sub={`${applications.length} applications`}
        showImport
        onImport={() => setImportModalOpen(true)}
      />
      <Board
        applications={applications}
        cardVariant={cardVariant}
        onCardClick={(id) => setSelectedApplicationId(id)}
      />
      {isImportModalOpen && (
        <ImportDrawer onClose={() => setImportModalOpen(false)} />
      )}
      {selectedApp && (
        <DetailDrawer
          app={selectedApp}
          onClose={() => setSelectedApplicationId(null)}
        />
      )}
    </>
  );
}
