import {
  initialLanguage, LANGUAGE_KEY, translate, errorText,
  localizeGuidance, approvedPromptJa
} from "./i18n/delegation";
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
  createApprovedRevisionApplyCoordinator
} from "./core/approvedRevisionApplication";

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
  approvedApplyChatGPTPrompt,
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
    BLOCKED: "修正が必要",
    READY_FOR_DECISION: "承認可能",
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
    useState<Lang>(initialLanguage);

  const t = (text: string) => translate(text, lang);
  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem(LANGUAGE_KEY, lang); } catch { /* preference only */ }
  }, [lang]);

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

  const [
    directApplyBusy,
    setDirectApplyBusy
  ] = useState(false);

  const [
    startNewDialogOpen,
    setStartNewDialogOpen
  ] = useState(false);

  const startNewButtonRef =
    useRef<HTMLButtonElement>(
      null
    );

  const keepCurrentWorkRef =
    useRef<HTMLButtonElement>(
      null
    );

  const confirmStartNewRef =
    useRef<HTMLButtonElement>(
      null
    );

  const guidancePromptRef =
    useRef<HTMLTextAreaElement>(
      null
    );

  const approvalPromptRef =
    useRef<HTMLTextAreaElement>(
      null
    );

  const directApplyBusyRef =
    useRef(false);

  const completionCueRef =
    useRef<HTMLDivElement>(
      null
    );

  const completionScrolledRef =
    useRef(false);

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

  const applyCoordinator =
    useMemo(
      () =>
        createApprovedRevisionApplyCoordinator({
          getWorkspace: () =>
            workspaceRef.current,

          commitWorkspace: (
            expected,
            next
          ) => {
            if (
              workspaceRef.current !==
              expected
            ) {
              return false;
            }

            updateWorkspace(next);
            return true;
          }
        }),
      [updateWorkspace]
    );

  const boundaryActions =
    useMemo(
      () =>
        createDelegationBoundaryToolActions(
          () =>
            workspaceRef.current,

          updateWorkspace,

          undefined,

          applyCoordinator
        ),
      [
        applyCoordinator,
        updateWorkspace
      ]
    );

  const toolActions =
    useMemo(
      () => {
        return {
          inspectWorkspace: () =>
            recordToolResult(
              boundaryActions
                .inspectWorkspace()
            ),

          proposeBoundaryRevision: (
            input:
              Parameters<
                typeof boundaryActions
                  .proposeBoundaryRevision
              >[0]
          ) =>
            recordToolResult(
              boundaryActions
                .proposeBoundaryRevision(
                  input
                )
            ),

          addChallenge: (
            input:
              Parameters<
                typeof boundaryActions.addChallenge
              >[0]
          ) =>
            recordToolResult(
              boundaryActions.addChallenge(
                input
              )
            ),

          reviewCurrentRevision: () =>
            recordToolResult(
              boundaryActions
                .reviewCurrentRevision()
            ),

          inspectRevisionHistory: () =>
            recordToolResult(
              boundaryActions
                .inspectRevisionHistory()
            ),

          applyApprovedRevision:
            async () => {
              const result =
                await boundaryActions
                  .applyApprovedRevision();

              if (
                result.status ===
                "success"
              ) {
                setMessage(null);
              }

              return recordToolResult(
                result
              );
            }
        };
      },
      [
        boundaryActions,
        recordToolResult,
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

  const resolvedChallenges =
    current.challenges.filter(
      (challenge) =>
        challenge.status ===
        "RESOLVED"
    ).length;

  const agentOnlyRuleCount =
    current.boundary.rules.filter(
      (rule) =>
        rule.outcome ===
        "AGENT_ONLY"
    ).length;

  const humanReviewRuleCount =
    current.boundary.rules.filter(
      (rule) =>
        rule.outcome ===
        "HUMAN_REVIEW"
    ).length;

  const doNotDelegateRuleCount =
    current.boundary.rules.filter(
      (rule) =>
        rule.outcome ===
        "DO_NOT_DELEGATE"
    ).length;

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

  const guidanceInput = {
    workspace,
    baseToolCount,
    baseToolsResolved,
    applyToolState,
    lastAgentError
  };
  const nextCue = localizeGuidance(
    deriveGuidanceState(guidanceInput), guidanceInput, lang
  );

  const approvalAgentPrompt =
    current.status ===
      "APPROVED" &&
    applyToolState ===
      "available"
      ? (lang === "ja" ? approvedPromptJa(current.version) : approvedApplyChatGPTPrompt(current.version))
      : null;

  const inlineBoundaryPromptTargetId =
    nextCue.prompt &&
    (
      nextCue.id ===
        "S14_BLOCKED_REGRESSION" ||
      nextCue.id ===
        "S15_BLOCKED_BOTH"
    ) &&
    nextCue.targetId.startsWith(
      "boundary-rule-"
    )
      ? nextCue.targetId
      : null;

  const inlinePromptTargetId =
    inlineBoundaryPromptTargetId;

  /*
   * The WHERE target and the in-page attention pointer share
   * one source of truth. Most copy-ready ChatGPT handoffs have no
   * in-page pointer because the destination is external. A blocked
   * boundary repair is the exception: its prompt is intentionally
   * embedded inside the exact conflicting rule.
   */
  const pageGuidanceTargetId =
    inlinePromptTargetId ??
    (nextCue.prompt
      ? null
      : nextCue.targetId);

  useEffect(() => {
    setCopyFeedback("");
  }, [
    nextCue.prompt,
    approvalAgentPrompt
  ]);

  useEffect(() => {
    if (
      current.status !==
      "APPLIED"
    ) {
      completionScrolledRef.current =
        false;
      return;
    }

    if (
      completionScrolledRef.current
    ) {
      return;
    }

    completionScrolledRef.current =
      true;

    const frame =
      window.requestAnimationFrame(
        () => {
          const reduceMotion =
            window.matchMedia(
              "(prefers-reduced-motion: reduce)"
            ).matches;

          completionCueRef.current
            ?.scrollIntoView({
              behavior:
                reduceMotion
                  ? "auto"
                  : "smooth",
              block: "start"
            });
        }
      );

    return () =>
      window.cancelAnimationFrame(
        frame
      );
  }, [current.status]);

  const isGuidanceTarget = (
    targetId: string
  ) =>
    pageGuidanceTargetId ===
    targetId;

  const copyPrompt = async (
    prompt: string | null | undefined,
    target:
      HTMLTextAreaElement | null
  ) => {
    if (!prompt) {
      return;
    }

    setCopyFeedback("");

    try {
      await navigator.clipboard
        .writeText(
          prompt
        );

      setCopyFeedback(
        "Copied"
      );
    } catch {
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

  const copyGuidancePrompt =
    () =>
      copyPrompt(
        nextCue.prompt,
        guidancePromptRef.current
      );

  const copyApprovalPrompt =
    () =>
      copyPrompt(
        approvalAgentPrompt,
        approvalPromptRef.current
      );

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
          ? errorText(error.message, lang)
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
          ? "この版そのものを承認しました。下の基本操作から直接反映できます。WebMCP経由の反映は任意です。"
          : "This exact revision is human-approved. Apply it directly below to complete. The WebMCP route is optional."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? errorText(error.message, lang)
          : String(error)
      );
    }
  };

  const applyApprovedDirectly =
    async () => {
      if (
        directApplyBusyRef.current
      ) {
        return;
      }

      directApplyBusyRef.current =
        true;
      setDirectApplyBusy(true);
      setMessage(null);

      try {
        const applied =
          await applyCoordinator
            .apply();

        setLastAgentError(null);

        setMessage(
          lang === "ja"
            ? `承認済みの版 ${getCurrentRevision(applied).version} を反映しました。`
            : `Approved revision ${getCurrentRevision(applied).version} was applied from the human workspace.`
        );
      } catch (error) {
        setMessage(
          error instanceof Error
            ? errorText(error.message, lang)
            : String(error)
        );
      } finally {
        directApplyBusyRef.current =
          false;
        setDirectApplyBusy(false);
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
          ? "この判断を記録しました。次のRevisionでは回帰テストとして使われます。"
          : "The human judgment was recorded. It is now a regression test for future revisions."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? errorText(error.message, lang)
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
          ? "検討する業務を設定しました。画面の案内に沿って、ChatGPTへ検討を依頼してください。"
          : "The work is scoped. The Agent can now propose and challenge delegation changes."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? errorText(error.message, lang)
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
          ? errorText(error.message, lang)
          : String(error)
      );
    }
  };

  const clearCurrentWorkspace = () => {
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

  const closeStartNewDialog = () => {
    setStartNewDialogOpen(
      false
    );

    window.requestAnimationFrame(
      () =>
        startNewButtonRef
          .current
          ?.focus()
    );
  };

  const confirmStartNewWork = () => {
    setStartNewDialogOpen(
      false
    );

    clearCurrentWorkspace();

    window.requestAnimationFrame(
      () =>
        document
          .getElementById(
            "adb-task-title"
          )
          ?.focus()
    );
  };

  const requestStartNewWork = () => {
    const hasWork =
      workspace.task.title
        .trim()
        .length > 0;

    if (!hasWork) {
      clearCurrentWorkspace();
      return;
    }

    setStartNewDialogOpen(
      true
    );
  };

  useEffect(() => {
    if (
      !startNewDialogOpen
    ) {
      return;
    }

    keepCurrentWorkRef
      .current
      ?.focus();
  }, [
    startNewDialogOpen
  ]);


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
          {t("A pull request for agent authority.")}
        </div>

        <button
          id="next-start-new"
          ref={startNewButtonRef}
          className={`adb-reset ${
            isGuidanceTarget(
              "next-start-new"
            )
              ? "is-guidance-target"
              : ""
          }`}
          type="button"
          onClick={
            requestStartNewWork
          }
        >
          {lang === "ja"
            ? "新しい業務"
            : "Start new work"}
        </button>

        <div className="adb-lang" role="group" aria-label={lang === "ja" ? "表示言語" : "Display language"}>
          <button
            type="button"
            className={
              lang === "en"
                ? "active"
                : ""
            }
            aria-pressed={lang === "en"}
            lang="en"
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
            aria-pressed={lang === "ja"}
            lang="ja"
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
              "AIに任せる範囲を考慮する。"
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
              ? "AIは条件を提案し、問題が起きる具体例を検討し、変更がある場合には再検証します。\n最終的な権限と責任は人にあり、AIの提案をもとに業務と委任条件を決定します。\n人が承認した場合だけ、確定事項として反映できます。"
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
                  ? "事前に決めた条件や、過去の判断に合わない点があります。"
                  : current.status ===
                    "APPROVED"
                    ? "この版だけが人によって承認されています。"
                    : current.status ===
                      "APPLIED"
                      ? "承認済みの版が反映されました。"
                      : "ステータス"
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
          <span>{lang === "ja" ? "01 · 人" : "01 · HUMAN"}</span>
          <strong>
            {lang === "ja"
              ? "検討したい業務の提示"
              : "Scope the work"}
          </strong>
        </div>

        <div className="adb-protocol-step">
          <span>{lang === "ja" ? "02 · AI" : "02 · AGENT"}</span>
          <strong>
            {lang === "ja"
              ? "検討と提案"
              : "Propose & challenge"}
          </strong>
        </div>

        <div className="adb-protocol-step">
          <span>{lang === "ja" ? "03 · 人" : "03 · HUMAN"}</span>
          <strong>
            {lang === "ja"
              ? "提案をもとに整理・判断"
              : "Decide the boundary"}
          </strong>
        </div>

        <div className="adb-protocol-step">
          <span>{lang === "ja" ? "04 · 人" : "04 · HUMAN"}</span>
          <strong>
            {lang === "ja"
              ? "検討結果の確定"
              : "Apply approved revision"}
          </strong>
        </div>
      </section>

      <div
        id={
          current.status ===
          "APPLIED"
            ? "workflow-complete"
            : undefined
        }
        ref={
          current.status ===
          "APPLIED"
            ? completionCueRef
            : undefined
        }
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

        {current.status ===
          "APPLIED" && (
          <section
            className="adb-completion-report"
            aria-labelledby="adb-completion-title"
          >
            <div className="adb-completion-report-head">
              <span>
                {lang === "ja"
                  ? "完了レポート"
                  : "COMPLETION REPORT"}
              </span>

              <strong id="adb-completion-title">
                {lang === "ja"
                  ? "このワークフローは完了しました"
                  : "This workflow is complete"}
              </strong>

              <p>
                {lang === "ja"
                  ? "人が承認した境界が正確に反映されています。追加操作は不要です。"
                  : "The exact human-approved boundary is active. No additional action is required."}
              </p>
            </div>

            <dl className="adb-completion-metrics">
              <div>
                <dt>
                  {lang === "ja"
                    ? "反映済みの版"
                    : "Applied revision"}
                </dt>
                <dd>
                  v{current.version}
                </dd>
              </div>

              <div>
                <dt>
                  {lang === "ja"
                    ? "必須制約の違反"
                    : "Guardrail violations"}
                </dt>
                <dd>
                  {guardrailViolations ??
                    0}
                </dd>
              </div>

              <div>
                <dt>
                  {lang === "ja"
                    ? "保護された人の判断"
                    : "Human decisions protected"}
                </dt>
                <dd>
                  {
                    current
                      .knownDecisions
                      .length
                  }
                </dd>
              </div>

              <div>
                <dt>
                  {lang === "ja"
                    ? "回答済みの検討課題"
                    : "Challenges resolved"}
                </dt>
                <dd>
                  {resolvedChallenges}/
                  {
                    current
                      .challenges
                      .length
                  }
                </dd>
              </div>
            </dl>

            <div className="adb-completion-boundary">
              <span>
                {lang === "ja"
                  ? "最終境界"
                  : "FINAL BOUNDARY"}
              </span>

              <p>
                {lang === "ja"
                  ? `ルール内訳：AIだけで完了 ${agentOnlyRuleCount}件 · 人の確認が必要 ${humanReviewRuleCount}件 · 委任しない ${doNotDelegateRuleCount}件 · その他は「${OUTCOME_LABELS.ja[current.boundary.defaultOutcome]}」`
                  : `Rule outcomes: ${agentOnlyRuleCount} agent-only · ${humanReviewRuleCount} human review · ${doNotDelegateRuleCount} do not delegate · Otherwise: ${OUTCOME_LABELS.en[current.boundary.defaultOutcome]}`}
              </p>
            </div>

            <button
              type="button"
              className="adb-completion-new-work"
              onClick={
                requestStartNewWork
              }
            >
              {lang === "ja"
                ? "別の業務を始める"
                : "Start new work"}
            </button>
          </section>
        )}

        {nextCue.where &&
          current.status !==
            "APPLIED" && (
          <div className="adb-guidance-meta">
            <span>{t("WHERE")}</span>
            <strong>
              {nextCue.where}
            </strong>

            {message ===
              "Session restored after reload." && (
              <span
                className="adb-session-restored"
                role="status"
                aria-label={t("Session restored after reload.")}
              >
                {t("SESSION RESTORED")}
              </span>
            )}
          </div>
        )}

        {nextCue.prompt &&
          !inlinePromptTargetId && (
          <div className="adb-guidance-prompt">
            <label htmlFor="adb-guidance-prompt">
              {t("SEND TO CHATGPT")}
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
                {t("Copy for ChatGPT")}
              </button>

              <span
                role="status"
                aria-live="polite"
              >
                {t(copyFeedback)}
              </span>
            </div>
          </div>
        )}

        {nextCue.returnWhen && (
          <div className="adb-guidance-return">
            <span>{t("RETURN WHEN")}</span>
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

        {message &&
          message !==
            "Session restored after reload." && (
          <div
            className="adb-message"
            role="status"
          >
            {t(message)}
          </div>
        )}
      </div>

      <main className="adb-workspace">
        <section className="adb-column adb-boundary-column">
          <div className="adb-section-head">
            <span>01</span>

            <div>
              <strong>
                {lang === "ja"
                  ? "検討業務・概要の入力"
                  : "Current boundary"}
              </strong>

              <small>
                {lang === "ja"
                  ? "検討したい業務と、その背景を記入してください"
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
            }${
              isGuidanceTarget(
                "next-task"
              )
                ? " is-guidance-target"
                : ""
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
                    ? "検討を開始"
                    : "Start with this work"}
                </button>

                <>{lang === "en" && <small>Human-only step. Until this is set, the Agent cannot change delegation authority.</small>}</>
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
                    ? "この作業スペースでは検討対象を固定しています。別の業務を検討する場合は、上部の「新しい業務」から開始します。"
                    : "Task scope is fixed for this workspace. Use Start new work in the header to evaluate a different task."}
                </div>
              </>
            )}
          </div>

          <div className="adb-boundary-summary">
            <span className="adb-card-label">
              {lang === "ja"
                ? (current.version === 1 ? "検討開始時の仮の条件" : "検討中の条件")
                : "CURRENT POLICY"}
            </span>

            {lang === "ja" && <p>
              {current.version === 1
                ? "以下は、検討を始めるために用意した初期条件です。入力した業務を分析した結果ではありません。業務に合うかをAIと検討します。"
                : "下の条件は、これまでの検討を反映した内容です。業務に合っているかを確認し、必要に応じて調整してください。"}
            </p>}
            <p>
              {lang === "ja"
                ? t(current.boundary.label)
                : current.boundary.label}
            </p>
          </div>

          <div
            id="next-boundary"
            className={`adb-rules${
              isGuidanceTarget(
                "next-boundary"
              )
                ? " is-guidance-target"
                : ""
            }`}
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
                  className={`adb-rule-card${
                    isGuidanceTarget(
                      `boundary-rule-${rule.id}`
                    )
                      ? " is-guidance-target"
                      : ""
                  }`}
                  key={rule.id}
                >
                  <div className="adb-rule-head">
                    <strong>
                      {t(rule.label)}
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

                  {inlineBoundaryPromptTargetId ===
                    `boundary-rule-${rule.id}` &&
                    nextCue.prompt && (
                    <div className="adb-guidance-prompt adb-rule-guidance-prompt">
                      <label htmlFor="adb-rule-guidance-prompt">
                        {t("HUMAN DECISION → CHATGPT")}
                      </label>

                      <strong>
                        {t("Send the recorded decision to continue safely")}
                      </strong>

                      <textarea
                        id="adb-rule-guidance-prompt"
                        ref={guidancePromptRef}
                        readOnly
                        rows={6}
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
                          {t("Copy for ChatGPT")}
                        </button>

                        <span
                          role="status"
                          aria-live="polite"
                        >
                          {t(copyFeedback)}
                        </span>
                      </div>
                    </div>
                  )}
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
                  ? "提案内容の確認"
                  : "Review the change"}
              </strong>

              <small>
                {lang === "ja"
                  ? "提案に問題がないか、これまでの判断と照らして確認します"
                  : "Guardrails, past decisions, and new challenges"}
              </small>
            </div>
          </div>

          <div className="adb-review-metrics">
            <div>
              <span>
                {lang === "ja"
                  ? "必須制約の違反"
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
                  ? "課題の検討状況"
                  : "Challenge gate"}
              </span>

              <strong className="adb-gate-value">
                {challengeGateLabel}
              </strong>
            </div>
          </div>

          <div
            id="next-guardrails"
            className={`adb-review-block${
              isGuidanceTarget(
                "next-guardrails"
              )
                ? " is-guidance-target"
                : ""
            }`}
          >
            <div className="adb-block-head">
              <div>
                <span className="adb-card-label">
                  {lang === "ja" ? "検討の前提" : "GUARDRAILS"}
                </span>

                <strong>
                  {lang === "ja"
                    ? "AIに任せないこと・人が確認すること"
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
                  {lang === "ja" ? "判断の記録" : "KNOWN DECISIONS"}
                </span>

                <strong>
                  {lang === "ja"
                    ? "これまでに決めたこと"
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
                    ? "確定した判断はありません"
                    : "No human judgment has been recorded yet."}
                </strong>

                <p>
                  {lang === "ja"
                    ? "AIの検討課題に人が答えると、その判断が次の変更を守る回帰テストとして残ります。"
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
                        {decision.label}
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
                  {lang === "ja" ? "AIからの確認事項" : "AGENT CHALLENGES"}
                </span>

                <strong>
                  {lang === "ja"
                    ? "判断していただきたいこと"
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
                      ? "01 検討したい業務を入力してください"
                      : "First, a human must scope the work."
                    : lang === "ja"
                      ? "AIの検討課題が必要です。"
                      : "Agent Challenge required."}
                </strong>

                <p>
                  {!taskConfigured
                    ? lang === "ja"
                      ? "業務を確定すると、AIによる検証と提案機能が利用できます"
                      : "Until the work is scoped, Agent tools that change, challenge, or review authority are locked."
                    : lang === "ja"
                      ? "この版にはまだAIの検討課題がありません。課題が0件の版は承認可能な状態にはなりません。"
                      : "This revision has no Agent Challenge yet. A revision with zero challenges cannot become approval-ready."}
                </p>

                {taskConfigured && (
                  <p className="adb-agent-guidance-note">
                    {lang === "ja"
                      ? "次に行う操作は、画面上部の案内をご確認ください。"
                      : "The Next Action above is the single source of workflow guidance."}
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
                      className={`adb-challenge ${challenge.status.toLowerCase()}${
                        isGuidanceTarget(
                          "next-challenge"
                        ) &&
                        challenge.id ===
                          nextOpenChallengeId
                          ? " is-guidance-target"
                          : ""
                      }`}
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
                            t(challenge.status)
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
                            ? "人が判断済み。この判断は次回以降の回帰テストになります。"
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
                  className={`adb-check-button${
                    isGuidanceTarget(
                      "next-review"
                    )
                      ? " is-guidance-target"
                      : ""
                  }`}
                  type="button"
                  disabled={
                    !taskConfigured
                  }
                  onClick={
                    runChecks
                  }
                >
                  {lang === "ja"
                    ? "必須制約と過去の判断を再検証"
                    : "Run guardrail & regression checks"}
                </button>
              )}

            {current.status ===
              "READY_FOR_DECISION" && (
              <button
                id="next-approve"
                className={`adb-approve-button${
                  isGuidanceTarget(
                    "next-approve"
                  )
                    ? " is-guidance-target"
                    : ""
                }`}
                type="button"
                onClick={
                  approve
                }
              >
                {lang === "ja"
                  ? `第${current.version}版 を承認`
                  : `Approve revision ${current.version}`}
              </button>
            )}

            {current.status ===
              "APPROVED" && (
              <div
                id="next-approved"
                className="adb-approved-card"
              >
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
                    ? "この版そのものだけが人によって承認されています。"
                    : "This exact revision is human-approved. Only the current approved state can be applied."}
                </p>

                <div
                  id="next-apply-direct"
                  className={`adb-approved-direct${
                    isGuidanceTarget(
                      "next-apply-direct"
                    )
                      ? " is-guidance-target"
                      : ""
                  }`}
                >
                  <span>
                    {lang === "ja"
                      ? "ここで完了"
                      : "COMPLETE HERE"}
                  </span>

                  <strong>
                    {lang === "ja"
                      ? `承認済みの版 ${current.version} を反映`
                      : `Apply approved revision ${current.version}`}
                  </strong>

                  <p>
                    {lang === "ja"
                      ? "適用直前に版のIDと承認時のフィンガープリント（内容の照合値）を再検証します。ChatGPTへの貼り付けは不要です。"
                      : "Revision ID and the human-approved fingerprint are verified again immediately before application. No ChatGPT handoff is required."}
                  </p>

                  <button
                    type="button"
                    disabled={
                      directApplyBusy
                    }
                    onClick={
                      applyApprovedDirectly
                    }
                  >
                    {directApplyBusy
                      ? lang === "ja"
                        ? "承認内容を検証中…"
                        : "Verifying approval…"
                      : lang === "ja"
                        ? `第${current.version}版 を反映して完了`
                        : `Apply revision ${current.version} and complete`}
                  </button>
                </div>

                <div className="adb-approved-agent-option">
                  <div className="adb-approved-agent-head">
                    <span>
                      {t("OPTIONAL · WEBMCP")}
                    </span>

                    <strong>
                      {lang === "ja"
                        ? "ChatGPTに適用を委ねる"
                        : "Apply with ChatGPT"}
                    </strong>

                    <small>
                      {applyToolState ===
                      "available"
                        ? lang === "ja"
                          ? "同じ承認済みの版を、WebMCP経由でAgentに反映させる場合に使用します。"
                          : "Use this optional route to let the Agent apply the same approved revision through WebMCP."
                        : applyToolState ===
                            "failed"
                          ? lang === "ja"
                            ? "WebMCPの適用機能を準備できませんでした。上の基本操作は引き続き利用できます。"
                            : "The WebMCP apply capability is unavailable. Direct apply above remains available."
                          : lang === "ja"
                            ? "WebMCPの適用機能を準備中です。上の基本操作はすぐに利用できます。"
                            : "The WebMCP apply capability is preparing. Direct apply above is already available."}
                    </small>
                  </div>

                  {approvalAgentPrompt && (
                    <div className="adb-guidance-prompt adb-approval-guidance-prompt">
                      <label htmlFor="adb-approval-guidance-prompt">
                        {t("SEND TO CURRENT CHATGPT CONVERSATION")}
                      </label>

                      <strong>
                        {lang === "ja"
                          ? "現在のChatGPT会話へ貼り付けて送信"
                          : "Paste into the current ChatGPT conversation and send"}
                      </strong>

                      <textarea
                        id="adb-approval-guidance-prompt"
                        ref={approvalPromptRef}
                        readOnly
                        rows={3}
                        value={approvalAgentPrompt}
                        onFocus={(event) =>
                          event.currentTarget
                            .select()
                        }
                      />

                      <div className="adb-guidance-copy-row">
                        <button
                          type="button"
                          onClick={
                            copyApprovalPrompt
                          }
                        >
                          {t("Copy instruction for ChatGPT")}
                        </button>

                        <span
                          role="status"
                          aria-live="polite"
                        >
                          {t(copyFeedback)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {current.status ===
              "APPLIED" && (
              <div
                id="next-complete"
                className={`adb-applied-card${
                  isGuidanceTarget(
                    "next-complete"
                  )
                    ? " is-guidance-target"
                    : ""
                }`}
              >
                <span>
                  {t("APPLIED")}
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
                  ? "進捗を一覧化します"
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
                    }${
                      revision.id ===
                        workspace.currentRevisionId &&
                      isGuidanceTarget(
                        "next-current-revision"
                      )
                        ? " is-guidance-target"
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
                          t(revision.changeSummary)
                        }
                      </p>

                      <small>
                        {
                          t(revision.createdBy)
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
            className={`adb-agent-card${
              isGuidanceTarget(
                "next-agent"
              )
                ? " is-guidance-target"
                : ""
            }`}
          >
            <div className="adb-agent-card-head">
              <div>
                <span className="adb-card-label">
                  {lang === "ja" ? "ChatGPTとの連携" : "WEBMCP"}
                </span>

                <strong>
                  {!baseToolsResolved
                    ? t("Checking WebMCP")
                    : baseToolCount >= 5
                      ? t("WebMCP available")
                      : baseToolCount > 0
                        ? t("WebMCP degraded")
                        : t("WebMCP not detected")}
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
                  ? t("CHECKING")
                  : baseToolCount === 0
                    ? t("HUMAN ONLY")
                    : baseToolCount < 5
                      ? (lang === "ja" ? "準備未完了" : `${baseToolCount} / 5 TOOLS`)
                      : (lang === "ja" ? "接続済み" : `${baseToolCount + (applyToolAvailable ? 1 : 0)} TOOLS`)}
              </span>
            </div>

            {lang === "ja" ? (
              <div className="adb-runtime-copy">
                <p>{!baseToolsResolved
                  ? "ChatGPTからこのページを操作できるか確認しています。"
                  : baseToolCount >= 5
                    ? "ChatGPTに、この画面の業務を読み取り、条件の提案や検証を依頼できます。"
                    : "このブラウザでは、ChatGPTとの連携をまだ利用できません。対応する環境でこのページを開いてください。"}</p>
                <p>次に行う操作は、画面上部に表示します。ChatGPTへの依頼が必要なときは、コピーして送れる文面も表示します。</p>
                <p>提案の確認と承認は、この画面で行います。承認後は「反映して完了」のボタンで確定できます。</p>
                <details className="adb-connection-details">
                  <summary>連携の仕組み・接続状況</summary>
                  <p>WebMCPは、ChatGPTがこのページを操作するための仕組みです。検討用の5つの機能に加え、人の承認後に限り、承認した版を反映する機能が使えるようになります。</p>
                  <p>現在使える機能：{baseToolsResolved ? baseToolCount + (applyToolAvailable ? 1 : 0) : "確認中"}</p>
                  <p>AIへの依頼はChatGPT側で行います。検討内容と承認・反映の状態は、このブラウザの作業スペースで管理します。</p>
                </details>
              </div>
            ) : (<>
            <div className="adb-runtime-copy">
              {baseToolsResolved &&
              baseToolCount >= 5 ? (
                <>
                  <strong className="adb-runtime-primary">
                    {t("Site tools ready")}
                  </strong>

                  <div className="adb-runtime-map">
                    <div className="adb-runtime-row adb-runtime-try-row">
                      <span>
                        {t("SITE TOOLS")}
                      </span>

                      <p>
                        {t("Five normal WebMCP tools are registered by this page. Human Approval can expose one additional apply capability.")}
                      </p>
                    </div>

                    <div className="adb-runtime-row adb-runtime-agent-row">
                      <span>
                        {t("AGENT")}
                      </span>

                      <p>
                        {t("A compatible Agent client calls the WebMCP tools exposed by this page. No AI backend.")}
                      </p>
                    </div>

                    <div className="adb-runtime-row adb-runtime-authority-row">
                      <span>
                        {t("AUTHORITY")}
                      </span>

                      <p>
                        {t("The web app owns the boundary, Guardrails, human judgments, approval, and applied state.")}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <strong className="adb-runtime-primary">
                    {!baseToolsResolved
                      ? t("Checking site tools")
                      : baseToolCount > 0
                        ? t("WebMCP setup incomplete")
                        : t("Human workspace available")}
                  </strong>

                  <div className="adb-runtime-map adb-runtime-setup">
                    <div className="adb-runtime-row adb-runtime-try-row">
                      <span>
                        {t("SITE TOOLS")}
                      </span>

                      <p>
                        {!baseToolsResolved
                          ? t("Registration is still in progress.")
                          : baseToolCount > 0
                            ? `${baseToolCount} of 5 normal WebMCP tools are registered. Agent work remains unavailable until all 5 are ready.`
                            : t("No WebMCP site tools are available in this browser.")}
                      </p>
                    </div>

                    <div className="adb-runtime-row adb-runtime-authority-row">
                      <span>
                        {t("WORKSPACE")}
                      </span>

                      <p>
                        {t("Human review and boundary editing remain available in this browser.")}
                      </p>
                    </div>

                    <div className="adb-runtime-row adb-runtime-backend-row">
                      <span>
                        {t("BACKEND")}
                      </span>

                      <p>
                        {t("No AI backend required.")}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="adb-capability">
              <div>
                <span>
                  NORMAL
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
                  AFTER HUMAN APPROVAL
                </span>

                <strong>
                  6
                </strong>
              </div>
            </div>
            </>)}
          </div>

          <div className="adb-principle">
            <span>
              DECISION PATCH
            </span>

            <strong>
              {lang === "ja"
                ? "一度決めたことを、次の検討にも活かします。"
                : "Every human override becomes a test before it becomes a rule."}
            </strong>
          </div>
        </aside>
      </main>

      <footer className="adb-footer">
        <p>
          {t("Foundations empower challenges.")}
        </p>
      </footer>

      {startNewDialogOpen && (
        <div
          className="adb-modal-backdrop"
        >
          <section
            className="adb-start-new-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="adb-start-new-title"
            aria-describedby="adb-start-new-description"
            onKeyDown={(event) => {
              if (
                event.key ===
                "Escape"
              ) {
                event.preventDefault();
                closeStartNewDialog();
                return;
              }

              if (
                event.key !==
                "Tab"
              ) {
                return;
              }

              const first =
                keepCurrentWorkRef
                  .current;

              const last =
                confirmStartNewRef
                  .current;

              if (
                !first ||
                !last
              ) {
                return;
              }

              if (
                event.shiftKey &&
                document.activeElement ===
                  first
              ) {
                event.preventDefault();
                last.focus();
                return;
              }

              if (
                !event.shiftKey &&
                document.activeElement ===
                  last
              ) {
                event.preventDefault();
                first.focus();
              }
            }}
          >
            <span className="adb-dialog-eyebrow">
              {t("CURRENT WORKSPACE")}
            </span>

            <h2 id="adb-start-new-title">
              {t("Start new work?")}
            </h2>

            <p id="adb-start-new-description">
              {t("This will clear the current workspace from this browser session, including its revisions, challenges, human decisions, approval, and applied state. Nothing outside this browser session will be changed.")}
            </p>

            <div className="adb-dialog-actions">
              <button
                ref={keepCurrentWorkRef}
                className="adb-dialog-keep"
                type="button"
                onClick={
                  closeStartNewDialog
                }
              >
                {t("Keep current work")}
              </button>

              <button
                ref={confirmStartNewRef}
                className="adb-dialog-start"
                type="button"
                onClick={
                  confirmStartNewWork
                }
              >
                {t("Start new work")}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
