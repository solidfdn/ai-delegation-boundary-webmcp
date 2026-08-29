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
  resolveChallengeAsHuman
} from "./core/delegationHuman";

import type {
  DecisionCondition,
  DelegationOutcome,
  DelegationWorkspace,
  FactorDefinition,
  FactorValue
} from "./core/types";

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
  const [lang, setLang] =
    useState<Lang>("en");

  const [workspace, setWorkspace] =
    useState<DelegationWorkspace>(
      cloneWorkspace
    );

  const [baseToolCount, setBaseToolCount] =
    useState(0);

  const [
    applyToolAvailable,
    setApplyToolAvailable
  ] = useState(false);

  const [message, setMessage] =
    useState<string | null>(null);

  const workspaceRef =
    useRef(workspace);

  workspaceRef.current =
    workspace;

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

  const toolActions =
    useMemo(
      () =>
        createDelegationBoundaryToolActions(
          () =>
            workspaceRef.current,

          updateWorkspace
        ),
      [updateWorkspace]
    );

  useEffect(() => {
    return (
      registerDelegationBoundaryTools(
        toolActions,
        setBaseToolCount
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

      return;
    }

    return (
      registerApplyApprovedRevisionTool(
        toolActions,
        setApplyToolAvailable
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

  const taskTitle =
    lang === "ja"
      ? "AIに任せる業務判断の範囲を決める"
      : workspace.task.title;

  const taskDescription =
    lang === "ja"
      ? "どこまでAIだけで完了させ、どこから人の判断を残すかを検討します。"
      : workspace.task
          .description;

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
  ) => {
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
    updateWorkspace(
      cloneWorkspace()
    );

    setMessage(null);
  };

  return (
    <div
      className={`adb-app adb-${lang}`}
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
          className="adb-reset"
          type="button"
          onClick={reset}
        >
          {lang === "ja"
            ? "リセット"
            : "Reset"}
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

          <h1>
            {lang === "ja"
              ? "AIに任せてよい範囲を検討する。"
              : "Decide what an AI agent may do on its own."}
          </h1>

          <p>
            {lang === "ja"
              ? "AIだけで完了できる条件、人の確認を残す条件、AIに任せない条件を整理します。人が確定した判断は次の変更を守るテストとして残り、承認した版だけが反映できます。"
              : "Define the delegation boundary, challenge proposed changes, preserve human judgments as regression tests, and apply only the exact revision a human approves."}
          </p>
        </div>

        <div className="adb-revision-state">
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

          <div className="adb-task-card">
            <span className="adb-card-label">
              {lang === "ja"
                ? "検討テーマ"
                : "TASK"}
            </span>

            <strong>
              {taskTitle}
            </strong>

            <p>
              {taskDescription}
            </p>
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

          <div className="adb-rules">
            {[...current.boundary.rules]
              .sort(
                (a, b) =>
                  a.priority -
                  b.priority
              )
              .map((rule) => (
                <article
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
                  ? "人の判断待ち"
                  : "Open challenges"}
              </span>

              <strong>
                {
                  openChallenges.length
                }
              </strong>
            </div>
          </div>

          <div className="adb-review-block">
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
                  {lang === "ja"
                    ? "まだ論点は提示されていません。"
                    : "No challenge has been raised yet."}
                </strong>

                <p>
                  {lang === "ja"
                    ? "Boundaryを変更したら、Agentに「この変更が危険になる条件を探して」と依頼します。"
                    : "After changing the boundary, ask the agent to find a scenario that could make the change unsafe or over-broad."}
                </p>
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
                  className="adb-check-button"
                  type="button"
                  onClick={
                    runChecks
                  }
                >
                  {lang === "ja"
                    ? "現在のRevisionを再検証"
                    : "Re-check current revision"}
                </button>
              )}

            {current.status ===
              "READY_FOR_DECISION" && (
              <button
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
                  v{
                    current.version
                  }
                </strong>

                <code>
                  {workspace
                    .approval
                    ?.fingerprint
                    .slice(
                      0,
                      16
                    )}
                  …
                </code>

                <p>
                  {lang === "ja"
                    ? "このFingerprintと一致するRevisionだけをAgentが反映できます。"
                    : "The agent can apply only the revision that still matches this fingerprint."}
                </p>
              </div>
            )}

            {current.status ===
              "APPLIED" && (
              <div className="adb-applied-card">
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
                  : "History stays immutable"}
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

          <div className="adb-agent-card">
            <div className="adb-agent-card-head">
              <div>
                <span className="adb-card-label">
                  WEBMCP
                </span>

                <strong>
                  {lang === "ja"
                    ? "Agentの操作権限"
                    : "Agent capability surface"}
                </strong>
              </div>

              <span
                className={
                  baseToolCount >
                  0
                    ? "live"
                    : "offline"
                }
              >
                {baseToolCount >
                0
                  ? `${baseToolCount +
                      (applyToolAvailable
                        ? 1
                        : 0)} LIVE`
                  : "NOT DETECTED"}
              </span>
            </div>

            <p>
              {baseToolCount >
              0
                ? lang === "ja"
                  ? "Agentは状態確認・変更案作成・Challenge・再検証・履歴確認まで可能です。人が正確なRevisionを承認するまで、反映操作はAgentに存在しません。"
                  : "The agent can inspect, propose, challenge, review, and inspect history. Apply does not exist in the agent surface until a human approves the exact revision."
                : lang === "ja"
                  ? "WebMCP対応環境で開くとAgent操作が有効になります。"
                  : "Open in a WebMCP-enabled environment to expose the agent tools."}
            </p>

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
        <div>
          SOLIFAN
        </div>

        <p>
          {lang === "ja"
            ? "AIに何ができるかではなく、どこまで任せるかを設計する。"
            : "Design what the agent is allowed to do—not only what it can do."}
        </p>
      </footer>
    </div>
  );
}
