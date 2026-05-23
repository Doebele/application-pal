import { Plus } from "iconoir-react";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import type { Application } from "@application-pal/shared";
import { useTranslation } from "react-i18next";
import { ApplicationCard } from "./Card";
import type { CardVariant } from "../lib/store";

type Props = {
  stageId: string;
  applications: Application[];
  cardVariant: CardVariant;
  onCardClick: (id: string) => void;
};

export function Column({ stageId, applications, cardVariant, onCardClick }: Props) {
  const { t } = useTranslation("stages");
  const label = t(stageId, { defaultValue: stageId });

  return (
    <div className={`column stage-${stageId}`}>
      <div className="column-head">
        <span className="stage-pip" />
        <h3>{label}</h3>
        <span className="col-count">{applications.length}</span>
        <button className="col-add" aria-label="Add">
          <Plus width={13} height={13} />
        </button>
      </div>

      <Droppable droppableId={stageId}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="column-body"
            style={{
              background: snapshot.isDraggingOver ? "var(--accent-08)" : undefined,
              borderRadius: 8,
              minHeight: 40,
              transition: "background 0.15s ease"
            }}
          >
            {applications.map((app, index) => (
              <Draggable key={app.id} draggableId={app.id} index={index}>
                {(drag, dragSnapshot) => (
                  <div
                    ref={drag.innerRef}
                    {...drag.draggableProps}
                    {...drag.dragHandleProps}
                    className={dragSnapshot.isDragging ? "is-dragging" : ""}
                  >
                    <ApplicationCard
                      app={app}
                      variant={cardVariant}
                      onClick={() => onCardClick(app.id)}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
