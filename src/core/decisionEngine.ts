import type {
  Decision,
  DecisionCase,
  DecisionPatch,
  EvaluationCase,
  EvidenceLevel,
  Level,
  PatchSimulation,
  WorkspaceState
} from "./types";

const levels: Level[] = ["LOW", "MEDIUM", "HIGH"];
const evidenceLevels: EvidenceLevel[] = ["WEAK", "PARTIAL", "STRONG"];

const levelScore: Record<Level, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2
};

const evidenceScore: Record<EvidenceLevel, number> = {
  WEAK: 0,
  PARTIAL: 1,
  STRONG: 2
};

export function baselineDecision(c: DecisionCase): Decision {
  if (c.evidenceStrength === "WEAK" && c.potentialHarm === "HIGH") {
    return "DECLINE";
  }

  if (
    c.urgency === "HIGH" &&
    c.evidenceStrength === "STRONG" &&
    c.potentialHarm !== "HIGH" &&
    c.vulnerability !== "HIGH"
  ) {
    return "APPROVE";
  }

  return "HUMAN_REVIEW";
}

export function referenceDecision(c: DecisionCase): Decision {
  if (
    c.evidenceStrength === "WEAK" &&
    c.potentialHarm === "HIGH"
  ) {
    return "DECLINE";
  }

  if (
    c.urgency === "HIGH" &&
    c.evidenceStrength !== "WEAK" &&
    c.potentialHarm !== "HIGH" &&
    (
      c.vulnerability === "HIGH" ||
      c.continuityImpact === "HIGH"
    )
  ) {
    return "APPROVE";
  }

  if (
    c.urgency === "LOW" &&
    c.vulnerability === "LOW" &&
    c.evidenceStrength === "WEAK"
  ) {
    return "DECLINE";
  }

  return "HUMAN_REVIEW";
}

export function generateEvaluationSet(): EvaluationCase[] {
  const cases: EvaluationCase[] = [];
  let index = 1;

  for (const urgency of levels) {
    for (const evidenceStrength of evidenceLevels) {
      for (const potentialHarm of levels) {
        for (const vulnerability of levels) {
          for (const continuityImpact of levels) {
            const base: DecisionCase = {
              id: `EVAL-${String(index).padStart(3, "0")}`,
              caseType: "Decision review case",
              urgency,
              evidenceStrength,
              potentialHarm,
              vulnerability,
              continuityImpact
            };

            cases.push({
              ...base,
              baselineDecision: baselineDecision(base),
              referenceDecision: referenceDecision(base)
            });

            index += 1;
          }
        }
      }
    }
  }

  return cases;
}

export function generateCandidatePatches(
  workspace: WorkspaceState
): DecisionPatch[] {
  const c = workspace.observedCase;
  const outcome = workspace.humanCorrection.decision;

  return [
    {
      id: "patch-narrow",
      scope: "NARROW",
      outcome,
      conditions: {
        urgencyAtLeast: c.urgency,
        evidenceAtLeast: c.evidenceStrength,
        vulnerabilityAtLeast: c.vulnerability,
        potentialHarmAtMost: c.potentialHarm,
        continuityAtLeast: c.continuityImpact
      }
    },
    {
      id: "patch-balanced",
      scope: "BALANCED",
      outcome,
      conditions: {
        urgencyAtLeast: c.urgency,
        evidenceAtLeast: c.evidenceStrength,
        vulnerabilityAtLeast: c.vulnerability,
        potentialHarmAtMost: c.potentialHarm
      }
    },
    {
      id: "patch-broad",
      scope: "BROAD",
      outcome,
      conditions: {
        urgencyAtLeast: c.urgency,
        evidenceAtLeast: c.evidenceStrength,
        potentialHarmAtMost: c.potentialHarm
      }
    }
  ];
}

function matchesPatch(
  c: DecisionCase,
  patch: DecisionPatch
): boolean {
  const x = patch.conditions;

  if (
    x.urgencyAtLeast &&
    levelScore[c.urgency] < levelScore[x.urgencyAtLeast]
  ) return false;

  if (
    x.evidenceAtLeast &&
    evidenceScore[c.evidenceStrength] <
      evidenceScore[x.evidenceAtLeast]
  ) return false;

  if (
    x.vulnerabilityAtLeast &&
    levelScore[c.vulnerability] <
      levelScore[x.vulnerabilityAtLeast]
  ) return false;

  if (
    x.potentialHarmAtMost &&
    levelScore[c.potentialHarm] >
      levelScore[x.potentialHarmAtMost]
  ) return false;

  if (
    x.continuityAtLeast &&
    levelScore[c.continuityImpact] <
      levelScore[x.continuityAtLeast]
  ) return false;

  return true;
}

export function simulatePatch(
  patch: DecisionPatch,
  evaluationSet: EvaluationCase[]
): PatchSimulation {
  let changed = 0;
  let aligned = 0;
  let counterexamples = 0;
  let reviewsTransitioned = 0;

  const affectedCaseIds: string[] = [];
  const counterexampleCases: EvaluationCase[] = [];

  for (const c of evaluationSet) {
    const proposed = matchesPatch(c, patch)
      ? patch.outcome
      : c.baselineDecision;

    if (proposed === c.baselineDecision) {
      continue;
    }

    changed += 1;
    affectedCaseIds.push(c.id);

    if (proposed === c.referenceDecision) {
      aligned += 1;
    } else {
      counterexamples += 1;

      if (counterexampleCases.length < 5) {
        counterexampleCases.push(c);
      }
    }

    if (
      c.baselineDecision === "HUMAN_REVIEW" &&
      proposed !== "HUMAN_REVIEW"
    ) {
      reviewsTransitioned += 1;
    }
  }

  return {
    patchId: patch.id,
    total: evaluationSet.length,
    changed,
    aligned,
    counterexamples,
    reviewsTransitioned,
    affectedCaseIds,
    counterexampleCases
  };
}
