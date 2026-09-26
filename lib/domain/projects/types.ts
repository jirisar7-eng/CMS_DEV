export type ProjectStatus = "ACTIVE" | "DISABLED" | "ARCHIVED";

export interface ProjectResult {
  id: string;
  key: string;
  name: string;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProjectInput {
  name: string;
  key?: string;
}

export interface RenameProjectInput {
  name: string;
}

export interface ArchiveProjectInput {
  status: "ARCHIVED";
}

export type ValidatedPatchInput =
  | { type: "RENAME"; name: string }
  | { type: "ARCHIVE"; status: "ARCHIVED" };

export type ProjectErrorCode =
  | "INVALID_INPUT"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "PROJECT_NOT_FOUND"
  | "KEY_COLLISION"
  | "INVALID_LIFECYCLE_STATE"
  | "INTERNAL_ERROR";

export class ProjectDomainError extends Error {
  constructor(
    public readonly code: ProjectErrorCode,
    message: string,
    public readonly status: number = 400
  ) {
    super(message);
    this.name = "ProjectDomainError";
  }
}
