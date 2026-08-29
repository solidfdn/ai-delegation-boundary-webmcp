import type {
  DelegationRevision,
  DelegationWorkspace,
  FactorDefinition
} from "../core/types";

export const delegationDemoFactors:
  FactorDefinition[] = [
    {
      id: "evidence_quality",
      label: "Evidence quality",
      description:
        "How strong and complete the information supporting the decision is.",
      type: "ORDERED",
      orderedValues: [
        "LOW",
        "MEDIUM",
        "HIGH"
      ]
    },

    {
      id: "impact",
      label: "Impact if wrong",
      description:
        "How significant the consequence would be if the decision were wrong.",
      type: "ORDERED",
      orderedValues: [
        "LOW",
        "MEDIUM",
        "HIGH"
      ]
    },

    {
      id: "reversibility",
      label: "Reversibility",
      description:
        "Whether the action can be safely reversed after execution.",
      type: "CATEGORY",
      categories: [
        "REVERSIBLE",
        "PARTIAL",
        "IRREVERSIBLE"
      ]
    },

    {
      id: "policy_clarity",
      label: "Policy clarity",
      description:
        "How clearly an existing policy or rule covers the decision.",
      type: "CATEGORY",
      categories: [
        "CLEAR",
        "AMBIGUOUS",
        "UNKNOWN"
      ]
    },

    {
      id: "exceptionality",
      label: "Exceptionality",
      description:
        "Whether this is a standard, exceptional, or novel situation.",
      type: "CATEGORY",
      categories: [
        "STANDARD",
        "EXCEPTION",
        "NOVEL"
      ]
    }
  ];

