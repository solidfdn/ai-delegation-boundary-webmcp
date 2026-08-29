import {
  delegationBoundaryDemoWorkspace
} from "./delegation-boundary-demo";

import type {
  DelegationWorkspace
} from "../core/types";

function clone<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value)
  ) as T;
}

export function
createInteractiveDelegationWorkspace():
  DelegationWorkspace {
  const workspace =
    clone(
      delegationBoundaryDemoWorkspace
    );

  const current =
    workspace.revisions.find(
      (revision) =>
        revision.id ===
        workspace.currentRevisionId
    );

  if (!current) {
    throw new Error(
      "Interactive workspace has no current revision."
    );
  }

  /*
   * The public Challenge product begins with the user's
   * own work, not with a fictional business case.
   *
   * Only a human can scope the task.
   */
  workspace.task = {
    title: "",
    description: undefined
  };

  /*
   * No prior human judgment is invented.
   * Known Decisions are earned only through real
   * human resolutions in this workspace.
   */
  current.knownDecisions = [];

  /*
   * Challenges are generated live against the exact
   * current boundary.
   */
  current.challenges = [];

  current.review = undefined;
  current.status = "DRAFT";

  current.createdBy =
    "SYSTEM";

  current.changeSummary =
    "Awaiting human task scope";

  return workspace;
}
