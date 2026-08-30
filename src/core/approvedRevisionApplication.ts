import {
  applyApprovedRevision
} from "./delegationEngine";

import type {
  DelegationWorkspace
} from "./types";

export type ApprovedRevisionApplyErrorCode =
  | "APPLICATION_IN_PROGRESS"
  | "WORKSPACE_CHANGED_DURING_APPLICATION";

export class ApprovedRevisionApplyError
  extends Error {
  readonly code:
    ApprovedRevisionApplyErrorCode;

  constructor(
    code:
      ApprovedRevisionApplyErrorCode,
    message: string
  ) {
    super(message);
    this.name =
      "ApprovedRevisionApplyError";
    this.code = code;
  }
}

export type ApprovedRevisionTransition = (
  workspace: DelegationWorkspace,
  appliedAt: string
) => Promise<DelegationWorkspace>;

export interface ApprovedRevisionApplyCoordinator {
  apply: () =>
    Promise<DelegationWorkspace>;
}

interface CoordinatorOptions {
  getWorkspace:
    () => DelegationWorkspace;

  commitWorkspace: (
    expected: DelegationWorkspace,
    next: DelegationWorkspace
  ) => boolean;

  now?: () => string;

  transition?:
    ApprovedRevisionTransition;
}

export function
createApprovedRevisionApplyCoordinator(
  options: CoordinatorOptions
): ApprovedRevisionApplyCoordinator {
  let applicationInFlight =
    false;

  const now =
    options.now ??
    (() =>
      new Date().toISOString());

  const transition =
    options.transition ??
    applyApprovedRevision;

  return {
    apply: async () => {
      if (applicationInFlight) {
        throw new ApprovedRevisionApplyError(
          "APPLICATION_IN_PROGRESS",
          "The approved revision is already being applied. Wait for the current application to finish."
        );
      }

      applicationInFlight = true;

      try {
        const source =
          options.getWorkspace();

        const next =
          await transition(
            source,
            now()
          );

        if (
          !options.commitWorkspace(
            source,
            next
          )
        ) {
          throw new ApprovedRevisionApplyError(
            "WORKSPACE_CHANGED_DURING_APPLICATION",
            "The workspace changed while the approved revision was being verified. Review the current state before applying again."
          );
        }

        return next;
      } finally {
        applicationInFlight =
          false;
      }
    }
  };
}
