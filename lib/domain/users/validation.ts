import { validatePassword } from "@/lib/auth/password";
import type { CreateUserInput, PatchUserInput, UserStatus } from "./types";

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  errors?: Record<string, string>;
}

export function validateEmail(email: unknown): { valid: boolean; normalized?: string; error?: string } {
  if (typeof email !== "string") {
    return { valid: false, error: "Email must be a string" };
  }

  const normalized = email.trim().toLowerCase();
  if (normalized.length === 0) {
    return { valid: false, error: "Email is required" };
  }

  if (normalized.length > 255) {
    return { valid: false, error: "Email exceeds maximum allowed length (255 characters)" };
  }

  if (!EMAIL_REGEX.test(normalized)) {
    return { valid: false, error: "Invalid email format" };
  }

  return { valid: true, normalized };
}

export function validateDisplayName(name: unknown): { valid: boolean; normalized?: string | null; error?: string } {
  if (name === null || name === undefined || name === "") {
    return { valid: true, normalized: null };
  }

  if (typeof name !== "string") {
    return { valid: false, error: "Display name must be a string" };
  }

  const normalized = name.normalize("NFC").trim();
  if (normalized.length === 0) {
    return { valid: true, normalized: null };
  }

  if (normalized.length > 100) {
    return { valid: false, error: "Display name exceeds maximum allowed length (100 characters)" };
  }

  return { valid: true, normalized };
}

export function validateUserStatus(status: unknown): { valid: boolean; status?: UserStatus; error?: string } {
  if (status !== "ACTIVE" && status !== "DISABLED") {
    return {
      valid: false,
      error: "Status must be either ACTIVE or DISABLED",
    };
  }
  return { valid: true, status: status as UserStatus };
}

const ALLOWED_CREATE_KEYS = new Set(["email", "password", "displayName"]);
const ALLOWED_PATCH_KEYS = new Set(["email", "displayName", "status"]);
const FORBIDDEN_PATCH_KEYS = new Set(["password", "roles", "permissions", "mfa", "sessions", "id", "createdAt", "updatedAt", "passwordHash"]);

export function validateCreateUserInput(input: unknown): ValidationResult<CreateUserInput> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, errors: { _root: "Request body must be a JSON object" } };
  }

  const obj = input as Record<string, unknown>;
  const errors: Record<string, string> = {};

  // Reject unexpected keys
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_CREATE_KEYS.has(key)) {
      errors[key] = `Unexpected property: ${key}`;
    }
  }

  // Validate Email
  const emailRes = validateEmail(obj.email);
  if (!emailRes.valid) {
    errors.email = emailRes.error || "Invalid email";
  }

  // Validate Password
  const passRes = validatePassword(obj.password);
  if (!passRes.valid) {
    errors.password = passRes.message || "Invalid password";
  }

  // Validate Display Name
  let displayName: string | null = null;
  if ("displayName" in obj && obj.displayName !== undefined) {
    const nameRes = validateDisplayName(obj.displayName);
    if (!nameRes.valid) {
      errors.displayName = nameRes.error || "Invalid display name";
    } else {
      displayName = nameRes.normalized ?? null;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      email: emailRes.normalized!,
      password: obj.password as string,
      displayName,
    },
  };
}

export function validatePatchUserInput(input: unknown): ValidationResult<PatchUserInput> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, errors: { _root: "Request body must be a JSON object" } };
  }

  const obj = input as Record<string, unknown>;
  const errors: Record<string, string> = {};

  // Check explicitly forbidden keys or unexpected keys
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_PATCH_KEYS.has(key)) {
      errors[key] = `Field cannot be modified via user update: ${key}`;
    } else if (!ALLOWED_PATCH_KEYS.has(key)) {
      errors[key] = `Unexpected property: ${key}`;
    }
  }

  const data: PatchUserInput = {};
  let hasValidField = false;

  if ("email" in obj && obj.email !== undefined) {
    const emailRes = validateEmail(obj.email);
    if (!emailRes.valid) {
      errors.email = emailRes.error || "Invalid email";
    } else {
      data.email = emailRes.normalized;
      hasValidField = true;
    }
  }

  if ("displayName" in obj && obj.displayName !== undefined) {
    const nameRes = validateDisplayName(obj.displayName);
    if (!nameRes.valid) {
      errors.displayName = nameRes.error || "Invalid display name";
    } else {
      data.displayName = nameRes.normalized ?? null;
      hasValidField = true;
    }
  }

  if ("status" in obj && obj.status !== undefined) {
    const statusRes = validateUserStatus(obj.status);
    if (!statusRes.valid) {
      errors.status = statusRes.error || "Invalid status";
    } else {
      data.status = statusRes.status;
      hasValidField = true;
    }
  }

  if (!hasValidField && Object.keys(errors).length === 0) {
    errors._root = "At least one valid field (email, displayName, status) must be provided";
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, data };
}
