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
   * P1 keeps deterministic fixtures for automated tests.
   *
   * The public product must not pretend that the current user
   * already made judgments they never made.
   *
   * Known Decisions are earned only through real human
   * resolutions during this workspace.
   */
  current.knownDecisions = [];

  /*
   * Agent Challenges are also created live.
   * A challenge belongs to the exact boundary it tested.
   */
  current.challenges = [];

  current.review = undefined;
  current.status = "DRAFT";

  return workspace;
}
