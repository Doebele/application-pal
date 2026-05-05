import { zodResolver } from "@hookform/resolvers/zod";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DragDropContext, Draggable, type DropResult, Droppable } from "@hello-pangea/dnd";
import {
  applicationImportResponseSchema,
  applicationPatchSchema,
  applicationStageEnum,
  type Application,
  type ApplicationStage
} from "@application-pal/shared";
import { BriefcaseBusiness, Moon, Plus, Sun } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { api } from "./lib/api";
import { useUiStore } from "./lib/store";
import { z } from "zod";

const queryClient = new QueryClient();
const stageSelectOptions = applicationStageEnum.enumValues;
const importRequestSchema = z.object({
  mode: z.enum(["url", "text"]),
  value: z.string().trim().min(1)
});
const importConfirmSchema = applicationPatchSchema.extend({
  company: z.string().trim().min(1),
  role: z.string().trim().min(1),
  stage: z.enum(stageSelectOptions)
});
type ApplicationPatchInput = z.infer<typeof applicationPatchSchema>;
type ImportRequestInput = z.infer<typeof importRequestSchema>;
type ImportConfirmInput = z.infer<typeof importConfirmSchema>;

const stageOrder: Array<{ id: ApplicationStage; title: string; badgeClassName: string }> = [
  { id: "import_validating", title: "Import & Validating", badgeClassName: "bg-slate-600/15 text-slate-700 dark:text-slate-200" },
  { id: "preparing_cv", title: "Preparing CV", badgeClassName: "bg-blue-600/15 text-blue-700 dark:text-blue-200" },
  { id: "preparing_letter", title: "Preparing Letter", badgeClassName: "bg-cyan-600/15 text-cyan-700 dark:text-cyan-200" },
  { id: "application_sent", title: "Application Sent", badgeClassName: "bg-violet-600/15 text-violet-700 dark:text-violet-200" },
  { id: "pending", title: "Pending Application", badgeClassName: "bg-amber-600/15 text-amber-700 dark:text-amber-200" },
  { id: "interview_1", title: "1st Interview", badgeClassName: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-200" },
  { id: "interview_2", title: "2nd Interview", badgeClassName: "bg-green-600/15 text-green-700 dark:text-green-200" },
  { id: "rejected", title: "Rejected", badgeClassName: "bg-rose-600/15 text-rose-700 dark:text-rose-200" },
  { id: "accepted", title: "Accepted", badgeClassName: "bg-lime-600/15 text-lime-700 dark:text-lime-200" }
];

const stageTitleById = Object.fromEntries(stageOrder.map((stage) => [stage.id, stage.title])) as Record<
  ApplicationStage,
  string
>;

const stageBadgeClassById = Object.fromEntries(stageOrder.map((stage) => [stage.id, stage.badgeClassName])) as Record<
  ApplicationStage,
  string
>;

const formatDaysAgo = (application: Application): string => {
  const sourceDate = application.appliedAt ?? application.createdAt;
  const parsed = new Date(sourceDate);
  if (Number.isNaN(parsed.getTime())) {
    return "Date unknown";
  }

  const diffMs = Date.now() - parsed.getTime();
  const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  if (days === 0) {
    return "Today";
  }

  return `${days}d ago`;
};

const faviconUrl = (url: string | null): string | null => {
  if (!url) {
    return null;
  }

  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=32`;
  } catch {
    return null;
  }
};

const toDateInputValue = (value: Date | string | null | undefined): string => {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
};

const parseDateInputValue = (value: string): Date | null => {
  if (!value) {
    return null;
  }

  return new Date(`${value}T12:00:00.000Z`);
};

const stageLabel = (stage: ApplicationStage): string =>
  stage
    .split("_")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");

function BoardPage() {
  const reactQueryClient = useQueryClient();
  const darkMode = useUiStore((state) => state.darkMode);
  const toggleDarkMode = useUiStore((state) => state.toggleDarkMode);
  const setImportModalOpen = useUiStore((state) => state.setImportModalOpen);
  const isImportModalOpen = useUiStore((state) => state.isImportModalOpen);
  const selectedApplicationId = useUiStore((state) => state.selectedApplicationId);
  const setSelectedApplicationId = useUiStore((state) => state.setSelectedApplicationId);
  const [importStep, setImportStep] = useState<1 | 2>(1);
  const [importDraft, setImportDraft] = useState<z.infer<typeof applicationImportResponseSchema> | null>(null);
  const autoSaveTimeoutRef = useRef<number | null>(null);

  const applicationsQuery = useQuery({
    queryKey: ["applications"],
    queryFn: async () => {
      const response = await api.get<Application[]>("/api/applications");
      return response.data;
    }
  });

  const selectedApplication = useMemo(
    () => (applicationsQuery.data ?? []).find((application) => application.id === selectedApplicationId) ?? null,
    [applicationsQuery.data, selectedApplicationId]
  );

  const detailForm = useForm<ApplicationPatchInput>({
    resolver: zodResolver(applicationPatchSchema),
    defaultValues: {}
  });
  const importInputForm = useForm<ImportRequestInput>({
    resolver: zodResolver(importRequestSchema),
    defaultValues: {
      mode: "url",
      value: ""
    }
  });
  const importConfirmForm = useForm<ImportConfirmInput>({
    resolver: zodResolver(importConfirmSchema),
    defaultValues: {
      company: "",
      role: "",
      location: "",
      url: "",
      description: "",
      notes: "",
      stage: "import_validating",
      appliedAt: null
    }
  });

  const patchApplicationMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: ApplicationPatchInput }) => {
      const response = await api.patch<Application>(`/api/applications/${id}`, payload);
      return response.data;
    },
    onSuccess: (updated) => {
      reactQueryClient.setQueryData<Application[]>(["applications"], (current = []) =>
        current.map((application) => (application.id === updated.id ? updated : application))
      );
    }
  });

  const deleteApplicationMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/applications/${id}`);
      return id;
    },
    onSuccess: (id) => {
      reactQueryClient.setQueryData<Application[]>(["applications"], (current = []) =>
        current.filter((application) => application.id !== id)
      );
      setSelectedApplicationId(null);
    }
  });

  const importMutation = useMutation({
    mutationFn: async (payload: ImportRequestInput) => {
      const response = await api.post("/api/applications/import", payload.mode === "url" ? { url: payload.value } : { text: payload.value });
      return applicationImportResponseSchema.parse(response.data);
    },
    onSuccess: (draft) => {
      setImportDraft(draft);
      setImportStep(2);
    }
  });

  const createApplicationMutation = useMutation({
    mutationFn: async (payload: ImportConfirmInput) => {
      const response = await api.post<Application>("/api/applications", payload);
      return response.data;
    },
    onSuccess: (created) => {
      reactQueryClient.setQueryData<Application[]>(["applications"], (current = []) => [created, ...current]);
      setImportModalOpen(false);
      setImportStep(1);
      setImportDraft(null);
      importInputForm.reset({
        mode: "url",
        value: ""
      });
    }
  });

  const applications = applicationsQuery.data ?? [];

  const handleDragEnd = (result: DropResult): void => {
    const destination = result.destination;
    if (!destination) {
      return;
    }

    if (destination.droppableId === result.source.droppableId) {
      return;
    }

    const nextStage = destination.droppableId as ApplicationStage;
    const application = applicationsByStage[result.source.droppableId as ApplicationStage]?.[result.source.index];
    if (!application || application.stage === nextStage) {
      return;
    }

    patchApplicationMutation.mutate({
      id: application.id,
      payload: {
        stage: nextStage
      }
    });
  };

  useEffect(() => {
    if (!selectedApplication) {
      detailForm.reset({});
      return;
    }

    detailForm.reset({
      company: selectedApplication.company,
      role: selectedApplication.role,
      location: selectedApplication.location ?? "",
      url: selectedApplication.url ?? "",
      description: selectedApplication.description ?? "",
      notes: selectedApplication.notes ?? "",
      stage: selectedApplication.stage,
      appliedAt: selectedApplication.appliedAt ? new Date(selectedApplication.appliedAt) : null
    });
  }, [detailForm, selectedApplication]);

  useEffect(() => {
    const subscription = detailForm.watch((values, info) => {
      if (!selectedApplication || info.type !== "change") {
        return;
      }

      if (autoSaveTimeoutRef.current) {
        window.clearTimeout(autoSaveTimeoutRef.current);
      }

      autoSaveTimeoutRef.current = window.setTimeout(() => {
        patchApplicationMutation.mutate({
          id: selectedApplication.id,
          payload: applicationPatchSchema.parse(values)
        });
      }, 500);
    });

    return () => {
      subscription.unsubscribe();
      if (autoSaveTimeoutRef.current) {
        window.clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [detailForm, patchApplicationMutation, selectedApplication]);

  useEffect(() => {
    if (!importDraft) {
      return;
    }

    importConfirmForm.reset({
      company: importDraft.company ?? "",
      role: importDraft.role ?? "",
      location: importDraft.location ?? "",
      url: "",
      description: importDraft.description,
      notes: "",
      stage: "import_validating",
      appliedAt: null
    });
  }, [importConfirmForm, importDraft]);

  const applicationsByStage = useMemo(
    () =>
      stageOrder.reduce<Record<ApplicationStage, Application[]>>(
        (accumulator, stage) => ({
          ...accumulator,
          [stage.id]: applications.filter((application) => application.stage === stage.id)
        }),
        {
          import_validating: [],
          preparing_cv: [],
          preparing_letter: [],
          application_sent: [],
          pending: [],
          interview_1: [],
          interview_2: [],
          rejected: [],
          accepted: []
        }
      ),
    [applications]
  );

  const detailStage = detailForm.watch("stage") ?? selectedApplication?.stage ?? "import_validating";
  const detailUrl = detailForm.watch("url") ?? "";

  return (
    <main className={`${darkMode ? "dark" : ""}`}>
      <section className="min-h-screen bg-bg px-6 py-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BriefcaseBusiness size={20} />
            <h1 className="text-xl font-semibold">Job-Pal Board</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20"
              onClick={() => setImportModalOpen(true)}
            >
              <Plus size={16} />
              Import Job
            </button>
            <button
              type="button"
              className="rounded-md border border-black/15 p-2 dark:border-white/20"
              onClick={toggleDarkMode}
              aria-label="Toggle dark mode"
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>

        {applicationsQuery.isError ? (
          <div className="rounded-md border border-rose-400/50 bg-rose-500/10 p-3 text-sm text-rose-800 dark:text-rose-200">
            Applications konnten nicht geladen werden.
          </div>
        ) : null}

        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            {stageOrder.map((stage) => (
              <Droppable droppableId={stage.id} key={stage.id}>
                {(provided) => (
                  <article
                    className="rounded-xl border border-black/10 bg-surface p-3 shadow-sm dark:border-white/10"
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                  >
                    <header className="mb-3 flex items-center justify-between gap-2">
                      <h2 className="text-sm font-medium">{stage.title}</h2>
                      <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs dark:bg-white/20">
                        {applicationsByStage[stage.id].length}
                      </span>
                    </header>

                    <div className="space-y-2">
                      {applicationsByStage[stage.id].map((application, index) => (
                        <Draggable draggableId={application.id} index={index} key={application.id}>
                          {(draggableProvided) => (
                            <button
                              type="button"
                              ref={draggableProvided.innerRef}
                              {...draggableProvided.draggableProps}
                              {...draggableProvided.dragHandleProps}
                              className="w-full rounded-lg border border-black/10 bg-bg p-3 text-left shadow-sm transition hover:border-accent/50 hover:shadow dark:border-white/10"
                              onClick={() => {
                                setSelectedApplicationId(application.id);
                              }}
                            >
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  {faviconUrl(application.url) ? (
                                    <img
                                      src={faviconUrl(application.url) ?? ""}
                                      alt=""
                                      className="h-4 w-4 rounded-sm"
                                      loading="lazy"
                                    />
                                  ) : null}
                                  <strong className="text-sm">{application.company}</strong>
                                </div>
                                <span className={`rounded-full px-2 py-0.5 text-xs ${stageBadgeClassById[application.stage]}`}>
                                  {stageTitleById[application.stage]}
                                </span>
                              </div>
                              <p className="text-sm font-medium">{application.role}</p>
                              <p className="text-xs text-muted">{application.location ?? "Location unknown"}</p>
                              <p className="mt-2 text-xs text-muted">{formatDaysAgo(application)}</p>
                            </button>
                          )}
                        </Draggable>
                      ))}
                    </div>
                    {provided.placeholder}
                  </article>
                )}
              </Droppable>
            ))}
          </div>
        </DragDropContext>

        {applicationsQuery.isLoading ? (
          <p className="mt-4 text-sm text-muted">Lade Applications...</p>
        ) : null}

        {isImportModalOpen ? (
          <section className="fixed inset-0 z-20 flex items-center justify-center bg-black/35 p-4">
            <div className="w-full max-w-3xl rounded-xl border border-black/10 bg-surface p-5 shadow-xl dark:border-white/10">
              <header className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Import Job</h2>
                <button
                  type="button"
                  className="rounded-md border border-black/15 px-3 py-1 text-sm dark:border-white/20"
                  onClick={() => setImportModalOpen(false)}
                >
                  Schliessen
                </button>
              </header>

              {importStep === 1 ? (
                <form
                  className="space-y-4"
                  onSubmit={importInputForm.handleSubmit((values) => importMutation.mutate(values))}
                >
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={`rounded-md border px-3 py-1.5 text-sm transition ${importInputForm.watch("mode") === "url" ? "border-accent text-accent" : "border-black/15 dark:border-white/20"}`}
                      onClick={() => importInputForm.setValue("mode", "url")}
                    >
                      URL mode
                    </button>
                    <button
                      type="button"
                      className={`rounded-md border px-3 py-1.5 text-sm transition ${importInputForm.watch("mode") === "text" ? "border-accent text-accent" : "border-black/15 dark:border-white/20"}`}
                      onClick={() => importInputForm.setValue("mode", "text")}
                    >
                      Text mode
                    </button>
                  </div>
                  {importInputForm.watch("mode") === "url" ? (
                    <input
                      className="w-full rounded-md border border-black/15 bg-bg p-2 dark:border-white/20"
                      placeholder="https://..."
                      {...importInputForm.register("value")}
                    />
                  ) : (
                    <textarea
                      rows={10}
                      className="w-full rounded-md border border-black/15 bg-bg p-2 dark:border-white/20"
                      placeholder="Stellenbeschreibung einfügen..."
                      {...importInputForm.register("value")}
                    />
                  )}
                  <button
                    type="submit"
                    className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                    disabled={importMutation.isPending}
                  >
                    {importMutation.isPending ? "Extrahiere..." : "Weiter"}
                  </button>
                </form>
              ) : null}

              {importStep === 2 ? (
                <form
                  className="space-y-3"
                  onSubmit={importConfirmForm.handleSubmit((values) => createApplicationMutation.mutate(values))}
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-sm">
                      Firma
                      <input className="mt-1 w-full rounded-md border border-black/15 bg-bg p-2 dark:border-white/20" {...importConfirmForm.register("company")} />
                    </label>
                    <label className="text-sm">
                      Rolle
                      <input className="mt-1 w-full rounded-md border border-black/15 bg-bg p-2 dark:border-white/20" {...importConfirmForm.register("role")} />
                    </label>
                    <label className="text-sm">
                      Ort
                      <input className="mt-1 w-full rounded-md border border-black/15 bg-bg p-2 dark:border-white/20" {...importConfirmForm.register("location")} />
                    </label>
                    <label className="text-sm">
                      URL
                      <input className="mt-1 w-full rounded-md border border-black/15 bg-bg p-2 dark:border-white/20" {...importConfirmForm.register("url")} />
                    </label>
                  </div>
                  <label className="text-sm">
                    Beschreibung
                    <textarea
                      rows={8}
                      className="mt-1 w-full rounded-md border border-black/15 bg-bg p-2 dark:border-white/20"
                      {...importConfirmForm.register("description")}
                    />
                  </label>
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20"
                      onClick={() => setImportStep(1)}
                    >
                      Zurück
                    </button>
                    <button
                      type="submit"
                      className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                      disabled={createApplicationMutation.isPending}
                    >
                      {createApplicationMutation.isPending ? "Speichere..." : "Application speichern"}
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          </section>
        ) : null}

        {selectedApplication ? (
          <section className="fixed inset-0 z-20 flex justify-end bg-black/35 p-4">
            <div className="h-full w-full max-w-2xl overflow-y-auto rounded-xl border border-black/10 bg-surface p-5 shadow-xl dark:border-white/10">
              <header className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{selectedApplication.role}</h2>
                  <p className="text-sm text-muted">{selectedApplication.company}</p>
                </div>
                <button
                  type="button"
                  className="rounded-md border border-black/15 px-3 py-1 text-sm dark:border-white/20"
                  onClick={() => setSelectedApplicationId(null)}
                >
                  Schliessen
                </button>
              </header>

              <form className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-sm">
                    Firma
                    <input className="mt-1 w-full rounded-md border border-black/15 bg-bg p-2 dark:border-white/20" {...detailForm.register("company")} />
                  </label>
                  <label className="text-sm">
                    Rolle
                    <input className="mt-1 w-full rounded-md border border-black/15 bg-bg p-2 dark:border-white/20" {...detailForm.register("role")} />
                  </label>
                  <label className="text-sm">
                    Ort
                    <input className="mt-1 w-full rounded-md border border-black/15 bg-bg p-2 dark:border-white/20" {...detailForm.register("location")} />
                  </label>
                  <label className="text-sm">
                    URL
                    <input className="mt-1 w-full rounded-md border border-black/15 bg-bg p-2 dark:border-white/20" {...detailForm.register("url")} />
                  </label>
                </div>
                {detailUrl ? (
                  <a href={detailUrl} target="_blank" rel="noreferrer" className="text-sm text-accent underline">
                    Job-Link öffnen
                  </a>
                ) : null}
                <label className="text-sm">
                  Beschreibung
                  <textarea
                    rows={8}
                    className="mt-1 w-full rounded-md border border-black/15 bg-bg p-2 dark:border-white/20"
                    {...detailForm.register("description")}
                  />
                </label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-sm">
                    Stage
                    <select
                      className="mt-1 w-full rounded-md border border-black/15 bg-bg p-2 dark:border-white/20"
                      value={detailStage}
                      onChange={(event) => {
                        const stage = event.target.value as ApplicationStage;
                        detailForm.setValue("stage", stage, { shouldDirty: true });
                        if (stage === "application_sent" && !detailForm.getValues("appliedAt")) {
                          // Applied-Date wird automatisch beim Versand gesetzt.
                          detailForm.setValue("appliedAt", new Date(), { shouldDirty: true });
                        }
                      }}
                    >
                      {stageSelectOptions.map((stage) => (
                        <option key={stage} value={stage}>
                          {stageLabel(stage)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Applied Date
                    <input
                      type="date"
                      className="mt-1 w-full rounded-md border border-black/15 bg-bg p-2 dark:border-white/20"
                      value={toDateInputValue(detailForm.watch("appliedAt"))}
                      onChange={(event) =>
                        detailForm.setValue("appliedAt", parseDateInputValue(event.target.value), { shouldDirty: true })
                      }
                    />
                  </label>
                </div>
                <label className="text-sm">
                  Notes
                  <textarea
                    rows={6}
                    className="mt-1 w-full rounded-md border border-black/15 bg-bg p-2 dark:border-white/20"
                    {...detailForm.register("notes")}
                  />
                </label>

                <div className="rounded-lg border border-black/10 bg-bg p-3 dark:border-white/10">
                  <h3 className="text-sm font-semibold">Agent</h3>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <article className="rounded-md border border-black/10 p-3 dark:border-white/10">
                      <h4 className="text-sm font-medium">CV</h4>
                      <p className="text-xs text-muted">Not generated yet</p>
                      <button
                        type="button"
                        disabled
                        className="mt-2 rounded-md border border-black/10 px-2 py-1 text-xs opacity-60 dark:border-white/10"
                      >
                        Generate CV
                      </button>
                    </article>
                    <article className="rounded-md border border-black/10 p-3 dark:border-white/10">
                      <h4 className="text-sm font-medium">Motivation Letter</h4>
                      <p className="text-xs text-muted">Not generated yet</p>
                      <button
                        type="button"
                        disabled
                        className="mt-2 rounded-md border border-black/10 px-2 py-1 text-xs opacity-60 dark:border-white/10"
                      >
                        Generate Letter
                      </button>
                    </article>
                  </div>
                </div>
              </form>

              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-muted">
                  {patchApplicationMutation.isPending ? "Speichert..." : "Änderungen werden automatisch gespeichert."}
                </p>
                <button
                  type="button"
                  className="rounded-md border border-rose-500/40 px-3 py-2 text-sm text-rose-600"
                  onClick={() => deleteApplicationMutation.mutate(selectedApplication.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BoardPage />
    </QueryClientProvider>
  );
}
