import { useEffect, useState } from "react";

export const FACTOR_HELP: Record<string, string> = {
  evidence_quality: "何を確認すれば判断できますか。例：申請内容と注文記録が一致している。『高』などの区分だけでは、確認した資料までは決まりません。",
  impact: "AIが間違えた場合、誰にどんな損失が生じますか。金額・相手への影響・対応にかかる手間を具体的に確認します。",
  reversibility: "対象は、AIに任せる処理です。例：メールの下書きは直せますが、送信後に相手が読んだ内容は戻せません。利用するシステムの仕様も確認してください。",
  policy_clarity: "判断に使える手順書・社内ルールがありますか。例：返金対象と上限額が明記されている。",
  exceptionality: "いつもの手順で扱えますか。例：通常の申請か、苦情や重複申請など個別対応が必要な案件か。"
};

export function discussionPrompt(task: string, context: string, treatment: string, evidence: string, mistake: string) {
  return `この画面の業務について、AIに任せる処理と、人が確認・対応する処理を整理してください。まず利用可能なサイトツールで現在の状態を確認してください。\n\n業務：${task}\n背景・既存ルール：${context || "未記入"}\n任せたい処理・実行範囲：${treatment || "未確認。業務名から決めつけず、確認事項として提示してください。"}\n判断に使う資料・ルール：${evidence || "未確認"}\n間違った場合の影響・戻せる範囲：${mistake || "未確認"}\n\n処理ごとに「対象の処理／提案する任せ方／その理由と参照した情報／未確認の点」を示してください。下書き・登録・送信・決済などを混同しないでください。未確認の情報を確認済みの事実として扱わず、何を調べれば判断できるかを示してください。\nこの画面の初期条件は業務の分析結果ではありません。条件変更を提案する場合は現在の判断項目で表現できる内容だけをサイトツールに反映し、表現できない処理別の区別や条件はその限界を説明してください。具体的な失敗例で検証し、人の判断が必要なところで止めてください。承認・適用は行わないでください。`;
}

export default function BusinessDiscussion({ task, context, configured }: { task: string; context: string; configured: boolean }) {
  const [treatment, setTreatment] = useState("");
  const [evidence, setEvidence] = useState("");
  const [mistake, setMistake] = useState("");
  const [feedback, setFeedback] = useState("");
  useEffect(() => { if (!configured) { setTreatment(""); setEvidence(""); setMistake(""); setFeedback(""); } }, [configured]);
  const prompt = discussionPrompt(task, context, treatment, evidence, mistake);
  return <section className="adb-business-discussion" aria-labelledby="business-discussion-title">
    <span className="adb-card-label">業務に合わせて考える</span>
    <h3 id="business-discussion-title">AIに、どの処理まで任せますか</h3>
    <p>同じ業務でも、案を作ることと、送信・実行することでは影響が異なります。分かる範囲で記入し、分からないことは空欄のままで構いません。</p>
    <div className="adb-task-field"><label htmlFor="discussion-treatment">1. 任せたい処理</label><small>処理の始まりと終わりを書いてください。</small><textarea id="discussion-treatment" value={treatment} maxLength={1000} rows={3} placeholder="例：問い合わせを読み、返信の下書きを作る。送信は担当者が行う。" onChange={e => setTreatment(e.target.value)} /></div>
    <div className="adb-task-field"><label htmlFor="discussion-evidence">2. 判断に使う資料・ルール</label><small>今の業務で、何を見て判断していますか。</small><textarea id="discussion-evidence" value={evidence} maxLength={1000} rows={3} placeholder="例：注文記録、問い合わせ内容、返品規定。規定にない案件は責任者に確認する。" onChange={e => setEvidence(e.target.value)} /></div>
    <div className="adb-task-field"><label htmlFor="discussion-mistake">3. 間違った場合に起きること</label><small>誰に影響が出るか、どの段階なら直せるかを書いてください。</small><textarea id="discussion-mistake" value={mistake} maxLength={1000} rows={3} placeholder="例：下書きなら送信前に直せる。送信すると誤った案内が顧客に届く。" onChange={e => setMistake(e.target.value)} /></div>
    <div className="adb-business-example"><strong>検討例：メール対応</strong><p>AIは下書きを作成 → 担当者が内容を確認 → 担当者が送信</p><small>理由：送信前なら修正できます。送信後に相手が読んだ内容は取り消せません。これは説明用の例で、入力した業務への提案ではありません。</small></div>
    {configured ? <details className="adb-business-request"><summary>この内容をもとに、ChatGPTへ検討を依頼する</summary><p>コピーした文面を、サイトツールを使えるChatGPTの会話へ送信してください。このページだけではAIの分析は始まりません。</p><textarea aria-label="ChatGPTへの依頼文" readOnly value={prompt} rows={7} onFocus={e => e.currentTarget.select()} /><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(prompt); setFeedback("コピーしました。ChatGPTの会話へ貼り付けて送信してください。"); } catch { setFeedback("依頼文を選択し、手動でコピーしてください。"); } }}>依頼文をコピー</button><small role="status">{feedback}</small></details> : <p className="adb-business-note">上の業務入力で「検討を開始」を押すと、これらの内容を含む依頼文をコピーできます。</p>}
    <small>この欄は検討用のメモです。記入だけで委任条件は変更されません。ページを再読み込みするとメモは消えます。</small>
  </section>;
}