const initialRevision:
  DelegationRevision = {
    id: "delegation-demo-r1",
    version: 1,
    parentRevisionId: null,

    createdBy: "SYSTEM",
    createdAt:
      "2026-08-29T00:00:00.000Z",

    changeSummary:
      "Initial delegation boundary",

    boundary: {
      id: "boundary-001",

      label:
        "AI may complete only low-impact, reversible, well-supported standard decisions.",

      rules: [
        {
          id: "rule-irreversible",
          label:
            "Never delegate irreversible execution",

          priority: 10,

          when: [
            {
              factorId:
                "reversibility",
              operator: "EQ",
              value: "IRREVERSIBLE"
            }
          ],

          outcome:
            "DO_NOT_DELEGATE",

          rationale:
            "Irreversible execution remains under human authority."
        },

        {
          id: "rule-unknown-policy",
          label:
            "Unknown policy requires human review",

          priority: 20,

          when: [
            {
              factorId:
                "policy_clarity",
              operator: "EQ",
              value: "UNKNOWN"
            }
          ],

          outcome:
            "HUMAN_REVIEW"
        },

        {
          id: "rule-agent-standard",
          label:
            "Delegate low-risk standard decisions",

          priority: 30,

          when: [
            {
              factorId:
                "evidence_quality",
              operator: "AT_LEAST",
              value: "HIGH"
            },
            {
              factorId:
                "impact",
              operator: "AT_MOST",
              value: "LOW"
            },
            {
              factorId:
                "reversibility",
              operator: "EQ",
              value: "REVERSIBLE"
            },
            {
              factorId:
                "policy_clarity",
              operator: "EQ",
              value: "CLEAR"
            },
            {
              factorId:
                "exceptionality",
              operator: "EQ",
              value: "STANDARD"
            }
          ],

          outcome:
            "AGENT_ONLY"
        }
      ],

      defaultOutcome:
        "HUMAN_REVIEW"
    },

    guardrails: [
      {
        id:
          "guardrail-irreversible",

        label:
          "Irreversible actions remain human-controlled",

        description:
          "The agent must never independently execute an irreversible decision.",

        when: [
          {
            factorId:
              "reversibility",
            operator: "EQ",
            value: "IRREVERSIBLE"
          }
        ],

        requiredOutcome:
          "DO_NOT_DELEGATE"
      },

      {
        id:
          "guardrail-unknown-policy",

        label:
          "Unknown policy requires human review",

        description:
          "A decision not covered by a known policy cannot be completed autonomously.",

        when: [
          {
            factorId:
              "policy_clarity",
            operator: "EQ",
            value: "UNKNOWN"
          }
        ],

        requiredOutcome:
          "HUMAN_REVIEW"
      }
    ],

    /*
     * These are not synthetic ground truth.
     * They represent judgments already confirmed by a human.
     * Future revisions must not silently change them.
     */
    knownDecisions: [
      {
        id: "known-001",

        label:
          "Clear low-impact standard decision",

        facts: {
          evidence_quality: "HIGH",
          impact: "LOW",
          reversibility:
            "REVERSIBLE",
          policy_clarity: "CLEAR",
          exceptionality:
            "STANDARD"
        },

        expectedOutcome:
          "AGENT_ONLY",

        rationale:
          "Human previously confirmed this combination may be completed by the agent.",

        createdInRevisionId:
          "delegation-demo-r1"
      },

      {
        id: "known-002",

        label:
          "Medium-impact decision remains reviewed",

        facts: {
          evidence_quality: "HIGH",
          impact: "MEDIUM",
          reversibility:
            "REVERSIBLE",
          policy_clarity: "CLEAR",
          exceptionality:
            "STANDARD"
        },

        expectedOutcome:
          "HUMAN_REVIEW",

        rationale:
          "Human previously kept medium-impact decisions under review.",

        createdInRevisionId:
          "delegation-demo-r1"
      },

      {
        id: "known-003",

        label:
          "Irreversible decision is not delegated",

        facts: {
          evidence_quality: "HIGH",
          impact: "LOW",
          reversibility:
            "IRREVERSIBLE",
          policy_clarity: "CLEAR",
          exceptionality:
            "STANDARD"
        },

        expectedOutcome:
          "DO_NOT_DELEGATE",

        rationale:
          "Human authority is retained for irreversible execution.",

        createdInRevisionId:
          "delegation-demo-r1"
      }
    ],

    /*
     * Challenges are questions, not ground truth.
     * The agent surfaces them so a human can decide.
     */
    challenges: [
      {
        id: "challenge-001",

        title:
          "Would medium impact still require review?",

        scenario: {
          evidence_quality: "HIGH",
          impact: "MEDIUM",
          reversibility:
            "REVERSIBLE",
          policy_clarity: "CLEAR",
          exceptionality:
            "STANDARD"
        },

        whyItMatters:
          "Expanding from low to medium impact would materially widen agent authority.",

        suggestedOutcome:
          "HUMAN_REVIEW",

        status:
          "OPEN"
      },

      {
        id: "challenge-002",

        title:
          "Should an exception ever complete autonomously?",

        scenario: {
          evidence_quality: "HIGH",
          impact: "LOW",
          reversibility:
            "REVERSIBLE",
          policy_clarity: "CLEAR",
          exceptionality:
            "EXCEPTION"
        },

        whyItMatters:
          "A technically low-risk case may still require human judgment when it is an exception.",

        suggestedOutcome:
          "HUMAN_REVIEW",

        status:
          "OPEN"
      },

      {
        id: "challenge-003",

        title:
          "What happens when policy coverage is unknown?",

        scenario: {
          evidence_quality: "HIGH",
          impact: "LOW",
          reversibility:
            "REVERSIBLE",
          policy_clarity:
            "UNKNOWN",
          exceptionality:
            "STANDARD"
        },

        whyItMatters:
          "Strong evidence cannot replace a missing policy boundary.",

        suggestedOutcome:
          "HUMAN_REVIEW",

        status:
          "OPEN"
      }
    ],

    status: "DRAFT"
  };

export const
delegationBoundaryDemoWorkspace:
  DelegationWorkspace = {
    id: "delegation-demo",

    task: {
      title:
        "Decide which operational decisions an AI agent may complete without human review.",

      description:
        "The workspace tests where agent autonomy should end and human authority should begin."
    },

    factors:
      delegationDemoFactors,

    revisions: [
      initialRevision
    ],

    currentRevisionId:
      initialRevision.id
  };
