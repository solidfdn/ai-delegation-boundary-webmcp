import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BusinessDiscussion, { discussionPrompt } from "./BusinessDiscussion";

it("carries supplied scope and evidence without inventing absent facts or authorizing approval", () => {
  const prompt = discussionPrompt("メール対応", "送信は担当者", "下書きまで", "社内FAQ", "");
  expect(prompt).toContain("任せたい処理・実行範囲：下書きまで");
  expect(prompt).toContain("判断に使う資料・ルール：社内FAQ");
  expect(prompt).toContain("間違った場合の影響・戻せる範囲：未確認");
  expect(prompt).toContain("承認・適用は行わない");
  expect(prompt).toContain("表現できない処理別の区別や条件");
});

it("offers a usable request only after work has been scoped", () => {
  const before = renderToStaticMarkup(<BusinessDiscussion task="" context="" configured={false} />);
  const after = renderToStaticMarkup(<BusinessDiscussion task="メール対応" context="" configured />);
  expect(before).not.toContain("依頼文をコピー</button>");
  expect(after).toContain("依頼文をコピー</button>");
  expect(after).toContain("このページだけではAIの分析は始まりません");
  expect(after).toContain("入力した業務への提案ではありません");
});
