import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import {
  approveCurrentRevision,
  getCurrentRevision,
  reviewRevision
} from "./core/delegationEngine";

import {
  editBoundaryConditionAsHuman,
  resolveChallengeAsHuman,
  scopeDelegationTaskAsHuman
} from "./core/delegationHuman";

import type {
  DecisionCondition,
  DelegationOutcome,
  DelegationWorkspace,
  FactorDefinition,
  FactorValue
} from "./core/types";

import {
  deriveGuidanceState,
  type ApplyToolState
} from "./core/guidance";

import {
  createInteractiveDelegationWorkspace
} from "./domains/interactive-delegation-workspace";

import {
  createDelegationBoundaryToolActions
} from "./webmcp/delegationActions";

import {
  registerApplyApprovedRevisionTool,
  registerDelegationBoundaryTools
} from "./webmcp/registerDelegationTools";

import "./delegation-app.css";

type Lang = "en" | "ja";

const STATUS_LABELS = {
  en: {
    DRAFT: "Draft",
    NEEDS_REVIEW: "Needs human review",
    BLOCKED: "Blocked",
    READY_FOR_DECISION: "Ready for decision",
    APPROVED: "Human approved",
    APPLIED: "Applied",
    SUPERSEDED: "Past revision"
  },

  ja: {
    DRAFT: "検討中",
    NEEDS_REVIEW: "人の判断待ち",
    BLOCKED: "変更不可",
    READY_FOR_DECISION: "最終判断可能",
    APPROVED: "人が承認済み",
    APPLIED: "反映済み",
    SUPERSEDED: "過去版"
  }
} as const;

const OUTCOME_LABELS: Record<
  Lang,
  Record<DelegationOutcome, string>
> = {
  en: {
    AGENT_ONLY:
      "Agent may complete",
    HUMAN_REVIEW:
      "Human review required",
    DO_NOT_DELEGATE:
      "Do not delegate"
  },

  ja: {
    AGENT_ONLY:
      "AIだけで完了してよい",
    HUMAN_REVIEW:
      "人の確認を残す",
    DO_NOT_DELEGATE:
      "AIに任せない"
  }
};

const FACTOR_JA:
  Record<string, string> = {
    evidence_quality:
      "判断根拠の確かさ",

    impact:
      "誤判断した場合の影響",

    reversibility:
      "取り消し可能性",

    policy_clarity:
      "ルールの明確さ",

    exceptionality:
      "例外性"
  };

const VALUE_JA:
  Record<string, string> = {
    LOW: "低",
    MEDIUM: "中",
    HIGH: "高",

    REVERSIBLE:
      "取り消せる",

    PARTIAL:
      "一部のみ可能",

    IRREVERSIBLE:
      "取り消せない",

    CLEAR:
      "明確",

    AMBIGUOUS:
      "曖昧",

    UNKNOWN:
      "不明",

    STANDARD:
      "通常",

    EXCEPTION:
      "例外",

    NOVEL:
      "未経験"
  };

const RULE_JA:
  Record<string, string> = {
    "rule-irreversible":
      "取り消せない処理はAIに任せない",

    "rule-unknown-policy":
      "ルールが不明なら人が確認する",

    "rule-agent-standard":
      "条件を満たす通常判断はAIだけで完了できる"
  };

const GUARDRAIL_JA:
  Record<string, {
    label: string;
    description: string;
  }> = {
    "guardrail-irreversible": {
      label:
        "取り消せない処理は人が管理する",

      description:
        "実行後に元へ戻せない判断を、AIだけで完了させません。"
    },

    "guardrail-unknown-policy": {
      label:
        "判断ルールが不明な場合は人へ戻す",

      description:
        "既存ルールで判断できないものを、AIだけで完了させません。"
    }
  };

const KNOWN_JA:
  Record<string, string> = {
    "known-001":
      "明確・低影響の通常判断",

    "known-002":
      "影響が中程度なら人が確認",

    "known-003":
      "取り消せない判断はAIに任せない"
  };

function cloneWorkspace():
  DelegationWorkspace {
  return createInteractiveDelegationWorkspace();
}


const WORKSPACE_SESSION_KEY =
  "ai-delegation-boundary:workspace:v1";

function loadWorkspaceSession(): {
  workspace: DelegationWorkspace;
  restored: boolean;
} {
  if (
    typeof window === "undefined"
  ) {
    return {
      workspace: cloneWorkspace(),
      restored: false
    };
  }

  try {
    const stored =
      window.sessionStorage.getItem(
        WORKSPACE_SESSION_KEY
      );

    if (!stored) {
      return {
        workspace: cloneWorkspace(),
        restored: false
      };
    }

    const parsed =
      JSON.parse(stored) as
        DelegationWorkspace;

    const valid =
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.id === "string" &&
      parsed.task &&
      Array.isArray(parsed.factors) &&
      Array.isArray(parsed.revisions) &&
      typeof parsed.currentRevisionId ===
        "string" &&
      parsed.revisions.some(
        (revision) =>
          revision.id ===
          parsed.currentRevisionId
      );

    if (!valid) {
      throw new Error(
        "Stored workspace is invalid."
      );
    }

    return {
      workspace: parsed,
      restored: true
    };
  } catch {
    window.sessionStorage.removeItem(
      WORKSPACE_SESSION_KEY
    );

    return {
      workspace: cloneWorkspace(),
      restored: false
    };
  }
}

function operatorLabel(
  operator: DecisionCondition["operator"]
) {
  switch (operator) {
    case "AT_LEAST":
      return "≥";

    case "AT_MOST":
      return "≤";

    case "EQ":
      return "=";

    case "NEQ":
      return "≠";

    case "IN":
      return "∈";

    case "NOT_IN":
      return "∉";

    case "IS_SET":
      return "set";

    default:
      return operator;
  }
}

