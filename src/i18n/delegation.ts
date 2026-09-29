import type { GuidanceInput, GuidanceState, GuidanceStateId } from "../core/guidance";

export type Language = "en" | "ja";
export const LANGUAGE_KEY = "ai-delegation-boundary:language";

// Locale is a presentation preference, never part of approval-bound workspace data.
export function initialLanguage(): Language {
  try {
    const query = new URLSearchParams(window.location.search).get("lang");
    if (query === "ja" || query === "en") return query;
    return localStorage.getItem(LANGUAGE_KEY) === "ja" ? "ja" : "en";
  } catch { return "en"; }
}

export const JA: Record<string, string> = {
  "A pull request for agent authority.": "AIに任せる範囲を、人が決める。",
  "WHERE": "操作する場所",
  "SESSION RESTORED": "前回の作業を復元しました",
  "Session restored after reload.": "前回の作業を復元しました。",
  "SEND TO CHATGPT": "ChatGPTへ送信する文面",
  "SEND TO CURRENT CHATGPT CONVERSATION": "現在のChatGPT会話へ送信する文面",
  "Copy for ChatGPT": "ChatGPT用の文面をコピー",
  "Copy instruction for ChatGPT": "適用の指示をコピー",
  "Copied": "コピーしました",
  "Select and copy the text above.": "上の文面を選択してコピーしてください。",
  "Selected — press Ctrl+C.": "文面を選択しました。Ctrl+C（Macは⌘C）でコピーしてください。",
  "RETURN WHEN": "この画面に戻るタイミング",
  "HUMAN DECISION → CHATGPT": "人の判断をChatGPTへ伝える",
  "Send the recorded decision to continue safely": "記録した判断を伝えて、検討を続けます",
  "KNOWN DECISIONS": "記録された人の判断",
  "AGENT CHALLENGES": "AIが提示した検討課題",
  "GUARDRAILS": "必ず守る制約",
  "OPTIONAL · WEBMCP": "任意の操作 · WebMCP",
  "APPLIED": "反映済み",
  "OPEN": "判断待ち",
  "RESOLVED": "判断済み",
  "HUMAN": "人",
  "AGENT": "AIエージェント",
  "SYSTEM": "システム",
  "CURRENT WORKSPACE": "現在の作業スペース",
  "Start new work?": "新しい業務を始めますか？",
  "This will clear the current workspace from this browser session, including its revisions, challenges, human decisions, approval, and applied state. Nothing outside this browser session will be changed.": "このブラウザのセッションに保存された現在の作業（変更履歴、検討課題、人の判断、承認・反映の状態）を消去します。この操作は元に戻せません。このブラウザのセッション外の情報は変更しません。",
  "Keep current work": "現在の作業を続ける",
  "Start new work": "新しい業務を始める",
  "Checking WebMCP": "WebMCPを確認中",
  "WebMCP available": "WebMCPを利用できます",
  "WebMCP degraded": "WebMCPの準備が不完全です",
  "WebMCP not detected": "WebMCP未検出",
  "CHECKING": "確認中",
  "HUMAN ONLY": "人の操作のみ",
  "Site tools ready": "AI用ツールの準備ができました",
  "SITE TOOLS": "サイトのツール",
  "Five normal WebMCP tools are registered by this page. Human Approval can expose one additional apply capability.": "このページは通常5つのWebMCPツールを公開します。人が承認すると、承認済みの版を反映するツールが1つ追加されます。",
  "A compatible Agent client calls the WebMCP tools exposed by this page. No AI backend.": "対応するAIエージェントが、このページのWebMCPツールを呼び出します。本アプリにAIバックエンドはありません。",
  "AUTHORITY": "管理する主体",
  "The web app owns the boundary, Guardrails, human judgments, approval, and applied state.": "委任条件、必ず守る制約、人の判断、承認・反映の状態は、このWebアプリが管理します。",
  "Checking site tools": "サイトのツールを確認中",
  "WebMCP setup incomplete": "WebMCPの準備が完了していません",
  "Human workspace available": "人による操作は利用できます",
  "Registration is still in progress.": "ツールを登録しています。しばらくお待ちください。",
  "No WebMCP site tools are available in this browser.": "このブラウザではWebMCPツールを利用できません。",
  "WORKSPACE": "作業スペース",
  "Human review and boundary editing remain available in this browser.": "このブラウザでも、人による確認や委任条件の編集は利用できます。",
  "BACKEND": "バックエンド",
  "No AI backend required.": "AIバックエンドは不要です。",
  "Foundations empower challenges.": "確かな基盤が、挑戦を支える。",
  "Awaiting human task scope": "人による業務の設定待ち",
  "Never delegate irreversible execution": "取り消せない処理はAIに任せない",
  "Unknown policy requires human review": "ルールが不明なら人が確認する",
  "Delegate low-risk standard decisions": "条件を満たす通常の判断をAIに任せる",
  "AI may complete only low-impact, reversible, well-supported standard decisions.": "影響が小さく、取り消し可能で、十分な根拠がある通常の判断だけをAIに任せます。",
  "Go to conflicting rule": "矛盾しているルールを確認",
  "Go to boundary rules": "委任条件を確認",
  "Go to Work to delegate": "業務を設定する",
  "Go to WebMCP status": "WebMCPの状態を確認",
  "Go to Agent Challenge": "検討課題に回答する",
  "Go to Guardrails": "必ず守る制約を確認",
  "Go to approval": "承認内容を確認",
  "Go to direct apply": "承認済みの版を反映する",
  "Go to Start new work": "新しい業務の開始へ",
  "01 · Current boundary → Work to delegate": "01 · 現在の委任条件 → 検討する業務",
  "01 · Current boundary → boundary rules": "01 · 現在の委任条件 → ルール",
  "02 · Review the change → Agent Challenges": "02 · 変更を検証 → AIが提示した検討課題",
  "02 · Review the change → Guardrails": "02 · 変更を検証 → 必ず守る制約",
  "03 · Revision history → WebMCP": "03 · 検討履歴 → WebMCP",
  "Header → Start new work": "画面上部 → 新しい業務",
  "Top → completion report": "画面上部 → 完了レポート",
  "ChatGPT Desktop → current conversation": "ChatGPTデスクトップ → 現在の会話",
  "Return here when a Human Decision appears.": "人の判断が求められたら、この画面に戻って回答してください。",
  "Return here when a new Human Decision appears.": "新しい判断が求められたら、この画面に戻って回答してください。",
  "Return here when ChatGPT asks for the next Human Decision.": "ChatGPTが次の判断を求めたら、この画面に戻ってください。",
  "Return here after ChatGPT completes the retry or asks for human judgment.": "ChatGPTが再試行を終えたとき、または人の判断を求めたときに戻ってください。",
  "Continue only when this page shows 5 WebMCP tools available.": "このページで5つのWebMCPツールが利用可能になってから進めてください。",
  "Continue only when all 5 normal tools are available.": "通常の5つのツールがすべて利用可能になってから進めてください。",
  "Return here when the workspace becomes Blocked, Ready for decision, or asks for another Human Decision.": "修正が必要になったとき、承認可能になったとき、または新しい判断を求められたときに戻ってください。",
  "Task title must contain at least 3 characters.": "業務名は3文字以上で入力してください。",
  "Task title must not exceed 180 characters.": "業務名は180文字以内で入力してください。",
  "Task context must not exceed 1000 characters.": "背景・制約は1000文字以内で入力してください。",
  "Task scope is already fixed for this workspace. Reset the workspace to evaluate another task.": "この作業スペースの業務は設定済みです。別の業務は「新しい業務」から開始してください。",
  "Task scope can be set only before delegation analysis begins.": "業務は委任条件の検討を始める前に設定してください。",
  "Only a revision that is READY_FOR_DECISION can be approved.": "検証を終え、承認可能になった版だけを承認できます。",
  "No human-approved revision is available.": "人が承認した版がありません。先に承認を行ってください。",
  "Human approval does not match the current revision.": "承認した版と現在の版が一致しません。現在の内容を確認してください。",
  "The current revision is not approved.": "現在の版は承認されていません。",
  "Approved revision fingerprint no longer matches the current state.": "承認後に内容が変わったため反映できません。現在の内容を再確認し、承認し直してください。",
  "The approved revision is already being applied. Wait for the current application to finish.": "承認済みの版を反映中です。完了までお待ちください。",
  "The workspace changed while the approved revision was being verified. Review the current state before applying again.": "承認内容の検証中に作業内容が変わりました。現在の内容を確認してから、再度反映してください。"
};

