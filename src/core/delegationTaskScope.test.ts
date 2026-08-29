import {
  describe,
  expect,
  it
} from "vitest";

import {
  getCurrentRevision
} from "./delegationEngine";

import {
  scopeDelegationTaskAsHuman
} from "./delegationHuman";

import {
  createInteractiveDelegationWorkspace
} from "../domains/interactive-delegation-workspace";

import {
  createDelegationBoundaryToolActions
} from "../webmcp/delegationActions";

import type {
  DelegationWorkspace
} from "./types";

function createHarness() {
  let workspace =
    createInteractiveDelegationWorkspace();

  const actions =
    createDelegationBoundaryToolActions(
      () => workspace,

      (next) => {
        workspace = next;
      },

      () =>
        "2026-08-29T20:00:00.000Z"
    );

  return {
    actions,

    get workspace() {
      return workspace;
    },

    set workspace(
      next:
        DelegationWorkspace
    ) {
      workspace = next;
    }
  };
}

describe(
  "human-owned task scope",
  () => {
    it(
      "starts without inventing a task for the user",
      () => {
        const workspace =
          createInteractiveDelegationWorkspace();

        expect(
          workspace.task.title
        ).toBe("");

        expect(
          getCurrentRevision(
            workspace
          ).knownDecisions
        ).toHaveLength(0);

        expect(
          getCurrentRevision(
            workspace
          ).challenges
        ).toHaveLength(0);
      }
    );

    it(
      "lets only the pristine workspace be scoped by the human",
      () => {
        let workspace =
          createInteractiveDelegationWorkspace();

        workspace =
          scopeDelegationTaskAsHuman(
            workspace,
            "Customer refund decisions",
            "Decide when an AI agent may complete a refund without human review.",
            "2026-08-29T20:01:00.000Z"
          );

        expect(
          workspace.task.title
        ).toBe(
          "Customer refund decisions"
        );

        expect(
          workspace.task.description
        ).toContain(
          "without human review"
        );

        expect(
          workspace.revisions
        ).toHaveLength(1);

        const current =
          getCurrentRevision(
            workspace
          );

        expect(
          current.createdBy
        ).toBe(
          "HUMAN"
        );

        expect(
          current.changeSummary
        ).toContain(
          "Customer refund decisions"
        );
      }
    );

    it(
      "does not allow the task to be silently replaced after scope",
      () => {
        let workspace =
          createInteractiveDelegationWorkspace();

        workspace =
          scopeDelegationTaskAsHuman(
            workspace,
            "Customer refund decisions",
            ""
          );

        expect(
          () =>
            scopeDelegationTaskAsHuman(
              workspace,
              "Vendor onboarding",
              ""
            )
        ).toThrow(
          "already fixed"
        );
      }
    );

    it(
      "reports the human task requirement through inspect",
      () => {
        const harness =
          createHarness();

        const before =
          harness.actions
            .inspectWorkspace() as
              Record<
                string,
                unknown
              >;

        expect(
          before.workspace_ready
        ).toBe(false);

        expect(
          before.required_human_action
        ).toBeTruthy();

        harness.workspace =
          scopeDelegationTaskAsHuman(
            harness.workspace,
            "Customer refund decisions",
            ""
          );

        const after =
          harness.actions
            .inspectWorkspace() as
              Record<
                string,
                unknown
              >;

        expect(
          after.workspace_ready
        ).toBe(true);

        expect(
          after.required_human_action
        ).toBeNull();
      }
    );

    it(
      "blocks Agent authority changes and review before a human scopes the work",
      () => {
        const harness =
          createHarness();

        const propose =
          harness.actions
            .proposeBoundaryRevision({
              operation:
                "UPSERT",

              changeSummary:
                "Agent proposal",

              ruleId:
                "rule-agent-standard"
            }) as
              Record<
                string,
                unknown
              >;

        expect(
          propose.status
        ).toBe(
          "blocked"
        );

        expect(
          propose.code
        ).toBe(
          "TASK_SCOPE_REQUIRED"
        );

        const review =
          harness.actions
            .reviewCurrentRevision() as
              Record<
                string,
                unknown
              >;

        expect(
          review.status
        ).toBe(
          "blocked"
        );

        expect(
          harness.workspace
            .revisions
        ).toHaveLength(1);
      }
    );

    it(
      "unlocks Agent boundary work only after human task scope",
      () => {
        const harness =
          createHarness();

        harness.workspace =
          scopeDelegationTaskAsHuman(
            harness.workspace,
            "Customer refund decisions",
            ""
          );

        const result =
          harness.actions
            .proposeBoundaryRevision({
              operation:
                "UPSERT",

              changeSummary:
                "Agent proposes the first boundary revision",

              ruleId:
                "rule-agent-standard"
            }) as
              Record<
                string,
                unknown
              >;

        expect(
          result.status
        ).toBe(
          "success"
        );

        expect(
          harness.workspace
            .revisions
        ).toHaveLength(2);

        const current =
          getCurrentRevision(
            harness.workspace
          );

        expect(
          current.status
        ).toBe(
          "DRAFT"
        );

        expect(
          current.challenges
        ).toHaveLength(0);

        expect(
          harness.workspace
            .approval
        ).toBeUndefined();
      }
    );
  }
);
