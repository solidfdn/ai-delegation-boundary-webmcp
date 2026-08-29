import {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import { initialWorkspace } from "./domains/universal-demo";

import type {
  Decision,
  DecisionPatch,
  EvidenceLevel,
  Level,
  PatchConditions,
  PatchSimulation,
  WorkspaceState
} from "./core/types";

import {
  generateCandidatePatches,
  generateEvaluationSet,
  simulatePatch
} from "./core/decisionEngine";

import {
  registerDecisionPatchTools,
  registerPublishReadyPatchTool,
  type DecisionPatchToolActions
} from "./webmcp/registerTools";

import { copy } from "./i18n/copy";
import "./styles.css";
import "./visual-polish.css";

const LEVELS: Level[] = ["LOW", "MEDIUM", "HIGH"];
const EVIDENCE_LEVELS: EvidenceLevel[] = [
  "WEAK",
  "PARTIAL",
  "STRONG"
];

type ActivityActor = "AGENT" | "YOU" | "SYSTEM";

interface ActivityEvent {
  id: number;
  actor: ActivityActor;
  en: string;
  ja: string;
}

export default function App() {
  const [lang, setLang] = useState<"en" | "ja">("en");

  const [workspace, setWorkspace] =
    useState<WorkspaceState>(initialWorkspace);

  const [webmcpToolCount, setWebmcpToolCount] =
    useState(0);

  const [publishToolAvailable, setPublishToolAvailable] =
    useState(false);

  const [readyPatchId, setReadyPatchId] =
    useState<string | null>(null);

  const [publishedPatchId, setPublishedPatchId] =
    useState<string | null>(null);

  const [patches, setPatches] =
    useState<DecisionPatch[]>([]);

  const [simulations, setSimulations] =
    useState<Record<string, PatchSimulation>>({});

  const [selectedPatchId, setSelectedPatchId] =
    useState<string | null>(null);

  const [lastHumanEdit, setLastHumanEdit] =
    useState<string | null>(null);

  const [simulationBaselines, setSimulationBaselines] =
    useState<Record<string, PatchSimulation>>({});

  const [activity, setActivity] =
    useState<ActivityEvent[]>([]);

  const evaluationSet = useMemo(
    () => generateEvaluationSet(),
    []
  );

  const workspaceRef = useRef(workspace);
  const patchesRef = useRef(patches);
  const simulationsRef = useRef(simulations);
  const selectedPatchIdRef = useRef(selectedPatchId);
  const readyPatchIdRef = useRef(readyPatchId);
  const publishedPatchIdRef = useRef(publishedPatchId);
  const lastHumanEditRef = useRef(lastHumanEdit);
  const simulationBaselinesRef =
    useRef(simulationBaselines);
  const activityRef = useRef(activity);
  const activitySequenceRef = useRef(0);

  workspaceRef.current = workspace;
  patchesRef.current = patches;
  simulationsRef.current = simulations;
  selectedPatchIdRef.current = selectedPatchId;
  readyPatchIdRef.current = readyPatchId;
  publishedPatchIdRef.current = publishedPatchId;
  lastHumanEditRef.current = lastHumanEdit;
  simulationBaselinesRef.current =
    simulationBaselines;
  activityRef.current = activity;

  const replacePatches = (next: DecisionPatch[]) => {
    patchesRef.current = next;
    setPatches(next);
  };

  const replaceSimulations = (
    next: Record<string, PatchSimulation>
  ) => {
    simulationsRef.current = next;
    setSimulations(next);
  };

  const selectPatch = (patchId: string | null) => {
    selectedPatchIdRef.current = patchId;
    setSelectedPatchId(patchId);
  };

  const markReady = (patchId: string | null) => {
    readyPatchIdRef.current = patchId;
    setReadyPatchId(patchId);
  };

  const markPublished = (patchId: string | null) => {
    publishedPatchIdRef.current = patchId;
    setPublishedPatchId(patchId);
  };

  const noteHumanEdit = (message: string | null) => {
    lastHumanEditRef.current = message;
    setLastHumanEdit(message);
  };

  const replaceSimulationBaselines = (
    next: Record<string, PatchSimulation>
  ) => {
    simulationBaselinesRef.current = next;
    setSimulationBaselines(next);
  };

  const replaceActivity = (
    next: ActivityEvent[]
  ) => {
    activityRef.current = next;
    setActivity(next);
  };

  const addActivity = (
    actor: ActivityActor,
    en: string,
    ja: string
  ) => {
    activitySequenceRef.current += 1;

    const event: ActivityEvent = {
      id: activitySequenceRef.current,
      actor,
      en,
      ja
    };

    replaceActivity(
      [...activityRef.current, event].slice(-8)
    );
  };

  const summarizePatch = (patch: DecisionPatch) => ({
    id: patch.id,
    scope: patch.scope,
    outcome: patch.outcome,
    conditions: patch.conditions,
    simulation_status:
      simulationsRef.current[patch.id]
        ? "CURRENT"
        : "NOT_SIMULATED"
  });

  const summarizeSimulation = (
    result: PatchSimulation
  ) => ({
    patch_id: result.patchId,
    evaluated_combinations: result.total,
    decisions_changed: result.changed,
    aligned_with_synthetic_reference: result.aligned,
    counterexamples: result.counterexamples,
    human_reviews_transitioned:
      result.reviewsTransitioned,
    example_counterexamples:
      result.counterexampleCases.slice(0, 3).map((c) => ({
        id: c.id,
        urgency: c.urgency,
        evidence: c.evidenceStrength,
        potential_harm: c.potentialHarm,
        vulnerability: c.vulnerability,
        continuity_impact: c.continuityImpact,
        baseline: c.baselineDecision,
        synthetic_reference: c.referenceDecision
      }))
  });

  const toolActions: DecisionPatchToolActions = {
    inspectWorkspace: () => ({
      status: "success",
      workspace: {
        observed_case: workspaceRef.current.observedCase,
        agent_decision:
          workspaceRef.current.agentDecision,
        human_correction:
          workspaceRef.current.humanCorrection,
        precedent_recorded:
          workspaceRef.current.precedentRecorded,
        selected_patch_id:
          selectedPatchIdRef.current,
        candidate_patches:
          patchesRef.current.map(summarizePatch),
        simulations:
          Object.values(
            simulationsRef.current
          ).map(summarizeSimulation),
        ready_patch_id:
          readyPatchIdRef.current,
        published_patch_id:
          publishedPatchIdRef.current,
        last_human_edit:
          lastHumanEditRef.current,
        activity:
          activityRef.current
      },
      note:
        "Synthetic demonstration environment. No candidate patch is published by these tools."
    }),

    draftPatches: () => {
      const current = workspaceRef.current;

      if (!current.precedentRecorded) {
        return {
          status: "blocked",
          message:
            "No human precedent has been recorded. Ask the user to record a correction in the shared page before drafting Decision Patches."
        };
      }

      const next =
        generateCandidatePatches(current);

      replacePatches(next);
      replaceSimulations({});
      replaceSimulationBaselines({});
      markReady(null);
      markPublished(null);
      noteHumanEdit(null);

      addActivity(
        "AGENT",
        "Agent drafted three candidate patches.",
        "Agentが3つの候補パッチを生成"
      );

      const balanced =
        next.find(
          (patch) => patch.scope === "BALANCED"
        ) ?? next[0];

      selectPatch(balanced?.id ?? null);

      return {
        status: "success",
        message:
          "Created three candidate Decision Patches. No rule has been published.",
        patches: next.map(summarizePatch),
        next_step:
          "Simulate candidate patches before comparing or recommending a generalization boundary."
      };
    },

    simulatePatch: (patchId: string) => {
      const patch =
        patchesRef.current.find(
          (candidate) => candidate.id === patchId
        );

      if (!patch) {
        return {
          status: "error",
          message:
            `Patch "${patchId}" does not exist. Inspect the workspace or draft candidate patches first.`
        };
      }

      const result =
        simulatePatch(patch, evaluationSet);

      const nextSimulations = {
        ...simulationsRef.current,
        [patchId]: result
      };

      replaceSimulations(nextSimulations);
      selectPatch(patchId);

      if (
        simulationBaselinesRef.current[patchId]
      ) {
        addActivity(
          "AGENT",
          "Agent replayed the revised human boundary.",
          "Agentが人の変更後の境界を再評価"
        );
      }

      return {
        status: "success",
        patch: summarizePatch(patch),
        simulation: summarizeSimulation(result),
        human_edit_context:
          lastHumanEditRef.current,
        note:
          "Results are deterministic counts over the complete synthetic combination matrix, not estimates of real-world frequency or business impact."
      };
    },

    comparePatches: (patchIds?: string[]) => {
      const ids =
        patchIds?.length
          ? patchIds
          : patchesRef.current.map(
              (patch) => patch.id
            );

      const missing = ids.filter(
        (id) => !simulationsRef.current[id]
      );

      if (missing.length > 0) {
        return {
          status: "blocked",
          message:
            "Comparison requires current simulation results for every requested patch.",
          missing_simulations: missing,
          next_step:
            "Simulate the missing patches first."
        };
      }

      if (ids.length < 2) {
        return {
          status: "blocked",
          message:
            "At least two simulated patches are required for comparison."
        };
      }

      const comparison = ids.map((id) => {
        const patch =
          patchesRef.current.find(
            (candidate) => candidate.id === id
          );

        const result =
          simulationsRef.current[id];

        return {
          patch:
            patch
              ? summarizePatch(patch)
              : { id },
          simulation:
            summarizeSimulation(result)
        };
      });

      return {
        status: "success",
        comparison,
        interpretation_guardrail:
          "These metrics expose trade-offs. They do not constitute an autonomous recommendation or authorization to publish."
      };
    },

    revisePatch: (
      patchId: string,
      changes: Partial<PatchConditions>,
      clearConditions: string[]
    ) => {
      const index =
        patchesRef.current.findIndex(
          (candidate) => candidate.id === patchId
        );

      if (index < 0) {
        return {
          status: "error",
          message:
            `Patch "${patchId}" does not exist. Inspect the workspace or draft candidate patches first.`
        };
      }

      const patch = patchesRef.current[index];

      const conditions: PatchConditions = {
        ...patch.conditions
      };

      for (const key of clearConditions) {
        if (
          key === "urgencyAtLeast" ||
          key === "evidenceAtLeast" ||
          key === "vulnerabilityAtLeast" ||
          key === "potentialHarmAtMost" ||
          key === "continuityAtLeast"
        ) {
          delete conditions[key];
        }
      }

      Object.assign(conditions, changes);

      const revised: DecisionPatch = {
        ...patch,
        conditions
      };

      const nextPatches =
        patchesRef.current.map(
          (candidate) =>
            candidate.id === patchId
              ? revised
              : candidate
        );

      replacePatches(nextPatches);
      selectPatch(patchId);

      const previousSimulation =
        simulationsRef.current[patchId];

      if (previousSimulation) {
        replaceSimulationBaselines({
          ...simulationBaselinesRef.current,
          [patchId]: previousSimulation
        });
      }

      const nextSimulations = {
        ...simulationsRef.current
      };

      delete nextSimulations[patchId];

      replaceSimulations(nextSimulations);

      addActivity(
        "AGENT",
        `Agent revised ${patch.scope}.`,
        `Agentが${patch.scope}の条件を修正`
      );

      if (
        readyPatchIdRef.current === patchId
      ) {
        markReady(null);
      }

      return {
        status: "success",
        patch: summarizePatch(revised),
        simulation_status:
          "STALE_REPLAY_REQUIRED",
        message:
          "The shared candidate patch was revised. Its previous simulation was invalidated.",
        next_step:
          "Simulate this revised patch before comparing or publishing it."
      };
    },

    publishReadyPatch: () => {
      const patchId =
        readyPatchIdRef.current;

      if (!patchId) {
        return {
          status: "blocked",
          message:
            "No Decision Patch has been marked ready by the human."
        };
      }

      const patch =
        patchesRef.current.find(
          (candidate) =>
            candidate.id === patchId
        );

      const simulation =
        simulationsRef.current[patchId];

      if (!patch || !simulation) {
        markReady(null);

        return {
          status: "blocked",
          message:
            "The ready patch no longer has a current simulation. It must be simulated again before publication."
        };
      }

      markPublished(patchId);
      markReady(null);

      addActivity(
        "AGENT",
        `Agent published ${patch.scope} after human authorization.`,
        `人の明示承認後、Agentが${patch.scope}を公開`
      );

      return {
        status: "success",
        message:
          "Published the exact Decision Patch previously marked ready by the human.",
        published_patch:
          summarizePatch(patch),
        simulation:
          summarizeSimulation(simulation),
        human_authorization:
          "Explicitly marked ready in the shared page before this tool became available."
      };
    }
  };

  useEffect(() => {
    return registerDecisionPatchTools(
      toolActions,
      setWebmcpToolCount
    );
  }, []);

  useEffect(() => {
    if (!readyPatchId) {
      setPublishToolAvailable(false);
      return;
    }

    return registerPublishReadyPatchTool(
      toolActions,
      setPublishToolAvailable
    );
  }, [readyPatchId]);

  const t = copy[lang];
  const c = workspace.observedCase;

  const selectedPatch =
    patches.find(
      (patch) => patch.id === selectedPatchId
    ) ?? null;

  const selectedSimulation =
    selectedPatchId
      ? simulations[selectedPatchId]
      : undefined;

  const setDecision = (decision: Decision) => {
    setWorkspace((current) => ({
      ...current,
      humanCorrection: {
        ...current.humanCorrection,
        decision
      }
    }));
  };

  const recordCorrection = () => {
    setWorkspace((current) => ({
      ...current,
      precedentRecorded:
        current.humanCorrection.useAsPrecedent
    }));

    replacePatches([]);
    replaceSimulations({});
    replaceSimulationBaselines({});
    selectPatch(null);
    markReady(null);
    markPublished(null);
    noteHumanEdit(null);

    replaceActivity([]);

    addActivity(
      "YOU",
      `You corrected ${workspace.agentDecision} → ${workspace.humanCorrection.decision}.`,
      `人が ${workspace.agentDecision} → ${workspace.humanCorrection.decision} に修正`
    );
  };

  const runSimulation = () => {
    const drafted =
      toolActions.draftPatches() as {
        status?: string;
        patches?: Array<{ id: string }>;
      };

    if (
      drafted.status !== "success" ||
      !drafted.patches?.length
    ) {
      return;
    }

    for (const patch of drafted.patches) {
      toolActions.simulatePatch(patch.id);
    }

    const balanced =
      patchesRef.current.find(
        (patch) => patch.scope === "BALANCED"
      );

    if (balanced) {
      selectPatch(balanced.id);
    }
  };

  const formatCondition = (
    key: string,
    value: string
  ) => {
    const labels: Record<string, string> = {
      urgencyAtLeast:
        lang === "ja"
          ? "緊急度 ≥"
          : "Urgency ≥",
      evidenceAtLeast:
        lang === "ja"
          ? "根拠 ≥"
          : "Evidence ≥",
      vulnerabilityAtLeast:
        lang === "ja"
          ? "脆弱性 ≥"
          : "Vulnerability ≥",
      potentialHarmAtMost:
        lang === "ja"
          ? "潜在的損害 ≤"
          : "Potential harm ≤",
      continuityAtLeast:
        lang === "ja"
          ? "継続影響 ≥"
          : "Continuity impact ≥"
    };

    return `${labels[key] ?? key} ${value}`;
  };

  const updateSelectedCondition = (
    key: keyof PatchConditions,
    value: string
  ) => {
    if (
      !selectedPatch ||
      publishedPatchId === selectedPatch.id
    ) {
      return;
    }

    const conditions: PatchConditions = {
      ...selectedPatch.conditions
    };

    const before =
      conditions[key] ?? "ANY";

    switch (key) {
      case "urgencyAtLeast":
        if (value) {
          conditions.urgencyAtLeast =
            value as Level;
        } else {
          delete conditions.urgencyAtLeast;
        }
        break;

      case "evidenceAtLeast":
        if (value) {
          conditions.evidenceAtLeast =
            value as EvidenceLevel;
        } else {
          delete conditions.evidenceAtLeast;
        }
        break;

      case "vulnerabilityAtLeast":
        if (value) {
          conditions.vulnerabilityAtLeast =
            value as Level;
        } else {
          delete conditions.vulnerabilityAtLeast;
        }
        break;

      case "potentialHarmAtMost":
        if (value) {
          conditions.potentialHarmAtMost =
            value as Level;
        } else {
          delete conditions.potentialHarmAtMost;
        }
        break;

      case "continuityAtLeast":
        if (value) {
          conditions.continuityAtLeast =
            value as Level;
        } else {
          delete conditions.continuityAtLeast;
        }
        break;
    }

    const revised: DecisionPatch = {
      ...selectedPatch,
      conditions
    };

    const previousSimulation =
      simulationsRef.current[revised.id];

    if (previousSimulation) {
      replaceSimulationBaselines({
        ...simulationBaselinesRef.current,
        [revised.id]: previousSimulation
      });
    }

    replacePatches(
      patchesRef.current.map((patch) =>
        patch.id === revised.id
          ? revised
          : patch
      )
    );

    const nextSimulations = {
      ...simulationsRef.current
    };

    delete nextSimulations[revised.id];
    replaceSimulations(nextSimulations);

    if (
      readyPatchIdRef.current === revised.id
    ) {
      markReady(null);
    }

    const label =
      formatCondition(key, "")
        .trim();

    const editMessage =
      `${label}: ${String(before)} → ${
        value || "ANY"
      }`;

    noteHumanEdit(editMessage);

    addActivity(
      "YOU",
      `You changed ${editMessage}.`,
      `人が ${editMessage} に変更`
    );
  };

  const toggleReady = (
    patchId: string
  ) => {
    if (readyPatchIdRef.current === patchId) {
      markReady(null);

      addActivity(
        "YOU",
        "You withdrew publication readiness.",
        "人が公開準備状態を解除"
      );

      return;
    }

    markReady(patchId);

    const patch =
      patchesRef.current.find(
        (candidate) =>
          candidate.id === patchId
      );

    addActivity(
      "YOU",
      `You marked ${patch?.scope ?? patchId} ready to publish.`,
      `人が${patch?.scope ?? patchId}を公開準備完了に設定`
    );
  };

  const resetDemo = () => {
    const resetWorkspace: WorkspaceState = {
      ...initialWorkspace,
      observedCase: {
        ...initialWorkspace.observedCase
      },
      humanCorrection: {
        ...initialWorkspace.humanCorrection
      }
    };

    workspaceRef.current = resetWorkspace;
    setWorkspace(resetWorkspace);

    replacePatches([]);
    replaceSimulations({});
    replaceSimulationBaselines({});
    selectPatch(null);
    markReady(null);
    markPublished(null);
    noteHumanEdit(null);
    replaceActivity([]);

    activitySequenceRef.current = 0;
  };

  const selectedBaseline =
    selectedPatchId
      ? simulationBaselines[selectedPatchId]
      : undefined;

  const impactDelta =
    selectedSimulation &&
    selectedBaseline
      ? {
          changed:
            selectedSimulation.changed -
            selectedBaseline.changed,
          aligned:
            selectedSimulation.aligned -
            selectedBaseline.aligned,
          counterexamples:
            selectedSimulation.counterexamples -
            selectedBaseline.counterexamples,
          reviews:
            selectedSimulation.reviewsTransitioned -
            selectedBaseline.reviewsTransitioned
        }
      : null;

  const deltaLabel = (value: number) =>
    `${value > 0 ? "+" : ""}${value}`;

  const renderLevelOptions = () => (
    <>
      <option value="">ANY</option>
      {LEVELS.map((level) => (
        <option key={level} value={level}>
          {level}
        </option>
      ))}
    </>
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">SOLIFAN</div>
        <div className="divider" />
        <div className="product">
          Decision Patch
        </div>
        <div className="tagline">
          A pull request for agent decisions.
        </div>

        <button
          className="resetButton"
          onClick={resetDemo}
        >
          {lang === "ja"
            ? "デモをリセット"
            : "Reset demo"}
        </button>

        <div className="language">
          <button
            className={
              lang === "en" ? "active" : ""
            }
            onClick={() => setLang("en")}
          >
            EN
          </button>

          <span>/</span>

          <button
            className={
              lang === "ja" ? "active" : ""
            }
            onClick={() => setLang("ja")}
          >
            日本語
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="leftPanel panel">
          <div className="sectionLabel">
            1&nbsp;&nbsp;{t.input}
          </div>

          <div className="card">
            <div className="cardTitle">
              {t.observed}
            </div>

            <dl className="facts">
              <div>
                <dt>ID</dt>
                <dd>{c.id}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{c.caseType}</dd>
              </div>
              <div>
                <dt>Urgency</dt>
                <dd>{c.urgency}</dd>
              </div>
              <div>
                <dt>Evidence</dt>
                <dd>{c.evidenceStrength}</dd>
              </div>
              <div>
                <dt>Potential harm</dt>
                <dd>{c.potentialHarm}</dd>
              </div>
              <div>
                <dt>Vulnerability</dt>
                <dd>{c.vulnerability}</dd>
              </div>
              <div>
                <dt>Continuity</dt>
                <dd>{c.continuityImpact}</dd>
              </div>
            </dl>
          </div>

          <div className="card">
            <div className="cardTitle">
              {t.agentBefore}
            </div>

            <div className="decision before">
              {workspace.agentDecision}
            </div>
          </div>

          <div className="card correctionCard">
            <label>{t.correction}</label>

            <select
              value={
                workspace.humanCorrection.decision
              }
              onChange={(e) =>
                setDecision(
                  e.target.value as Decision
                )
              }
            >
              <option value="APPROVE">
                APPROVE
              </option>
              <option value="HUMAN_REVIEW">
                HUMAN_REVIEW
              </option>
              <option value="DECLINE">
                DECLINE
              </option>
            </select>

            <label>{t.rationale}</label>

            <textarea
              value={
                workspace.humanCorrection.rationale
              }
              onChange={(e) =>
                setWorkspace((current) => ({
                  ...current,
                  humanCorrection: {
                    ...current.humanCorrection,
                    rationale: e.target.value
                  }
                }))
              }
            />

            <label className="checkboxRow">
              <input
                type="checkbox"
                checked={
                  workspace.humanCorrection
                    .useAsPrecedent
                }
                onChange={(e) =>
                  setWorkspace((current) => ({
                    ...current,
                    humanCorrection: {
                      ...current.humanCorrection,
                      useAsPrecedent:
                        e.target.checked
                    }
                  }))
                }
              />
              {t.precedent}
            </label>

            <button
              className="primary"
              onClick={recordCorrection}
            >
              {t.record}
            </button>

            {workspace.precedentRecorded && (
              <button
                className="secondaryAction"
                onClick={runSimulation}
              >
                {t.simulate}
              </button>
            )}
          </div>
        </section>

        <section className="centerPanel">
          <div className="hero">
            <h1>{t.title}</h1>
            <p>{t.subtitle}</p>
          </div>

          <div className="panel impactPanel">
            <div className="sectionLabel">
              2&nbsp;&nbsp;{t.impact}
            </div>

            {!workspace.precedentRecorded && (
              <div className="emptyState">
                {t.impactEmpty}
              </div>
            )}

            {workspace.precedentRecorded &&
              patches.length === 0 && (
                <div className="precedentState">
                  <div className="shift">
                    <span>
                      {workspace.agentDecision}
                    </span>
                    <span className="arrow">
                      →
                    </span>
                    <strong>
                      {
                        workspace.humanCorrection
                          .decision
                      }
                    </strong>
                  </div>

                  <p>
                    {
                      workspace.humanCorrection
                        .rationale
                    }
                  </p>

                  <div className="honesty">
                    Observed correction only. No
                    generalized rule has been
                    published.
                  </div>
                </div>
              )}

            {selectedPatch && (
              <div className="boundaryEditor">
                <div className="editorHeader">
                  <div>
                    <span className="eyebrow">
                      {lang === "ja"
                        ? "人が直接調整"
                        : "HUMAN EDIT"}
                    </span>

                    <strong>
                      {lang === "ja"
                        ? "一般化する範囲を調整"
                        : "Adjust the generalization boundary"}
                    </strong>
                  </div>

                  <span
                    className={`simulationStatus ${
                      selectedSimulation
                        ? "current"
                        : "stale"
                    }`}
                  >
                    {selectedSimulation
                      ? "SIMULATION CURRENT"
                      : "REPLAY REQUIRED"}
                  </span>
                </div>

                <div className="editorGrid">
                  <label>
                    <span>
                      {lang === "ja"
                        ? "緊急度"
                        : "Urgency"}
                    </span>
                    <select
                      value={
                        selectedPatch.conditions
                          .urgencyAtLeast ?? ""
                      }
                      disabled={
                        publishedPatchId ===
                        selectedPatch.id
                      }
                      onChange={(e) =>
                        updateSelectedCondition(
                          "urgencyAtLeast",
                          e.target.value
                        )
                      }
                    >
                      {renderLevelOptions()}
                    </select>
                  </label>

                  <label>
                    <span>
                      {lang === "ja"
                        ? "根拠"
                        : "Evidence"}
                    </span>
                    <select
                      value={
                        selectedPatch.conditions
                          .evidenceAtLeast ?? ""
                      }
                      disabled={
                        publishedPatchId ===
                        selectedPatch.id
                      }
                      onChange={(e) =>
                        updateSelectedCondition(
                          "evidenceAtLeast",
                          e.target.value
                        )
                      }
                    >
                      <option value="">ANY</option>
                      {EVIDENCE_LEVELS.map(
                        (level) => (
                          <option
                            key={level}
                            value={level}
                          >
                            {level}
                          </option>
                        )
                      )}
                    </select>
                  </label>

                  <label>
                    <span>
                      {lang === "ja"
                        ? "脆弱性"
                        : "Vulnerability"}
                    </span>
                    <select
                      value={
                        selectedPatch.conditions
                          .vulnerabilityAtLeast ??
                        ""
                      }
                      disabled={
                        publishedPatchId ===
                        selectedPatch.id
                      }
                      onChange={(e) =>
                        updateSelectedCondition(
                          "vulnerabilityAtLeast",
                          e.target.value
                        )
                      }
                    >
                      {renderLevelOptions()}
                    </select>
                  </label>

                  <label>
                    <span>
                      {lang === "ja"
                        ? "潜在的損害"
                        : "Potential harm"}
                    </span>
                    <select
                      value={
                        selectedPatch.conditions
                          .potentialHarmAtMost ??
                        ""
                      }
                      disabled={
                        publishedPatchId ===
                        selectedPatch.id
                      }
                      onChange={(e) =>
                        updateSelectedCondition(
                          "potentialHarmAtMost",
                          e.target.value
                        )
                      }
                    >
                      {renderLevelOptions()}
                    </select>
                  </label>

                  <label>
                    <span>
                      {lang === "ja"
                        ? "継続影響"
                        : "Continuity impact"}
                    </span>
                    <select
                      value={
                        selectedPatch.conditions
                          .continuityAtLeast ?? ""
                      }
                      disabled={
                        publishedPatchId ===
                        selectedPatch.id
                      }
                      onChange={(e) =>
                        updateSelectedCondition(
                          "continuityAtLeast",
                          e.target.value
                        )
                      }
                    >
                      {renderLevelOptions()}
                    </select>
                  </label>
                </div>

                {lastHumanEdit && (
                  <div className="humanEditNote">
                    <strong>
                      {lang === "ja"
                        ? "人の変更"
                        : "Human changed"}
                    </strong>

                    <span>
                      {lastHumanEdit}
                    </span>

                    {!selectedSimulation && (
                      <small>
                        {lang === "ja"
                          ? "以前のシミュレーションは失効しました。Agentはこの最新状態を読み、再評価できます。"
                          : "The prior simulation was invalidated. The agent can inspect this latest state and re-simulate it."}
                      </small>
                    )}
                  </div>
                )}
              </div>
            )}

            {selectedPatch &&
              !selectedSimulation &&
              patches.length > 0 && (
                <div className="staleState">
                  <strong>
                    {lang === "ja"
                      ? "再シミュレーションが必要です"
                      : "Re-simulation required"}
                  </strong>
                  <span>
                    {lang === "ja"
                      ? "人が一般化条件を変更したため、以前の結果は意図的に非表示にしています。"
                      : "The human changed the generalization boundary, so the previous result is intentionally hidden."}
                  </span>
                </div>
              )}
            {selectedPatch &&
              selectedSimulation && (
                <div className="simulation">
                  <div className="simulationIntro">
                    <div>
                      <span className="eyebrow">
                        {t.selected}
                      </span>
                      <strong>
                        {selectedPatch.scope}
                      </strong>
                    </div>

                    <div className="matrixNote">
                      {t.evaluation}:{" "}
                      <strong>
                        {
                          selectedSimulation.total
                        }
                      </strong>{" "}
                      combinations
                    </div>
                  </div>

                  <div className="metricsGrid">
                    <div>
                      <span>{t.changed}</span>
                      <strong>
                        {
                          selectedSimulation.changed
                        }
                      </strong>
                    </div>

                    <div>
                      <span>{t.aligned}</span>
                      <strong>
                        {
                          selectedSimulation.aligned
                        }
                      </strong>
                    </div>

                    <div>
                      <span>
                        {t.counterexamples}
                      </span>
                      <strong className="danger">
                        {
                          selectedSimulation
                            .counterexamples
                        }
                      </strong>
                    </div>

                    <div>
                      <span>{t.reviews}</span>
                      <strong>
                        {
                          selectedSimulation
                            .reviewsTransitioned
                        }
                      </strong>
                    </div>
                  </div>

                  {impactDelta && lastHumanEdit && (
                    <div className="impactDelta">
                      <div className="deltaIntro">
                        <span className="eyebrow">
                          {lang === "ja"
                            ? "人の変更による差分"
                            : "WHAT YOUR EDIT CHANGED"}
                        </span>

                        <strong>
                          {lastHumanEdit}
                        </strong>
                      </div>

                      <div className="deltaMetrics">
                        <div>
                          <span>
                            {lang === "ja"
                              ? "影響する判断"
                              : "Affected decisions"}
                          </span>
                          <strong>
                            {deltaLabel(
                              impactDelta.changed
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            {lang === "ja"
                              ? "参照判断との一致"
                              : "Reference aligned"}
                          </span>
                          <strong>
                            {deltaLabel(
                              impactDelta.aligned
                            )}
                          </strong>
                        </div>

                        <div
                          className={
                            impactDelta.counterexamples >
                            0
                              ? "deltaRisk"
                              : ""
                          }
                        >
                          <span>
                            {lang === "ja"
                              ? "新たな反例"
                              : "Counterexamples"}
                          </span>
                          <strong>
                            {deltaLabel(
                              impactDelta.counterexamples
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            {lang === "ja"
                              ? "人レビューから移る判断"
                              : "Reviews transitioned"}
                          </span>
                          <strong>
                            {deltaLabel(
                              impactDelta.reviews
                            )}
                          </strong>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="counterexampleArea">
                    <div className="cardTitle">
                      {t.counterexamples}
                    </div>

                    {selectedSimulation
                      .counterexampleCases
                      .length === 0 ? (
                      <p>
                        {t.noCounterexamples}
                      </p>
                    ) : (
                      selectedSimulation
                        .counterexampleCases
                        .slice(0, 3)
                        .map((item) => (
                          <div
                            className="counterexample"
                            key={item.id}
                          >
                            <div>
                              <strong>
                                {item.id}
                              </strong>
                              <span>
                                {item.urgency} urgency ·{" "}
                                {
                                  item.evidenceStrength
                                }{" "}
                                evidence
                              </span>
                            </div>

                            <div>
                              <span>
                                {
                                  item.baselineDecision
                                }
                              </span>
                              <span>→</span>
                              <strong>
                                {
                                  selectedPatch.outcome
                                }
                              </strong>
                            </div>

                            <small>
                              Synthetic reference:{" "}
                              {
                                item.referenceDecision
                              }
                            </small>
                          </div>
                        ))
                    )}
                  </div>

                  <div className="publishControls">
                    {publishedPatchId ===
                    selectedPatch.id ? (
                      <div className="publishedState">
                        <strong>
                          Published policy
                        </strong>
                        <span>
                          This candidate is now the active demo policy.
                        </span>
                      </div>
                    ) : (
                      <button
                        className={
                          readyPatchId ===
                          selectedPatch.id
                            ? "readyAction active"
                            : "readyAction"
                        }
                        onClick={() =>
                          toggleReady(
                            selectedPatch.id
                          )
                        }
                      >
                        {readyPatchId ===
                        selectedPatch.id
                          ? "✓ Ready — publish tool unlocked"
                          : "Mark this patch ready"}
                      </button>
                    )}
                  </div>

                  <div className="honesty">
                    Counts describe the complete
                    synthetic combination matrix used
                    for this demo. They are not
                    estimates of real-world frequency
                    or business impact.
                  </div>
                </div>
              )}
          </div>

          {activity.length > 0 && (
            <div className="activityPanel">
              <div className="activityHeader">
                <span className="sectionLabel">
                  ACTIVITY
                </span>

                <span>
                  Human × Agent
                </span>
              </div>

              <div className="activityRows">
                {activity
                  .slice(-5)
                  .map((event) => (
                    <div
                      className="activityRow"
                      key={event.id}
                    >
                      <span
                        className={`activityActor ${event.actor.toLowerCase()}`}
                      >
                        {event.actor}
                      </span>

                      <p>
                        {lang === "ja"
                          ? event.ja
                          : event.en}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </section>

        <section className="rightPanel panel">
          <div className="sectionLabel">
            3&nbsp;&nbsp;{t.candidates}
          </div>

          {patches.length === 0 ? (
            <div className="emptyState">
              {t.candidatesEmpty}
            </div>
          ) : (
            <div className="patchList">
              {patches.map((patch) => {
                const result =
                  simulations[patch.id];

                const selected =
                  patch.id === selectedPatchId;

                return (
                  <button
                    key={patch.id}
                    className={`patchCard ${
                      selected
                        ? "selected"
                        : ""
                    }`}
                    onClick={() =>
                      selectPatch(patch.id)
                    }
                  >
                    <div className="patchHeader">
                      <strong>
                        {patch.scope}
                      </strong>

                      {result && (
                        <span>
                          {result.changed} /{" "}
                          {result.total}
                        </span>
                      )}
                    </div>

                    <div className="conditions">
                      {Object.entries(
                        patch.conditions
                      ).map(
                        ([key, value]) => (
                          <span key={key}>
                            {formatCondition(
                              key,
                              String(value)
                            )}
                          </span>
                        )
                      )}
                    </div>

                    <div className="patchOutcome">
                      → {patch.outcome}
                    </div>

                    {readyPatchId === patch.id && (
                      <div className="patchBadge ready">
                        HUMAN READY
                      </div>
                    )}

                    {publishedPatchId === patch.id && (
                      <div className="patchBadge published">
                        PUBLISHED
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="webmcpCard">
            <div>
              <strong>WebMCP tools</strong>

              <span
                className={
                  webmcpToolCount > 0
                    ? "status available"
                    : "status unavailable"
                }
              >
                {webmcpToolCount > 0
                  ? `${webmcpToolCount +
                      (publishToolAvailable ? 1 : 0)} LIVE`
                  : "NOT DETECTED"}
              </span>
            </div>

            <p>
              {webmcpToolCount > 0
                ? publishToolAvailable
                  ? "Human ready state detected. The publish tool is now available to the agent."
                  : "The agent can inspect, draft, simulate, compare, and revise. Publish remains unavailable until a human marks one patch ready."
                : t.unavailable}
            </p>
          </div>
        </section>
      </main>

      <footer>
        <div className="lime">
          Every correction is a lesson.
          <br />
          Every lesson can improve the next
          decision.
        </div>

        <div className="navy">
          <strong>SOLIFAN</strong>
          <span>
            Foundations empower challenges.
          </span>
          <span>
            SYNTHETIC DATA FOR DEMONSTRATION ONLY
          </span>
        </div>
      </footer>
    </div>
  );
}