export function translate(text: string, lang: Language): string {
  return lang === "ja" ? JA[text] ?? text : text;
}

// Unknown diagnostics remain visible verbatim; do not invent a recovery action.
export function errorText(text: string, lang: Language): string {
  return lang === "ja" ? JA[text] ?? `操作を完了できませんでした。詳細：${text}` : text;
}

const GUIDANCE_JA: Record<GuidanceStateId, [string, string]> = {
  S01_SCOPE_WORK: ["検討する業務を設定してください", "AIが委任条件を変更する前に、人が対象の業務を定めます。"],
  S02_CHECKING_WEBMCP: ["WebMCPの利用可否を確認しています", "このページのツールを登録中です。操作せずにお待ちください。"],
  S03_WEBMCP_NOT_DETECTED: ["このページをChatGPTデスクトップで開いてください", "人による操作は利用できます。AIへの引き継ぎにはWebMCPツールが必要です。"],
  S04_WEBMCP_DEGRADED: ["AIに依頼する前にページを再読み込みしてください", "ツールの登録が不完全です。通常の5つのツールが揃うまでAIへの依頼は開始しないでください。"],
  S05_INITIAL_AGENT_HANDOFF: ["AIと委任条件の検討を始めます", "業務を設定しました。下の文面をコピーしてChatGPTの現在の会話へ送信してください。"],
  S06_FRESH_CHALLENGE_HANDOFF: ["変更後の委任条件を再検証します", "条件が変わったため、以前の検討課題は使えません。ChatGPTに現在の版の問題点を改めて検討してもらいます。"],
  S07_HUMAN_CHALLENGE: ["人の判断を1つ選んでください", "AIだけで完了してよい・人の確認を残す・AIに任せない、のいずれかを選びます。"],
  S08_CONTINUE_TO_REVIEW: ["判断を反映して検証を続けます", "人の判断を記録しました。下の文面でChatGPTに現在の版を再確認・検証してもらいます。"],
  S09_REVIEW_NEEDS_CHALLENGE: ["現在の版に対する検討課題が必要です", "AIが問題点を検討していない版は、承認可能な状態にはなりません。"],
  S10_REVIEW_HAS_OPEN_CHALLENGE: ["未回答の検討課題に回答してください", "人の判断が必要な課題が残っている間は、検証を完了できません。"],
  S11_INVARIANT_VERIFICATION_INCOMPLETE: ["この版は承認できません", "必ず守る制約の検証が全判断範囲を網羅できていません。一部だけの検証では承認可能になりません。"],
  S12_BLOCKED_WITH_OPEN_CHALLENGE: ["先に未回答の検討課題に回答してください", "この版には修正が必要です。人の判断を待っている課題も残っています。"],
  S13_BLOCKED_GUARDRAIL: ["矛盾している委任条件を修正してください", "現在の委任条件は、必ず守る制約に違反しています。"],
  S14_BLOCKED_REGRESSION: ["矛盾している委任条件を修正してください", "現在の委任条件は、以前に記録した人の判断と矛盾しています。"],
  S15_BLOCKED_BOTH: ["矛盾している委任条件を修正してください", "現在の委任条件は、必ず守る制約と過去の人の判断の両方に矛盾しています。"],
  S16_READY_FOR_HUMAN_APPROVAL: ["", "検証が完了しました。内容を確認し、人が最終的に承認します。"],
  S17_APPLY_TOOL_REGISTERING: ["", "この画面で直接反映して完了できます。任意で使えるChatGPT経由の反映機能は準備中です。"],
  S18_APPROVED_DIRECT_APPLY: ["", "この画面で直接反映して完了できます。ChatGPTへの貼り付けは不要です。WebMCP経由の反映も任意で選べます。"],
  S19_APPLY_TOOL_FAILED: ["", "この画面で直接反映して完了できます。ChatGPT経由の反映機能は、再読み込みするまで利用できません。"],
  S20_APPLIED_COMPLETE: ["", "人が承認した委任条件を、そのまま反映しました。この作業で追加の操作は不要です。"],
  S21_INVALID_CURRENT_STATE: ["現在の状態を確認してください", "安全に進められる次の操作を特定できません。必要な記録を控えたうえで、新しい業務を始めてください。"],
  S22_AGENT_TOOL_ERROR: ["現在の作業から再試行してください", ""]
};

