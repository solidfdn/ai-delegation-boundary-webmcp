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
  PatchSimulation,
  WorkspaceState
} from "./core/types";

import {
  generateCandidatePatches,
  generateEvaluationSet,
  simulatePatch
} from "./core/decisionEngine";

import { registerWorkspaceTool } from "./webmcp/registerTools";
import { copy } from "./i18n/copy";
import "./styles.css";

export default function App() {
  const [lang, setLang] = useState<"en" | "ja">("en");

  const [workspace, setWorkspace] =
    useState<WorkspaceState>(initialWorkspace);

  const [webmcpAvailable, setWebmcpAvailable] =
    useState(false);

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
  workspaceRef.current = workspace;

  useEffect(() => {
    return registerWorkspaceTool(
      () => workspaceRef.current,
      setWebmcpAvailable
    );
  }, []);

  const t = copy[lang];
  const c = workspace.observedCase;

  const selectedPatch =
    patches.find((p) => p.id === selectedPatchId) ?? null;

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

    setPatches([]);
    setSimulations({});
    setSelectedPatchId(null);
  };

  const runSimulation = () => {
    if (!workspace.precedentRecorded) return;

    const nextPatches =
      generateCandidatePatches(workspace);

    const nextSimulations =
      Object.fromEntries(
        nextPatches.map((patch) => [
          patch.id,
          simulatePatch(patch, evaluationSet)
        ])
      ) as Record<string, PatchSimulation>;

    setPatches(nextPatches);
    setSimulations(nextSimulations);
    setSelectedPatchId(
      nextPatches.find((p) => p.scope === "BALANCED")
        ?.id ?? nextPatches[0]?.id ?? null
    );
  };

  const formatCondition = (
    key: string,
    value: string
  ) => {
    const labels: Record<string, string> = {
      urgencyAtLeast:
        lang === "ja" ? "緊急度 ≥" : "Urgency ≥",
      evidenceAtLeast:
        lang === "ja" ? "根拠 ≥" : "Evidence ≥",
      vulnerabilityAtLeast:
        lang === "ja" ? "脆弱性 ≥" : "Vulnerability ≥",
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
        <div className="product">Decision Patch</div>
        <div className="tagline">
          A pull request for agent decisions.
        </div>

        <div className="language">
          <button
            className={lang === "en" ? "active" : ""}
            onClick={() => setLang("en")}
          >
            EN
          </button>
          <span>/</span>
          <button
            className={lang === "ja" ? "active" : ""}
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
              <div><dt>ID</dt><dd>{c.id}</dd></div>
              <div><dt>Type</dt><dd>{c.caseType}</dd></div>
              <div><dt>Urgency</dt><dd>{c.urgency}</dd></div>
              <div><dt>Evidence</dt><dd>{c.evidenceStrength}</dd></div>
              <div><dt>Potential harm</dt><dd>{c.potentialHarm}</dd></div>
              <div><dt>Vulnerability</dt><dd>{c.vulnerability}</dd></div>
              <div><dt>Continuity</dt><dd>{c.continuityImpact}</dd></div>
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
              value={workspace.humanCorrection.decision}
              onChange={(e) =>
                setDecision(e.target.value as Decision)
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
              value={workspace.humanCorrection.rationale}
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
                  workspace.humanCorrection.useAsPrecedent
                }
                onChange={(e) =>
                  setWorkspace((current) => ({
                    ...current,
                    humanCorrection: {
                      ...current.humanCorrection,
                      useAsPrecedent: e.target.checked
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
                    <span className="arrow">→</span>
                    <strong>
                      {workspace.humanCorrection.decision}
                    </strong>
                  </div>

                  <p>
                    {workspace.humanCorrection.rationale}
                  </p>

                  <div className="honesty">
                    Observed correction only. No generalized
                    rule has been published.
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
                        {selectedSimulation.total}
                      </strong>{" "}
                      combinations
                    </div>
                  </div>

                  <div className="metricsGrid">
                    <div>
                      <span>{t.changed}</span>
                      <strong>
                        {selectedSimulation.changed}
                      </strong>
                    </div>

                    <div>
                      <span>{t.aligned}</span>
                      <strong>
                        {selectedSimulation.aligned}
                      </strong>
                    </div>

                    <div>
                      <span>{t.counterexamples}</span>
                      <strong className="danger">
                        {selectedSimulation.counterexamples}
                      </strong>
                    </div>

                    <div>
                      <span>{t.reviews}</span>
                      <strong>
                        {selectedSimulation.reviewsTransitioned}
                      </strong>
                    </div>
                  </div>

                  <div className="counterexampleArea">
                    <div className="cardTitle">
                      {t.counterexamples}
                    </div>

                    {selectedSimulation
                      .counterexampleCases.length === 0 ? (
                      <p>{t.noCounterexamples}</p>
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
                              <strong>{item.id}</strong>
                              <span>
                                {item.urgency} urgency ·{" "}
                                {item.evidenceStrength} evidence
                              </span>
                            </div>

                            <div>
                              <span>
                                {item.baselineDecision}
                              </span>
                              <span>→</span>
                              <strong>
                                {selectedPatch.outcome}
                              </strong>
                            </div>

                            <small>
                              Synthetic reference:{" "}
                              {item.referenceDecision}
                            </small>
                          </div>
                        ))
                    )}
                  </div>

                  <div className="honesty">
                    Counts describe the complete synthetic
                    combination matrix used for this demo.
                    They are not estimates of real-world
                    frequency or business impact.
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
                      selected ? "selected" : ""
                    }`}
                    onClick={() =>
                      setSelectedPatchId(patch.id)
                    }
                  >
                    <div className="patchHeader">
                      <strong>{patch.scope}</strong>

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
                      ).map(([key, value]) => (
                        <span key={key}>
                          {formatCondition(
                            key,
                            String(value)
                          )}
                        </span>
                      ))}
                    </div>

                    <div className="patchOutcome">
                      → {patch.outcome}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="webmcpCard">
            <div>
              <strong>{t.webmcp}</strong>

              <span
                className={
                  webmcpAvailable
                    ? "status available"
                    : "status unavailable"
                }
              >
                {webmcpAvailable
                  ? "LIVE"
                  : "NOT DETECTED"}
              </span>
            </div>

            <p>
              {webmcpAvailable
                ? t.available
                : t.unavailable}
            </p>
          </div>
        </section>
      </main>

      <footer>
        <div className="lime">
          Every correction is a lesson.<br />
          Every lesson can improve the next decision.
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
