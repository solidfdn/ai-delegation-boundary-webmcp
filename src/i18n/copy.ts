export const copy = {
  en: {
    title: "One correction can change many future decisions.",
    subtitle:
      "Review what else would change before teaching the agent.",
    input: "INPUT / HUMAN CORRECTION",
    observed: "Observed case",
    agentBefore: "Agent decision — before",
    correction: "Your correction",
    rationale: "Rationale",
    precedent: "Use this correction as a precedent",
    record: "Record correction",
    simulate: "Generate & simulate patches",
    impact: "IMPACT SIMULATION",
    impactEmpty:
      "No generalized rule exists yet. Record the correction, then simulate candidate patches.",
    candidates: "CANDIDATE PATCHES",
    candidatesEmpty: "No candidate patches yet.",
    evaluation:
      "Complete synthetic evaluation matrix",
    changed: "Decisions changed",
    aligned: "Aligned with reference",
    counterexamples: "Counterexamples",
    reviews: "Human reviews transitioned",
    selected: "Selected patch",
    noCounterexamples:
      "No counterexamples found in this synthetic evaluation matrix.",
    webmcp: "WebMCP",
    available: "inspect_workspace is available to the agent",
    unavailable:
      "Open in a WebMCP-enabled browser to expose agent tools."
  },
  ja: {
    title: "一件の修正が、次の多くの判断を変える。",
    subtitle:
      "Agentに学ばせる前に、他の何が変わるかを確認する。",
    input: "INPUT / 人の修正",
    observed: "観測されたケース",
    agentBefore: "Agentの判断 — 修正前",
    correction: "あなたの修正",
    rationale: "判断理由",
    precedent: "この修正を先行判断として使う",
    record: "修正を記録",
    simulate: "候補パッチを生成・シミュレーション",
    impact: "影響シミュレーション",
    impactEmpty:
      "まだ一般化されたルールはありません。修正を記録し、候補パッチをシミュレーションしてください。",
    candidates: "候補パッチ",
    candidatesEmpty: "候補パッチはまだありません。",
    evaluation:
      "合成データによる全組合せ評価",
    changed: "判断が変わる組合せ",
    aligned: "参照判断と一致",
    counterexamples: "反例",
    reviews: "人レビューから移る判断",
    selected: "選択中のパッチ",
    noCounterexamples:
      "この合成評価マトリクスでは反例は見つかりませんでした。",
    webmcp: "WebMCP",
    available: "inspect_workspace をAgentが利用できます",
    unavailable:
      "WebMCP対応ブラウザで開くとAgent用ツールが公開されます。"
  }
} as const;
