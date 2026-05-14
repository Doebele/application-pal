import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Application } from "@application-pal/shared";
import { api } from "../lib/api";
import { Column } from "./Column";
import type { CardVariant } from "../lib/store";

const STAGES = [
  "import_validating",
  "preparing_cv",
  "preparing_letter",
  "application_sent",
  "pending",
  "interview_1",
  "interview_2",
  "rejected",
  "accepted"
] as const;

type Props = {
  applications: Application[];
  cardVariant: CardVariant;
  onCardClick: (id: string) => void;
  visibleStages?: ReadonlyArray<string>;
};

export function Board({ applications, cardVariant, onCardClick, visibleStages }: Props) {
  const stagesToShow = visibleStages && visibleStages.length > 0
    ? STAGES.filter((s) => visibleStages.includes(s))
    : STAGES;
  const queryClient = useQueryClient();

  const patchMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      api.patch(`/api/applications/${id}`, { stage }).then((r) => r.data),
    onMutate: async ({ id, stage }) => {
      await queryClient.cancelQueries({ queryKey: ["applications"] });
      const prev = queryClient.getQueryData<Application[]>(["applications"]);
      queryClient.setQueryData<Application[]>(["applications"], (old) =>
        old?.map((a) => (a.id === id ? { ...a, stage: stage as Application["stage"] } : a))
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["applications"], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["applications"] })
  });

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const newStage = destination.droppableId;
    const app = applications.find((a) => a.id === draggableId);
    if (!app || app.stage === newStage) return;
    patchMutation.mutate({ id: draggableId, stage: newStage });
  };

  const byStage = (stageId: string) =>
    applications.filter((a) => a.stage === stageId);

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="board-scroll">
        <div className="kanban">
          {stagesToShow.map((stageId) => (
            <Column
              key={stageId}
              stageId={stageId}
              applications={byStage(stageId)}
              cardVariant={cardVariant}
              onCardClick={onCardClick}
            />
          ))}
        </div>
      </div>
    </DragDropContext>
  );
}