export function approvedPromptJa(version: number): string {
  return `人による実行許可：現在、人が承認している第${version}版を、利用可能なサイトツールでそのまま反映してください。版の変更や差し替えは禁止します。作業スペースが反映済み（APPLIED）になったら停止してください。承認が現在の版と一致しなくなった場合も、反映せず停止してください。日本語で報告してください。`;
}

export function localizeGuidance(cue: GuidanceState, input: GuidanceInput, lang: Language): GuidanceState {
  if (lang === "en") return cue;
  const current = input.workspace.revisions.find(r => r.id === input.workspace.currentRevisionId)!;
  const [action, detail] = GUIDANCE_JA[cue.id];
  const t = (text: string) => translate(text, lang);
  let prompt = cue.prompt;
  if (prompt) {
    prompt = cue.id === "S05_INITIAL_AGENT_HANDOFF"
      ? "この作業スペースで設定済みの業務について、安全な委任条件を検討してください。利用可能なサイトツールを使い、人の判断が必要になるまで進めてください。提案、検討課題、説明は日本語で記載してください。"
      : "現在の作業スペースから続けてください。日本語で説明し、人の判断が必要になったら停止してください。";
    if (cue.id === "S14_BLOCKED_REGRESSION" || cue.id === "S15_BLOCKED_BOTH") {
      const failures = current.review?.regressions.filter(r => !r.passed) ?? [];
      const reduction = failures.some(r => r.actualOutcome === "AGENT_ONLY" && r.expectedOutcome !== "AGENT_ONLY");
      prompt = "人の判断：記録済みの人の判断を維持してください。検証に失敗した各ケースの結果が、記録された結果と一致するように、矛盾する委任条件を調整してください。"
        + (reduction ? "既存の判断要素では対象ケースを安全に区別できない場合、矛盾するAI単独実行ルールの削除を許可します。" : "記録された結果を維持するために必要な最小限の変更にとどめてください。")
        + (cue.id === "S15_BLOCKED_BOTH" ? "必ず守る制約はすべて維持してください。" : "")
        + "利用可能なサイトツールで、次に人の判断が必要になるまで進めてください。日本語で説明してください。";
    }
  }
  const isApply = ["S17_APPLY_TOOL_REGISTERING", "S18_APPROVED_DIRECT_APPLY", "S19_APPLY_TOOL_FAILED"].includes(cue.id);
  const where = JA[cue.where] ?? (cue.where.startsWith("01 · Current boundary → ")
    ? `01 · 現在の委任条件 → ${t(cue.where.slice("01 · Current boundary → ".length))}` : cue.where);
  return {
    ...cue,
    owner: cue.mode === "COMPLETE" ? "作業完了" : cue.mode === "HUMAN" ? "次の操作 · 人" : cue.mode === "CHATGPT" ? "次の操作 · ChatGPT" : "確認・復旧",
    action: isApply ? `承認済みの第${current.version}版を反映してください` : cue.id === "S16_READY_FOR_HUMAN_APPROVAL" ? `第${current.version}版を承認してください` : cue.id === "S20_APPLIED_COMPLETE" ? `第${current.version}版の反映が完了しました` : action,
    detail: cue.id === "S22_AGENT_TOOL_ERROR" ? errorText(cue.detail, lang) : detail,
    where: isApply ? `02 · 変更を検証 → 承認済みの第${current.version}版を反映` : cue.id === "S16_READY_FOR_HUMAN_APPROVAL" ? `02 · 変更を検証 → 第${current.version}版を承認` : where,
    goLabel: cue.goLabel ? t(cue.goLabel) : undefined,
    returnWhen: cue.returnWhen ? t(cue.returnWhen) : undefined,
    prompt
  };
}
