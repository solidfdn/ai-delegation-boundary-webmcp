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

  workspaceRef.current = workspace;
  patchesRef.current = patches;
  simulationsRef.current = simulations;
  selectedPatchIdRef.current = selectedPatchId;
  readyPatchIdRef.current = readyPatchId;
  publishedPatchIdRef.current = publishedPatchId;

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
          publishedPatchIdRef.current
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
      markReady(null);
      markPublished(null);

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

      return {
        status: "success",
        patch: summarizePatch(patch),
        simulation: summarizeSimulation(result),
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

      const nextSimulations = {
        ...simulationsRef.current
      };

      delete nextSimulations[patchId];

      replaceSimulations(nextSimulations);

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
    selectPatch(null);
    markReady(null);
    markPublished(null);
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
              !selectedSimulation && (
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
                          markReady(
                            readyPatchId ===
                            selectedPatch.id
                              ? null
                              : selectedPatch.id
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

