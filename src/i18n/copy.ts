export const copy = {
  en: {
    title: "One correction can change many future decisions.",
    subtitle:
      "Review what else would change before teaching the agent.",
    input: "HUMAN CORRECTION",
    observed: "Observed case",
    agentBefore: "Agent decision — before",
    correction: "Your correction",
    rationale: "Rationale",
    precedent: "Use this correction to draft candidate rules",
    record: "Record correction",
    simulate: "Generate rules & review impact",
    impact: "IMPACT REVIEW",
    impactEmpty:
      "This correction has not been generalized yet.",
    candidates: "CANDIDATE RULES",
    candidatesEmpty: "No candidate rules yet.",
    evaluation:
      "Synthetic cases evaluated",
    changed: "Decisions changed",
    aligned: "Changed as intended",
    counterexamples: "Counterexamples",
    reviews: "Human reviews avoided",
    selected: "Selected rule",
    noCounterexamples:
      "No unintended decisions were found in this synthetic evaluation set.",
    webmcp: "WebMCP",
    available: "Agent tools are available",
    unavailable:
      "Use a WebMCP-enabled browser to make agent tools available."
  },

  ja: {
    title:
      "一件の修正を、そのまま次のルールにしない。",
    subtitle:
      "AI Agentに覚えさせる前に、他のどのケースまで判断が変わるか、意図しない判断がどこに生まれるかを確認します。",
    input: "人の修正",
    observed: "今回のケース",
    agentBefore: "AI Agentの元の判断",
    correction: "人の判断",
    rationale: "修正理由",
    precedent:
      "この修正を、候補ルール作成に使う",
    record: "この修正を記録",
    simulate:
      "候補ルールを作って影響を確認",
    impact: "他のケースへの影響",
    impactEmpty:
      "この修正は、まだ他のケースには適用されていません。",
    candidates: "候補ルール",
    candidatesEmpty:
      "まだ候補ルールは作られていません。",
    evaluation:
      "デモ用ケースを検証",
    changed:
      "判断が変わるケース",
    aligned:
      "意図どおり変わるケース",
    counterexamples:
      "意図と異なるケース",
    reviews:
      "人の確認が不要になるケース",
    selected:
      "選択中のルール",
    noCounterexamples:
      "この適用範囲では、意図と異なる判断は見つかりませんでした。",
    webmcp: "WebMCP",
    available:
      "Agentが操作できます",
    unavailable:
      "WebMCP対応ブラウザでAgent操作を利用できます。"
  }
} as const;
