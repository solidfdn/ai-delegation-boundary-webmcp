import { afterEach, describe, expect, it, vi } from "vitest";
import { createInteractiveDelegationWorkspace } from "../domains/interactive-delegation-workspace";
import { deriveGuidanceState, type GuidanceInput } from "../core/guidance";
import { computeRevisionFingerprint } from "../core/delegationEngine";
import { approvedPromptJa, errorText, initialLanguage, JA, LANGUAGE_KEY, localizeGuidance, translate } from "./delegation";

afterEach(() => vi.unstubAllGlobals());

function input(): GuidanceInput {
  const workspace = createInteractiveDelegationWorkspace();
  workspace.task.title = "返金申請の確認";
  return { workspace, baseToolCount: 5, baseToolsResolved: true, applyToolState: "available" };
}

describe("Japanese presentation, separate from authority", () => {
  it("retains English and translates every registered label", () => {
    for (const key of Object.keys(JA)) {
      expect(translate(key, "en")).toBe(key);
      expect(translate(key, "ja")).toMatch(/[一-龯ぁ-んァ-ン]/);
    }
  });

  it("preserves arbitrary human and agent text", () => {
    expect(translate("Customer-specific rule ABC", "ja")).toBe("Customer-specific rule ABC");
    expect(translate("顧客固有の判断", "en")).toBe("顧客固有の判断");
  });

  it("requests Japanese agent content without granting approval", () => {
    const value = input();
    const en = deriveGuidanceState(value);
    const ja = localizeGuidance(en, value, "ja");
    expect(ja.prompt).toContain("日本語");
    expect(ja.prompt).toContain("人の判断が必要になるまで");
    expect(ja.prompt).not.toContain("実行許可");
    expect(localizeGuidance(en, value, "en")).toBe(en);
  });

  it.each(["DRAFT", "READY_FOR_DECISION", "APPROVED", "APPLIED"] as const)("does not change fingerprint or revision in %s", async status => {
    const value = input();
    value.workspace.revisions[0].status = status;
    const before = JSON.stringify(value.workspace);
    const fingerprint = await computeRevisionFingerprint(value.workspace);
    const en = deriveGuidanceState(value);
    const ja = localizeGuidance(en, value, "ja");
    expect(ja.id).toBe(en.id);
    expect(ja.targetId).toBe(en.targetId);
    expect(ja.key).toBe(en.key);
    expect(ja.mode).toBe(en.mode);
    expect(JSON.stringify(value.workspace)).toBe(before);
    expect(await computeRevisionFingerprint(value.workspace)).toBe(fingerprint);
    if (status === "APPROVED" || status === "APPLIED") expect(ja.prompt).toBeUndefined();
  });

  it("explicit optional apply authorization is bound to the exact version", () => {
    const prompt = approvedPromptJa(6);
    expect(prompt).toContain("第6版");
    expect(prompt).toContain("版の変更や差し替えは禁止");
    expect(prompt).toContain("一致しなくなった場合も、反映せず停止");
    expect(prompt).toContain("APPLIED");
  });

  it("keeps unknown diagnostic details visible", () => {
    expect(errorText("Unknown code E123", "ja")).toContain("E123");
    expect(errorText("Unknown code E123", "en")).toBe("Unknown code E123");
  });

  it("URL locale overrides stored preference, including explicit English", () => {
    vi.stubGlobal("localStorage", { getItem: (key: string) => key === LANGUAGE_KEY ? "ja" : null });
    vi.stubGlobal("window", { location: { search: "?lang=en" } });
    expect(initialLanguage()).toBe("en");
    vi.stubGlobal("window", { location: { search: "?lang=ja" } });
    expect(initialLanguage()).toBe("ja");
    vi.stubGlobal("window", { location: { search: "?lang=invalid" } });
    expect(initialLanguage()).toBe("ja");
  });

  it("falls back safely when storage is blocked", () => {
    vi.stubGlobal("window", { location: { search: "" } });
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); } });
    expect(initialLanguage()).toBe("en");
  });
});
