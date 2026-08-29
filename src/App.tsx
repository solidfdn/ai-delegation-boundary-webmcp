import { useEffect, useRef, useState } from "react";
import { initialWorkspace } from "./domains/universal-demo";
import type { Decision, WorkspaceState } from "./core/types";
import { registerWorkspaceTool } from "./webmcp/registerTools";
import { copy } from "./i18n/copy";
import "./styles.css";

export default function App() {
  const [lang, setLang] = useState<"en" | "ja">("en");
  const [workspace, setWorkspace] =
    useState<WorkspaceState>(initialWorkspace);
  const [webmcpAvailable, setWebmcpAvailable] = useState(false);

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
      precedentRecorded: current.humanCorrection.useAsPrecedent
    }));
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">SOLIFAN</div>
        <div className="divider" />
        <div className="product">Decision Patch</div>
        <div className="tagline">A pull request for agent decisions.</div>

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
          <div className="sectionLabel">1&nbsp;&nbsp;{t.input}</div>

          <div className="card">
            <div className="cardTitle">{t.observed}</div>
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
            <div className="cardTitle">{t.agentBefore}</div>
            <div className="decision before">
              {workspace.agentDecision}
            </div>
          </div>

          <div className="card correctionCard">
            <label>{t.correction}</label>
            <select
              value={workspace.humanCorrection.decision}
              onChange={(e) => setDecision(e.target.value as Decision)}
            >
              <option value="APPROVE">APPROVE</option>
              <option value="HUMAN_REVIEW">HUMAN_REVIEW</option>
              <option value="DECLINE">DECLINE</option>
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
                checked={workspace.humanCorrection.useAsPrecedent}
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

            <button className="primary" onClick={recordCorrection}>
              {t.record}
            </button>
          </div>
        </section>

        <section className="centerPanel">
          <div className="hero">
            <h1>{t.title}</h1>
            <p>{t.subtitle}</p>
          </div>

          <div className="panel impactPanel">
            <div className="sectionLabel">2&nbsp;&nbsp;{t.impact}</div>

            {workspace.precedentRecorded ? (
              <div className="precedentState">
                <div className="shift">
                  <span>{workspace.agentDecision}</span>
                  <span className="arrow">→</span>
                  <strong>{workspace.humanCorrection.decision}</strong>
                </div>
                <p>{workspace.humanCorrection.rationale}</p>
                <div className="honesty">
                  Observed correction only. No generalized rule has been
                  published.
                </div>
              </div>
            ) : (
              <div className="emptyState">{t.impactEmpty}</div>
            )}
          </div>
        </section>

        <section className="rightPanel panel">
          <div className="sectionLabel">3&nbsp;&nbsp;{t.candidates}</div>
          <div className="emptyState">{t.candidatesEmpty}</div>

          <div className="webmcpCard">
            <div>
              <strong>{t.webmcp}</strong>
              <span
                className={
                  webmcpAvailable ? "status available" : "status unavailable"
                }
              >
                {webmcpAvailable ? "LIVE" : "NOT DETECTED"}
              </span>
            </div>
            <p>
              {webmcpAvailable ? t.available : t.unavailable}
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
          <span>Foundations empower challenges.</span>
          <span>SYNTHETIC DATA FOR DEMONSTRATION ONLY</span>
        </div>
      </footer>
    </div>
  );
}
