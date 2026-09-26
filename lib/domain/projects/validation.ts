import { ProjectDomainError, ValidatedPatchInput } from "./types";

export function validateProjectName(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new ProjectDomainError("INVALID_INPUT", "Project name must be a string", 400);
  }
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > 100) {
    throw new ProjectDomainError("INVALID_INPUT", "Project name must be between 1 and 100 characters", 400);
  }
  if (/[\x00-\x1f\x7f]/.test(trimmed)) {
    throw new ProjectDomainError("INVALID_INPUT", "Project name contains invalid control characters", 400);
  }
  return trimmed;
}

export function slugifyProjectName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

export function validateProjectKey(raw: unknown, nameForFallback?: string): string {
  if (raw !== undefined && raw !== null && raw !== "") {
    if (typeof raw !== "string") {
      throw new ProjectDomainError("INVALID_INPUT", "Project key must be a string", 400);
    }
    const trimmed = raw.trim().toLowerCase();
    if (trimmed.length < 2 || trimmed.length > 64) {
      throw new ProjectDomainError("INVALID_INPUT", "Project key must be between 2 and 64 characters", 400);
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed)) {
      throw new ProjectDomainError(
        "INVALID_INPUT",
        "Project key must consist of lowercase alphanumeric characters separated by single hyphens",
        400
      );
    }
    return trimmed;
  }

  if (nameForFallback) {
    const derived = slugifyProjectName(nameForFallback);
    if (derived.length < 2 || derived.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(derived)) {
      throw new ProjectDomainError(
        "INVALID_INPUT",
        "Could not derive a valid slug key from the provided project name. Please provide an explicit key (2-64 lowercase alphanumeric chars and hyphens).",
        400
      );
    }
    return derived;
  }

  throw new ProjectDomainError("INVALID_INPUT", "Project key is required", 400);
}

export function validateCreateProjectInput(body: unknown): { name: string; key: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ProjectDomainError("INVALID_INPUT", "Request body must be a JSON object", 400);
  }

  const unknownKeys = Object.keys(body).filter((k) => k !== "name" && k !== "key");
  if (unknownKeys.length > 0) {
    throw new ProjectDomainError(
      "INVALID_INPUT",
      "Unknown properties in request body: " + unknownKeys.join(", "),
      400
    );
  }

  const name = validateProjectName((body as Record<string, unknown>).name);
  const key = validateProjectKey((body as Record<string, unknown>).key, name);

  return { name, key };
}

export function validatePatchProjectInput(body: unknown): ValidatedPatchInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ProjectDomainError("INVALID_INPUT", "Request body must be a JSON object", 400);
  }

  const rawObj = body as Record<string, unknown>;

  if ("key" in rawObj) {
    throw new ProjectDomainError("INVALID_INPUT", "Project key is immutable and cannot be modified", 400);
  }

  if ("id" in rawObj || "createdAt" in rawObj || "updatedAt" in rawObj) {
    throw new ProjectDomainError("INVALID_INPUT", "Immutable system fields cannot be modified", 400);
  }

  const unknownKeys = Object.keys(rawObj).filter((k) => k !== "name" && k !== "status");
  if (unknownKeys.length > 0) {
    throw new ProjectDomainError(
      "INVALID_INPUT",
      "Unknown properties in request body: " + unknownKeys.join(", "),
      400
    );
  }

  if ("name" in rawObj && "status" in rawObj) {
    throw new ProjectDomainError(
      "INVALID_INPUT",
      "Cannot combine rename and status change in a single operation",
      400
    );
  }

  if ("name" in rawObj) {
    const name = validateProjectName(rawObj.name);
    return { type: "RENAME", name };
  }

  if ("status" in rawObj) {
    const status = rawObj.status;
    if (status !== "ARCHIVED") {
      throw new ProjectDomainError(
        "INVALID_INPUT",
        "Invalid status transition. Only ARCHIVED is supported in V1.",
        400
      );
    }
    return { type: "ARCHIVE", status: "ARCHIVED" };
  }

  throw new ProjectDomainError(
    "INVALID_INPUT",
    "Either name (for rename) or status: \"ARCHIVED\" (for archive) must be provided",
    400
  );
}

export function validateProjectId(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new ProjectDomainError("INVALID_INPUT", "Invalid projectId", 400);
  }
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > 128 || /[\x00-\x1f\x7f<>]/.test(trimmed)) {
    throw new ProjectDomainError("INVALID_INPUT", "Invalid projectId", 400);
  }
  return trimmed;
}
