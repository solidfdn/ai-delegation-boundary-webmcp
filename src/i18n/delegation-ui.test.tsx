import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import DelegationApp from "../DelegationApp";
import { createInteractiveDelegationWorkspace } from "../domains/interactive-delegation-workspace";

afterEach(() => vi.unstubAllGlobals());

function render(lang: string, workspace = createInteractiveDelegationWorkspace()) {
  vi.stubGlobal("window", {
    location: { search: `?lang=${lang}` },
    sessionStorage: { getItem: () => JSON.stringify(workspace), removeItem: () => {} }
  });
  return renderToStaticMarkup(<DelegationApp />);
}

it("renders Japanese setup, language control and next action", () => {
  const html = render("ja");
  expect(html).toContain("AIに任せる範囲を、人が決める。");
  expect(html).toContain("検討する業務を設定してください");
  expect(html).toContain("この業務で検討を開始");
  expect(html).toContain('lang="ja"');
  expect(html).not.toContain("Define the work before any Agent");
});

it("retains the English experience", () => {
  const html = render("en");
  expect(html).toContain("Decide what an AI agent");
  expect(html).toContain("Start with this work");
  expect(html).not.toContain("検討する業務を設定してください");
});

it("does not replace custom policy, rule or decision labels with stock translations", () => {
  const workspace = createInteractiveDelegationWorkspace();
  workspace.task.title = "対象業務を保持";
  const current = workspace.revisions[0];
  current.boundary.label = "独自方針を保持";
  current.boundary.rules[0].label = "更新したルール名を保持";
  current.knownDecisions.push({ id: "custom", label: "個別判断名を保持", facts: {}, expectedOutcome: "HUMAN_REVIEW", rationale: "理由", createdInRevisionId: current.id });
  const html = render("ja", workspace);
  for (const text of ["対象業務を保持", "独自方針を保持", "更新したルール名を保持", "個別判断名を保持"]) expect(html).toContain(text);
});

it("renders Japanese completion without a follow-up prompt", () => {
  const workspace = createInteractiveDelegationWorkspace();
  workspace.task.title = "完了表示のテスト";
  workspace.revisions[0].status = "APPLIED";
  const html = render("ja", workspace);
  expect(html).toContain("このワークフローは完了しました");
  expect(html).toContain("第1版の反映が完了しました");
  expect(html).not.toContain('id="adb-guidance-prompt"');
});
