export const copy = {
  en: {
    title: "One correction can change many future decisions.",
    subtitle: "Review the impact before teaching the agent.",
    input: "INPUT / HUMAN CORRECTION",
    observed: "Observed case",
    agentBefore: "Agent decision — before",
    correction: "Your correction",
    rationale: "Rationale",
    precedent: "Use this correction as a precedent",
    record: "Record correction",
    impact: "IMPACT SIMULATION",
    impactEmpty:
      "No rule has been generalized yet. Candidate patches and affected decisions will appear here after simulation.",
    candidates: "CANDIDATE PATCHES",
    candidatesEmpty:
      "No candidate patches yet.",
    webmcp: "WebMCP",
    available: "inspect_workspace is available to the agent",
    unavailable: "Open in a WebMCP-enabled browser to expose agent tools."
  },
  ja: {
    title: "一件の修正が、次の多くの判断を変える。",
    subtitle: "Agentに学ばせる前に、その影響を確認する。",
    input: "INPUT / 人の修正",
    observed: "観測されたケース",
    agentBefore: "Agentの判断 — 修正前",
    correction: "あなたの修正",
    rationale: "判断理由",
    precedent: "この修正を先行判断として使う",
    record: "修正を記録",
    impact: "影響シミュレーション",
    impactEmpty:
      "まだ判断ルールは一般化されていません。シミュレーション後、候補ルールと影響を受ける判断がここに表示されます。",
    candidates: "候補パッチ",
    candidatesEmpty:
      "候補パッチはまだありません。",
    webmcp: "WebMCP",
    available: "inspect_workspace をAgentが利用できます",
    unavailable: "WebMCP対応ブラウザで開くとAgent用ツールが公開されます。"
  }
} as const;