function factorOptions(
  factor:
    FactorDefinition | undefined
): FactorValue[] {
  if (!factor) {
    return [];
  }

  if (
    factor.type === "ORDERED"
  ) {
    return (
      factor.orderedValues ?? []
    );
  }

  if (
    factor.type === "CATEGORY"
  ) {
    return (
      factor.categories ?? []
    );
  }

  if (
    factor.type === "BOOLEAN"
  ) {
    return [
      true,
      false
    ];
  }

  return [];
}

export default function DelegationApp() {
  const initialSession =
    useRef(
      loadWorkspaceSession()
    ).current;

  const [lang, setLang] =
    useState<Lang>("en");

  const [workspace, setWorkspace] =
    useState<DelegationWorkspace>(
      initialSession.workspace
    );

  const [
    baseToolCount,
    setBaseToolCount
  ] = useState(0);

  const [
    baseToolsResolved,
    setBaseToolsResolved
  ] = useState(false);

  const [
    applyToolAvailable,
    setApplyToolAvailable
  ] = useState(false);

  const [
    applyToolState,
    setApplyToolState
  ] = useState<ApplyToolState>(
    "idle"
  );

  const [
    lastAgentError,
    setLastAgentError
  ] = useState<string | null>(
    null
  );

  const [
    copyFeedback,
    setCopyFeedback
  ] = useState("");

  const guidancePromptRef =
    useRef<HTMLTextAreaElement>(
      null
    );

  const [message, setMessage] =
    useState<string | null>(
      initialSession.restored
        ? "Session restored after reload."
        : null
    );

  const [
    taskTitleDraft,
    setTaskTitleDraft
  ] = useState("");

  const [
    taskContextDraft,
    setTaskContextDraft
  ] = useState("");

  const [
    nextTargetOffscreen,
    setNextTargetOffscreen
  ] = useState(false);
  const workspaceRef =
    useRef(workspace);

  workspaceRef.current =
    workspace;

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        WORKSPACE_SESSION_KEY,
        JSON.stringify(workspace)
      );
    } catch {
      /*
       * Storage failure must never block the Human workspace.
       * The user can continue in-memory.
       */
    }
  }, [workspace]);

  const updateWorkspace =
    useCallback(
      (
        next:
          DelegationWorkspace
      ) => {
        workspaceRef.current =
          next;

        setWorkspace(next);
      },
      []
    );

  const recordToolResult =
    useCallback(
      <T,>(result: T): T => {
        if (
          result &&
          typeof result === "object" &&
          "status" in result
        ) {
          const record =
            result as {
              status?: unknown;
              message?: unknown;
            };

          if (
            record.status === "error" ||
            record.status === "blocked"
          ) {
            setLastAgentError(
              typeof record.message ===
                "string"
                ? record.message
                : "The Agent tool could not complete."
            );
          } else {
            setLastAgentError(null);
          }
        } else {
          setLastAgentError(null);
        }

        return result;
      },
      []
    );

  const toolActions =
    useMemo(
      () => {
        const actions =
          createDelegationBoundaryToolActions(
            () =>
              workspaceRef.current,

            updateWorkspace
          );

        return {
          inspectWorkspace: () =>
            recordToolResult(
              actions.inspectWorkspace()
            ),

          proposeBoundaryRevision: (
            input:
              Parameters<
                typeof actions
                  .proposeBoundaryRevision
              >[0]
          ) =>
            recordToolResult(
              actions
                .proposeBoundaryRevision(
                  input
                )
            ),

          addChallenge: (
            input:
              Parameters<
                typeof actions.addChallenge
              >[0]
          ) =>
            recordToolResult(
              actions.addChallenge(
                input
              )
            ),

          reviewCurrentRevision: () =>
            recordToolResult(
              actions
                .reviewCurrentRevision()
            ),

          inspectRevisionHistory: () =>
            recordToolResult(
              actions
                .inspectRevisionHistory()
            ),

          applyApprovedRevision:
            async () =>
              recordToolResult(
                await actions
                  .applyApprovedRevision()
              )
        };
      },
      [
        recordToolResult,
        updateWorkspace
      ]
    );

  useEffect(() => {
    setBaseToolsResolved(false);

    return (
      registerDelegationBoundaryTools(
        toolActions,
        (count) => {
          setBaseToolCount(count);
          setBaseToolsResolved(true);
        }
      )
    );
  }, [toolActions]);

  const current =
    getCurrentRevision(
      workspace
    );

  const mayExposeApply =
    Boolean(
      workspace.approval &&
      current.status ===
        "APPROVED"
    );

  useEffect(() => {
    if (!mayExposeApply) {
      setApplyToolAvailable(
        false
      );

      setApplyToolState(
        "idle"
      );

      return;
    }

    setApplyToolAvailable(
      false
    );

    setApplyToolState(
      "registering"
    );

    return (
      registerApplyApprovedRevisionTool(
        toolActions,
        (available) => {
          setApplyToolAvailable(
            available
          );

          setApplyToolState(
            available
              ? "available"
              : "failed"
          );
        }
      )
    );
  }, [
    mayExposeApply,
    toolActions,
    workspace.approval
      ?.fingerprint
  ]);

  const openChallenges =
    current.challenges.filter(
      (challenge) =>
        challenge.status ===
        "OPEN"
    );

  const nextOpenChallengeId =
    openChallenges.length > 0
      ? openChallenges[
          openChallenges.length - 1
        ].id
      : undefined;
  const guardrailViolations =
    current.review?.guardrails.filter(
      (result) =>
        result.violated
    ).length ?? null;

  const regressions =
    current.review?.regressions.filter(
      (result) =>
        !result.passed
    ).length ?? null;

  const statusLabel =
    STATUS_LABELS[lang][
      current.status
    ];

  const taskConfigured =
    workspace.task.title
      .trim()
      .length > 0;

  const challengeGateLabel =
    !taskConfigured
      ? lang === "ja"
        ? "業務未設定"
        : "WAITING"
      : current.challenges.length === 0
        ? lang === "ja"
          ? "必須"
          : "REQUIRED"
        : openChallenges.length > 0
          ? lang === "ja"
            ? `${openChallenges.length}件 未判断`
            : `${openChallenges.length} OPEN`
          : lang === "ja"
            ? "完了"
            : "PASSED";

  const nextCue =
    deriveGuidanceState({
      workspace,
      baseToolCount,
      baseToolsResolved,
      applyToolState,
      lastAgentError
    });

  const copyGuidancePrompt =
    async () => {
      if (!nextCue.prompt) {
        return;
      }

      setCopyFeedback("");

      try {
        await navigator.clipboard
          .writeText(
            nextCue.prompt
          );

        setCopyFeedback(
          "Copied"
        );
      } catch {
        const target =
          guidancePromptRef.current;

        if (!target) {
          setCopyFeedback(
            "Select and copy the text above."
          );

          return;
        }

        target.focus();
        target.select();

        const copied =
          document.execCommand(
            "copy"
          );

        setCopyFeedback(
          copied
            ? "Copied"
            : "Selected — press Ctrl+C."
        );
      }
    };

  const showNextStep = () => {
    const target =
      document.getElementById(
        nextCue.targetId
      );

    if (!target) {
      return;
    }

    const reduceMotion =
      window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;

    target.scrollIntoView({
      behavior:
        reduceMotion
          ? "auto"
          : "smooth",
      block: "center"
    });
  };
  /* CONTEXTUAL_WAYFINDING_VISIBILITY */
  useEffect(() => {
    const target =
      document.getElementById(
        nextCue.targetId
      );

    if (
      !target ||
      nextCue.key === "complete"
    ) {
      setNextTargetOffscreen(
        false
      );

      return;
    }

    const measure = () => {
      const rect =
        target.getBoundingClientRect();

      /*
       * The sticky guidance bar occupies roughly
       * the first 58px when pinned.
       *
       * "Visible" intentionally means any meaningful
       * portion of the target is already available
       * to the user.
       */
      const visible =
        rect.bottom > 58 &&
        rect.top <
          window.innerHeight &&
        rect.right > 0 &&
        rect.left <
          window.innerWidth;

      setNextTargetOffscreen(
        !visible
      );
    };

    measure();

    const observer =
      typeof IntersectionObserver !==
      "undefined"
        ? new IntersectionObserver(
            ([entry]) => {
              setNextTargetOffscreen(
                !entry.isIntersecting
              );
            },
            {
              root: null,
              rootMargin:
                "-58px 0px 0px 0px",
              threshold: 0.01
            }
          )
        : undefined;

    observer?.observe(target);

    window.addEventListener(
      "resize",
      measure
    );

    return () => {
      observer?.disconnect();

      window.removeEventListener(
        "resize",
        measure
      );
    };
  }, [
    nextCue.key,
    nextCue.targetId
  ]);
  const factorLabel = (
    factorId: string
  ) => {
    const factor =
      workspace.factors.find(
        (candidate) =>
          candidate.id ===
          factorId
      );

    if (
      lang === "ja"
    ) {
      return (
        FACTOR_JA[factorId] ??
        factor?.label ??
        factorId
      );
    }

    return (
      factor?.label ??
      factorId
    );
  };

  const displayValue = (
    value: unknown
  ): string => {
    if (
      Array.isArray(value)
    ) {
      return value
        .map(displayValue)
        .join(", ");
    }

    const raw =
      String(value);

    return (
      lang === "ja"
        ? VALUE_JA[raw] ??
          raw
        : raw
    );
  };

  const runChecks = () => {
    try {
      if (
        current.status ===
          "APPROVED" ||
        current.status ===
          "APPLIED"
      ) {
        return;
      }

      const reviewed =
        reviewRevision(
          current,
          workspace.factors
        );

      updateWorkspace({
        ...workspace,

        revisions:
          workspace.revisions.map(
            (revision) =>
              revision.id ===
              reviewed.id
                ? reviewed
                : revision
          ),

        approval:
          undefined
      });

      setMessage(
        lang === "ja"
          ? "現在の条件で再検証しました。"
          : "The current revision was re-checked."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : String(error)
      );
    }
  };

  const approve = async () => {
    try {
      const approved =
        await approveCurrentRevision(
          workspace
        );

      updateWorkspace(
        approved
      );

      setMessage(
        lang === "ja"
          ? "この正確なRevisionを承認しました。Agentに反映操作を渡せる状態です。"
          : "This exact revision is human-approved. The apply capability can now be exposed to the agent."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : String(error)
      );
    }
  };

  const resolveChallenge = (
    challengeId: string,
    outcome: DelegationOutcome
  ) => {
    try {
      const note =
        outcome ===
          "AGENT_ONLY"
          ? "Human confirmed this scenario may be completed by the agent."
          : outcome ===
            "DO_NOT_DELEGATE"
            ? "Human confirmed this scenario must not be delegated."
            : "Human confirmed this scenario still requires human review.";

      updateWorkspace(
        resolveChallengeAsHuman(
          workspace,
          challengeId,
          outcome,
          note
        )
      );

      setMessage(
        lang === "ja"
          ? "この判断を記録しました。次のRevisionではRegression Testとして使われます。"
          : "The human judgment was recorded. It is now a regression test for future revisions."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : String(error)
      );
    }
  };

  const scopeTask = () => {
    try {
      const next =
        scopeDelegationTaskAsHuman(
          workspace,
          taskTitleDraft,
          taskContextDraft
        );

      updateWorkspace(
        next
      );

      setMessage(
        lang === "ja"
          ? "検討する業務を設定しました。ここからAgentが変更案とChallengeを作れます。"
          : "The work is scoped. The Agent can now propose and challenge delegation changes."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : String(error)
      );
    }
  };

  const editCondition = (
    ruleId: string,
    factorId: string,
    nextValue: FactorValue
  ) => {
    try {
      updateWorkspace(
        editBoundaryConditionAsHuman(
          workspace,
          ruleId,
          factorId,
          nextValue
        )
      );

      setMessage(
        lang === "ja"
          ? "条件を変更しました。以前の検証・承認は引き継がれません。"
          : "The boundary changed. Previous review and approval do not carry forward."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : String(error)
      );
    }
  };

  const reset = () => {
    const hasWork =
      workspace.task.title
        .trim()
        .length > 0;

    if (
      hasWork &&
      !window.confirm(
        "Start new work? The current session-local workspace will be cleared."
      )
    ) {
      return;
    }

    window.sessionStorage.removeItem(
      WORKSPACE_SESSION_KEY
    );

    const next =
      cloneWorkspace();

    updateWorkspace(next);

    setTaskTitleDraft("");
    setTaskContextDraft("");
    setLastAgentError(null);
    setCopyFeedback("");
    setMessage(null);
  };


  return (
    <div
      className={`adb-app adb-${lang}`}
      data-next={nextCue.key}
    >
      <header className="adb-header">
        <div className="adb-brand">
          SOLIFAN
        </div>

        <div className="adb-header-rule" />

        <div className="adb-product">
          AI Delegation Boundary
        </div>

        <div className="adb-header-tagline">
          A pull request for agent authority.
        </div>

        <button
          id="next-start-new"
          className="adb-reset"
          type="button"
          onClick={reset}
        >
          {lang === "ja"
            ? "新しい業務"
            : "Start new work"}
        </button>

        <div className="adb-lang">
          <button
            type="button"
            className={
              lang === "en"
                ? "active"
                : ""
            }
            onClick={() =>
              setLang("en")
            }
          >
            EN
          </button>

          <span>/</span>

          <button
            type="button"
            className={
              lang === "ja"
                ? "active"
                : ""
            }
            onClick={() =>
              setLang("ja")
            }
          >
            日本語
          </button>
        </div>
      </header>

      <section className="adb-hero">
        <div className="adb-hero-copy">
          <span className="adb-eyebrow">
            AI DELEGATION BOUNDARY
          </span>

          <h1 className="adb-hero-title">
            {lang === "ja" ? (
              "AIに任せてよい範囲を検討する。"
            ) : (
              <>
                <span className="adb-hero-title-line">
                  Decide what an AI agent
                </span>{" "}
                <span className="adb-hero-title-line">
                  may do on its own.
                </span>
              </>
            )}
          </h1>

          <p>
            {lang === "ja"
              ? "人が検討する業務と最終判断を持ちます。Agentは委任条件の変更を提案し、その変更が危険になる具体例を探し、Revisionごとに再検証します。反映できるのは、人が承認した正確な版だけです。"
              : "A human defines the work and retains final authority. The Agent proposes boundary changes, tries to break them with concrete challenges, and re-tests each revision. Only the exact human-approved revision can be applied."}
          </p>
        </div>

        <div className="adb-revision-state">
          <img
            className="adb-revision-logo"
            src={`${import.meta.env.BASE_URL}solifan-crane.png`}
            alt=""
            aria-hidden="true"
          />
          <span>
            REVISION {current.version}
          </span>

          <strong
            className={`adb-status status-${current.status.toLowerCase()}`}
          >
            {statusLabel}
          </strong>

          <small>
            {lang === "ja"
              ? current.status ===
                "READY_FOR_DECISION"
                ? "検証は完了しています。最終判断は人が行います。"
                : current.status ===
                  "BLOCKED"
                  ? "Guardrailまたは過去の人判断と矛盾しています。"
                  : current.status ===
                    "APPROVED"
                    ? "この版だけが人によって承認されています。"
                    : current.status ===
                      "APPLIED"
                      ? "承認済みの版が反映されました。"
                      : "現在の検討状態です。"
              : current.status ===
                "READY_FOR_DECISION"
                ? "Checks are complete. Final authority remains human."
                : current.status ===
                  "BLOCKED"
                  ? "A guardrail or known human decision is violated."
                  : current.status ===
                    "APPROVED"
                    ? "Only this exact revision is human-approved."
                    : current.status ===
                      "APPLIED"
                      ? "The approved revision has been applied."
                      : "Current review state."}
          </small>
        </div>
      </section>

      <section
        className="adb-protocol"
        aria-label={
          lang === "ja"
            ? "HumanとAgentの検討手順"
            : "Human and Agent review protocol"
        }
      >
        <div className="adb-protocol-step">
          <span>01 · HUMAN</span>
          <strong>
            {lang === "ja"
              ? "業務を定める"
              : "Scope the work"}
          </strong>
        </div>

        <div className="adb-protocol-step">
          <span>02 · AGENT</span>
          <strong>
            {lang === "ja"
              ? "変更案を出し、疑う"
              : "Propose & challenge"}
          </strong>
        </div>

        <div className="adb-protocol-step">
          <span>03 · HUMAN</span>
          <strong>
            {lang === "ja"
              ? "境界を判断する"
              : "Decide the boundary"}
          </strong>
        </div>

        <div className="adb-protocol-step">
          <span>04 · AGENT</span>
          <strong>
            {lang === "ja"
              ? "承認された版だけ反映"
              : "Apply exact approval"}
          </strong>
        </div>
      </section>

      <div
        className={`adb-next-cue adb-guidance-${nextCue.mode.toLowerCase()}`}
        aria-live="polite"
        data-guidance-state={
          nextCue.id
        }
      >
        <div className="adb-next-cue-main">
          <span
            className="adb-next-cue-dot"
            aria-hidden="true"
          />

          <span className="adb-next-cue-owner">
            {nextCue.owner}
          </span>

          <strong>
            {nextCue.action}
          </strong>

          <small>
            {nextCue.detail}
          </small>
        </div>

        {nextCue.where && (
          <div className="adb-guidance-meta">
            <span>WHERE</span>
            <strong>
              {nextCue.where}
            </strong>
          </div>
        )}

        {nextCue.prompt && (
          <div className="adb-guidance-prompt">
            <label htmlFor="adb-guidance-prompt">
              SEND TO CHATGPT
            </label>

            <textarea
              id="adb-guidance-prompt"
              ref={guidancePromptRef}
              readOnly
              rows={3}
              value={nextCue.prompt}
              onFocus={(event) =>
                event.currentTarget
                  .select()
              }
            />

            <div className="adb-guidance-copy-row">
              <button
                type="button"
                onClick={
                  copyGuidancePrompt
                }
              >
                Copy for ChatGPT
              </button>

              <span
                role="status"
                aria-live="polite"
              >
                {copyFeedback}
              </span>
            </div>
          </div>
        )}

        {nextCue.returnWhen && (
          <div className="adb-guidance-return">
            <span>RETURN WHEN</span>
            <p>
              {nextCue.returnWhen}
            </p>
          </div>
        )}

        {nextCue.goLabel &&
          nextTargetOffscreen && (
          <button
            className="adb-next-cue-action"
            type="button"
            onClick={showNextStep}
          >
            {nextCue.goLabel}
            <span aria-hidden="true">
              →
            </span>
          </button>
        )}
      </div>
      {message && (
        <div className="adb-message">
          {message}
        </div>
      )}

      <main className="adb-workspace">
        <section className="adb-column adb-boundary-column">
          <div className="adb-section-head">
            <span>01</span>

            <div>
              <strong>
                {lang === "ja"
                  ? "現在の委任条件"
                  : "Current boundary"}
              </strong>

              <small>
                {lang === "ja"
                  ? "AIに任せる条件を確認・調整"
                  : "Review and adjust agent authority"}
              </small>
            </div>
          </div>

          <div
            id="next-task"
            className={`adb-task-card ${
              taskConfigured
                ? "is-scoped"
                : "is-setup"
            }`}
          >
            <span className="adb-card-label">
              {lang === "ja"
                ? "検討する業務"
                : "WORK TO DELEGATE"}
            </span>

            {!taskConfigured ? (
              <form
                className="adb-task-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  scopeTask();
                }}
              >
                <div className="adb-task-field">
                  <label htmlFor="adb-task-title">
                    {lang === "ja"
                      ? "どの業務・判断をAIに任せることを検討しますか？"
                      : "What work or decision are you considering delegating?"}
                  </label>

                  <input
                    id="adb-task-title"
                    value={taskTitleDraft}
                    maxLength={180}
                    autoComplete="off"
                    placeholder={
                      lang === "ja"
                        ? "例：顧客からの返金申請を、人の確認なしで処理する判断"
                        : "e.g. Decide whether a customer refund can be completed without human review"
                    }
                    onChange={(event) =>
                      setTaskTitleDraft(
                        event.target.value
                      )
                    }
                  />
                </div>

                <div className="adb-task-field">
                  <label htmlFor="adb-task-context">
                    {lang === "ja"
                      ? "背景・制約（任意）"
                      : "Context or constraints (optional)"}
                  </label>

                  <textarea
                    id="adb-task-context"
                    value={taskContextDraft}
                    maxLength={1000}
                    rows={4}
                    placeholder={
                      lang === "ja"
                        ? "既存ルール、失敗した場合の影響、必ず人に残したい判断など"
                        : "Existing policy, consequences of a wrong decision, or anything that must remain under human authority"
                    }
                    onChange={(event) =>
                      setTaskContextDraft(
                        event.target.value
                      )
                    }
                  />
                </div>

                <button
                  type="submit"
                  disabled={
                    taskTitleDraft
                      .trim()
                      .length < 3
                  }
                >
                  {lang === "ja"
                    ? "この業務で検討を開始"
                    : "Start with this work"}
                </button>

                <small>
                  {lang === "ja"
                    ? "この設定は人だけが行います。業務を定めるまでAgentは委任条件を変更できません。"
                    : "Human-only step. Until this is set, the Agent cannot change delegation authority."}
                </small>
              </form>
            ) : (
              <>
                <strong>
                  {workspace.task.title}
                </strong>

                {workspace.task
                  .description && (
                  <p>
                    {
                      workspace.task
                        .description
                    }
                  </p>
                )}

                <div className="adb-task-locked-note">
                  {lang === "ja"
                    ? "このWorkspaceでは検討対象を固定しています。別の業務を検討する場合はResetします。"
                    : "Task scope is fixed for this workspace. Reset to evaluate a different task."}
                </div>
              </>
            )}
          </div>

          <div className="adb-boundary-summary">
            <span className="adb-card-label">
              {lang === "ja"
                ? "現在の方針"
                : "CURRENT POLICY"}
            </span>

            <p>
              {lang === "ja"
                ? "条件を満たす低影響・可逆・通常の判断だけをAIに任せます。それ以外は人の確認を残します。"
                : current.boundary.label}
            </p>
          </div>

          <div
            id="next-boundary"
            className="adb-rules"
          >
            {[...current.boundary.rules]
              .sort(
                (a, b) =>
                  a.priority -
                  b.priority
              )
              .map((rule) => (
                <article
                  id={`boundary-rule-${rule.id}`}
                  className="adb-rule-card"
                  key={rule.id}
                >
                  <div className="adb-rule-head">
                    <strong>
                      {lang === "ja"
                        ? RULE_JA[
                            rule.id
                          ] ??
                          rule.label
                        : rule.label}
                    </strong>

                    <span
                      className={`adb-outcome outcome-${rule.outcome.toLowerCase()}`}
                    >
                      {
                        OUTCOME_LABELS[
                          lang
                        ][
                          rule.outcome
                        ]
                      }
                    </span>
                  </div>

                  <div className="adb-conditions">
                    {rule.when.map(
                      (
                        condition,
                        index
                      ) => {
                        const factor =
                          workspace.factors.find(
                            (
                              candidate
                            ) =>
                              candidate.id ===
                              condition.factorId
                          );

                        const options =
                          factorOptions(
                            factor
                          );

                        const currentValue =
                          Array.isArray(
                            condition.value
                          )
                            ? undefined
                            : condition.value;

                        return (
                          <div
                            className="adb-condition"
                            key={`${rule.id}-${condition.factorId}-${index}`}
                          >
                            <span>
                              {factorLabel(
                                condition.factorId
                              )}
                            </span>

                            <b>
                              {operatorLabel(
                                condition.operator
                              )}
                            </b>

                            {options.length >
                              0 &&
                            currentValue !==
                              undefined ? (
                              <select
                                disabled={
                                  !taskConfigured
                                }
                                value={String(
                                  currentValue
                                )}
                                onChange={(
                                  event
                                ) => {
                                  const raw =
                                    event
                                      .target
                                      .value;

                                  let next:
                                    FactorValue =
                                      raw;

                                  if (
                                    factor
                                      ?.type ===
                                    "BOOLEAN"
                                  ) {
                                    next =
                                      raw ===
                                      "true";
                                  }

                                  editCondition(
                                    rule.id,
                                    condition.factorId,
                                    next
                                  );
                                }}
                              >
                                {options.map(
                                  (
                                    option
                                  ) => (
                                    <option
                                      key={String(
                                        option
                                      )}
                                      value={String(
                                        option
                                      )}
                                    >
                                      {displayValue(
                                        option
                                      )}
                                    </option>
                                  )
                                )}
                              </select>
                            ) : (
                              <strong>
                                {displayValue(
                                  condition.value
                                )}
                              </strong>
                            )}
                          </div>
                        );
                      }
                    )}
                  </div>
                </article>
              ))}
          </div>

          <div className="adb-default">
            <span>
              {lang === "ja"
                ? "上記に当てはまらない場合"
                : "Otherwise"}
            </span>

            <strong>
              {
                OUTCOME_LABELS[
                  lang
                ][
                  current
                    .boundary
                    .defaultOutcome
                ]
              }
            </strong>
          </div>
        </section>

        <section className="adb-column adb-review-column">
          <div className="adb-section-head">
            <span>02</span>

            <div>
              <strong>
                {lang === "ja"
                  ? "変更を検証"
                  : "Review the change"}
              </strong>

              <small>
                {lang === "ja"
                  ? "越えてはいけない条件・過去判断・新しい論点"
                  : "Guardrails, past decisions, and new challenges"}
              </small>
            </div>
          </div>

          <div className="adb-review-metrics">
            <div>
              <span>
                {lang === "ja"
                  ? "Guardrail違反"
                  : "Guardrail violations"}
              </span>

              <strong>
                {guardrailViolations ??
                  "—"}
              </strong>
            </div>

            <div>
              <span>
                {lang === "ja"
                  ? "過去判断との矛盾"
                  : "Regressions"}
              </span>

              <strong>
                {regressions ??
                  "—"}
              </strong>
            </div>

            <div>
              <span>
                {lang === "ja"
                  ? "Challenge Gate"
                  : "Challenge gate"}
              </span>

              <strong className="adb-gate-value">
                {challengeGateLabel}
              </strong>
            </div>
          </div>

          <div
            id="next-guardrails"
            className="adb-review-block"
          >
            <div className="adb-block-head">
              <div>
                <span className="adb-card-label">
                  GUARDRAILS
                </span>

                <strong>
                  {lang === "ja"
                    ? "越えてはいけない条件"
                    : "Non-negotiable boundaries"}
                </strong>
              </div>

              <span>
                {
                  current
                    .guardrails
                    .length
                }
              </span>
            </div>

            {current.guardrails.map(
              (guardrail) => {
                const ja =
                  GUARDRAIL_JA[
                    guardrail.id
                  ];

                return (
                  <div
                    className="adb-list-row"
                    key={
                      guardrail.id
                    }
                  >
                    <div className="adb-list-mark">
                      G
                    </div>

                    <div>
                      <strong>
                        {lang ===
                          "ja"
                          ? ja
                              ?.label ??
                            guardrail
                              .label
                          : guardrail
                              .label}
                      </strong>

                      <p>
                        {lang ===
                          "ja"
                          ? ja
                              ?.description ??
                            guardrail
                              .description
                          : guardrail
                              .description}
                      </p>
                    </div>
                  </div>
                );
              }
            )}
          </div>

          <div className="adb-review-block">
            <div className="adb-block-head">
              <div>
                <span className="adb-card-label">
                  KNOWN DECISIONS
                </span>

                <strong>
                  {lang === "ja"
                    ? "人が確定した判断"
                    : "Human decisions preserved as tests"}
                </strong>
              </div>

              <span>
                {
                  current
                    .knownDecisions
                    .length
                }
              </span>
            </div>

            {current.knownDecisions
              .length === 0 && (
              <div className="adb-known-empty">
                <strong>
                  {lang === "ja"
                    ? "まだ人が確定した判断はありません。"
                    : "No human judgment has been recorded yet."}
                </strong>

                <p>
                  {lang === "ja"
                    ? "Agent Challengeに人が答えると、その判断が次の変更を守るRegression Testとして残ります。"
                    : "When a human answers an Agent Challenge, that judgment becomes a regression test for future boundary changes."}
                </p>
              </div>
            )}

            {current.knownDecisions
              .slice(-5)
              .map(
                (
                  decision
                ) => (
                  <div
                    className="adb-known-row"
                    key={
                      decision.id
                    }
                  >
                    <div>
                      <strong>
                        {lang ===
                          "ja"
                          ? KNOWN_JA[
                              decision.id
                            ] ??
                            "人が確定した判断"
                          : decision.label}
                      </strong>

                      <div className="adb-facts">
                        {Object.entries(
                          decision.facts
                        )
                          .slice(
                            0,
                            3
                          )
                          .map(
                            ([
                              key,
                              value
                            ]) => (
                              <span
                                key={
                                  key
                                }
                              >
                                {factorLabel(
                                  key
                                )}
                                :{" "}
                                {displayValue(
                                  value
                                )}
                              </span>
                            )
                          )}
                      </div>
                    </div>

                    <span
                      className={`adb-outcome outcome-${decision.expectedOutcome.toLowerCase()}`}
                    >
                      {
                        OUTCOME_LABELS[
                          lang
                        ][
                          decision
                            .expectedOutcome
                        ]
                      }
                    </span>
                  </div>
                )
              )}
          </div>

          <div className="adb-review-block">
            <div className="adb-block-head">
              <div>
                <span className="adb-card-label">
                  AGENT CHALLENGES
                </span>

                <strong>
                  {lang === "ja"
                    ? "この変更を疑う論点"
                    : "Questions that challenge the boundary"}
                </strong>
              </div>

              <span>
                {
                  openChallenges
                    .length
                }
              </span>
            </div>

            {current.challenges
              .length ===
            0 ? (
              <div className="adb-empty-challenge">
                <strong>
                  {!taskConfigured
                    ? lang === "ja"
                      ? "まず、検討する業務を人が定めます。"
                      : "First, a human must scope the work."
                    : lang === "ja"
                      ? "Agent Challengeが必要です。"
                      : "Agent Challenge required."}
                </strong>

                <p>
                  {!taskConfigured
                    ? lang === "ja"
                      ? "業務が決まるまで、Agentによる委任条件の変更・Challenge・Reviewはロックされています。"
                      : "Until the work is scoped, Agent tools that change, challenge, or review authority are locked."
                    : lang === "ja"
                      ? "Challengeが0件のRevisionは承認できません。Agentに、変更案を出したうえで、その正確なBoundaryが危険になる具体例を探させます。"
                      : "A revision with zero challenges cannot be approved. Ask the Agent to propose a change, then try to break that exact boundary with a concrete scenario."}
                </p>

                {taskConfigured && (
                  <p className="adb-agent-guidance-note">
                    {lang === "ja"
                      ? "次にChatGPTが必要な場合は、上部のNext Actionにコピー可能な文面が表示されます。"
                      : "When ChatGPT is needed, the Next Action above provides one copy-ready handoff prompt."}
                  </p>
                )}
              </div>
            ) : (
              current.challenges
                .slice()
                .reverse()
                .map(
                  (
                    challenge
                  ) => (
                    <article
                      className={`adb-challenge ${challenge.status.toLowerCase()}`}
                      id={
                        challenge.id ===
                        nextOpenChallengeId
                          ? "next-challenge"
                          : undefined
                      }
                      key={
                        challenge.id
                      }
                    >
                      <div className="adb-challenge-head">
                        <span>
                          {
                            challenge.status
                          }
                        </span>

                        <strong>
                          {
                            challenge.title
                          }
                        </strong>
                      </div>

                      <p>
                        {
                          challenge
                            .whyItMatters
                        }
                      </p>

                      <div className="adb-facts">
                        {Object.entries(
                          challenge.scenario
                        ).map(
                          ([
                            key,
                            value
                          ]) => (
                            <span
                              key={
                                key
                              }
                            >
                              {factorLabel(
                                key
                              )}
                              :{" "}
                              {displayValue(
                                value
                              )}
                            </span>
                          )
                        )}
                      </div>

                      {challenge.status ===
                        "OPEN" && (
                        <div className="adb-challenge-actions">
                          <button
                            type="button"
                            onClick={() =>
                              resolveChallenge(
                                challenge.id,
                                "AGENT_ONLY"
                              )
                            }
                          >
                            {lang ===
                            "ja"
                              ? "AIだけで完了してよい"
                              : "Allow agent-only"}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              resolveChallenge(
                                challenge.id,
                                "HUMAN_REVIEW"
                              )
                            }
                          >
                            {lang ===
                            "ja"
                              ? "人の確認を残す"
                              : "Keep human review"}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              resolveChallenge(
                                challenge.id,
                                "DO_NOT_DELEGATE"
                              )
                            }
                          >
                            {lang ===
                            "ja"
                              ? "AIに任せない"
                              : "Do not delegate"}
                          </button>
                        </div>
                      )}

                      {challenge
                        .humanResolution && (
                        <div className="adb-resolution">
                          {lang ===
                          "ja"
                            ? "人が判断済み。この判断は次回以降のRegression Testになります。"
                            : "Human resolved. This judgment now protects future revisions as a regression test."}
                        </div>
                      )}
                    </article>
                  )
                )
            )}
          </div>

          <div className="adb-decision-controls">
            {current.status !==
              "APPROVED" &&
              current.status !==
                "APPLIED" && (
                <button
                  id="next-review"
                  className="adb-check-button"
                  type="button"
                  disabled={
                    !taskConfigured
                  }
                  onClick={
                    runChecks
                  }
                >
                  {lang === "ja"
                    ? "Guardrailと過去判断を再確認"
                    : "Run guardrail & regression checks"}
                </button>
              )}

            {current.status ===
              "READY_FOR_DECISION" && (
              <button
                id="next-approve"
                className="adb-approve-button"
                type="button"
                onClick={
                  approve
                }
              >
                {lang === "ja"
                  ? `Revision ${current.version} を承認`
                  : `Approve revision ${current.version}`}
              </button>
            )}

            {current.status ===
              "APPROVED" && (
              <div className="adb-approved-card">
                <span>
                  {lang === "ja"
                    ? "人が承認した正確な版"
                    : "EXACT HUMAN-APPROVED REVISION"}
                </span>

                <strong>
                  v{current.version}
                </strong>

                <p>
                  {lang === "ja"
                    ? "この正確なRevisionだけが人によって承認されています。"
                    : "This exact revision is human-approved. Only the current approved state can be applied."}
                </p>
              </div>
            )}

            {current.status ===
              "APPLIED" && (
              <div
                id="next-complete"
                className="adb-applied-card"
              >
                <span>
                  APPLIED
                </span>

                <strong>
                  Revision{" "}
                  {
                    current.version
                  }
                </strong>

                <p>
                  {lang === "ja"
                    ? "人が承認した版が、そのまま反映されました。"
                    : "The exact human-approved revision was applied."}
                </p>
              </div>
            )}
          </div>
        </section>

        <aside className="adb-column adb-history-column">
          <div className="adb-section-head">
            <span>03</span>

            <div>
              <strong>
                {lang === "ja"
                  ? "検討履歴"
                  : "Revision history"}
              </strong>

              <small>
                {lang === "ja"
                  ? "過去を消さず、現在だけを更新"
                  : "Past revisions stay available"}
              </small>
            </div>
          </div>

          <div className="adb-timeline">
            {[...workspace.revisions]
              .sort(
                (a, b) =>
                  b.version -
                  a.version
              )
              .map(
                (
                  revision,
                  index
                ) => (
                  <div
                    id={
                      revision.id ===
                      workspace.currentRevisionId
                        ? "next-current-revision"
                        : undefined
                    }
                    className={`adb-timeline-row ${
                      revision.id ===
                      workspace.currentRevisionId
                        ? "current"
                        : ""
                    }`}
                    key={
                      revision.id
                    }
                  >
                    <div className="adb-timeline-dot" />

                    <div>
                      <div className="adb-timeline-title">
                        <strong>
                          v{
                            revision.version
                          }
                        </strong>

                        <span>
                          {
                            STATUS_LABELS[
                              lang
                            ][
                              revision
                                .status
                            ]
                          }
                        </span>
                      </div>

                      <p>
                        {
                          revision
                            .changeSummary
                        }
                      </p>

                      <small>
                        {
                          revision
                            .createdBy
                        }
                        {index === 0
                          ? lang ===
                            "ja"
                            ? " · 現在"
                            : " · current"
                          : ""}
                      </small>
                    </div>
                  </div>
                )
              )}
          </div>

          <div
            id="next-agent"
            className="adb-agent-card"
          >
            <div className="adb-agent-card-head">
              <div>
                <span className="adb-card-label">
                  WEBMCP
                </span>

                <strong>
                  {!baseToolsResolved
                    ? "Checking WebMCP"
                    : baseToolCount >= 5
                      ? "WebMCP available"
                      : baseToolCount > 0
                        ? "WebMCP degraded"
                        : "WebMCP not detected"}
                </strong>
              </div>

              <span
                className={
                  baseToolsResolved &&
                  baseToolCount >= 5
                    ? "live"
                    : "offline"
                }
              >
                {!baseToolsResolved
                  ? "CHECKING"
                  : baseToolCount === 0
                    ? "HUMAN ONLY"
                    : baseToolCount < 5
                      ? `${baseToolCount} / 5 TOOLS`
                      : `${baseToolCount + (applyToolAvailable ? 1 : 0)} TOOLS`}
              </span>
            </div>

            <div className="adb-runtime-copy">
              {baseToolsResolved &&
              baseToolCount >= 5 ? (
                <>
                  <strong className="adb-runtime-primary">
                    Use with ChatGPT
                  </strong>

                  <div className="adb-runtime-map">
                    <div className="adb-runtime-row adb-runtime-try-row">
                      <span>
                        NEXT
                      </span>

                      <p>
                        Follow the Next Action above. It shows one copy-ready ChatGPT handoff only when the Agent is needed.
                      </p>
                    </div>

                    <div className="adb-runtime-row adb-runtime-agent-row">
                      <span>
                        AGENT
                      </span>

                      <p>
                        A compatible Agent client calls the WebMCP tools exposed by this page. No AI backend.
                      </p>
                    </div>

                    <div className="adb-runtime-row adb-runtime-authority-row">
                      <span>
                        AUTHORITY
                      </span>

                      <p>
                        The web app owns the boundary, Guardrails, human judgments, approval, and applied state.
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <strong className="adb-runtime-primary">
                    {!baseToolsResolved
                      ? "Checking site tools"
                      : baseToolCount > 0
                        ? "WebMCP setup incomplete"
                        : "Human workspace available"}
                  </strong>

                  <div className="adb-runtime-map adb-runtime-setup">
                    <div className="adb-runtime-row adb-runtime-try-row">
                      <span>
                        SETUP
                      </span>

                      <p>
                        Open this page in the ChatGPT desktop app’s built-in browser. Start Agent work only after all 5 normal tools are available.
                      </p>
                    </div>

                    <div className="adb-runtime-row adb-runtime-authority-row">
                      <span>
                        WORKSPACE
                      </span>

                      <p>
                        Human review and boundary editing remain available in this browser.
                      </p>
                    </div>

                    <div className="adb-runtime-row adb-runtime-backend-row">
                      <span>
                        BACKEND
                      </span>

                      <p>
                        No AI backend required.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="adb-capability">
              <div>
                <span>
                  {lang === "ja"
                    ? "通常"
                    : "NORMAL"}
                </span>

                <strong>
                  5
                </strong>
              </div>

              <b>→</b>

              <div
                className={
                  applyToolAvailable
                    ? "unlocked"
                    : ""
                }
              >
                <span>
                  {lang === "ja"
                    ? "人の承認後"
                    : "AFTER HUMAN APPROVAL"}
                </span>

                <strong>
                  6
                </strong>
              </div>
            </div>
          </div>

          <div className="adb-principle">
            <span>
              DECISION PATCH
            </span>

            <strong>
              {lang === "ja"
                ? "人の判断を、次の変更を守るテストにする。"
                : "Every human override becomes a test before it becomes a rule."}
            </strong>
          </div>
        </aside>
      </main>

      <footer className="adb-footer">
        <p>
          Foundations empower challenges.
        </p>
      </footer>
    </div>
  );
}
