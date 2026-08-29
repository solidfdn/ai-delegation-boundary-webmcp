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
   * P1 contains fixed challenges for deterministic tests.
   * The interactive Challenge product starts without them
   * so the real agent can challenge a live proposed change.
   */
  current.challenges = [];
  current.review = undefined;
  current.status = "DRAFT";

  return workspace;
}
