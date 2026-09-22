import crypto from "node:crypto";

const AAD = Buffer.from("SYNTHESIS:MFA:TOTP:v1");

function key(material = process.env.MFA_ENCRYPTION_KEY ?? "") {
  const value = Buffer.from(material, "base64");
  if (value.length !== 32) throw new Error("INVALID_MFA_ENCRYPTION_KEY");
  return value;
}

export function encryptSecret(value: string, material?: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(material), iv);
  cipher.setAAD(AAD);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"),
    encrypted.toString("base64url")].join(".");
}

export function decryptSecret(value: string, material?: string) {
  const [v, iv, tag, data] = value.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("INVALID_ENCRYPTED_SECRET");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(material), Buffer.from(iv, "base64url"));
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final()
  ]).toString("utf8");
}
