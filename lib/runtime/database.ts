export function isDatabaseConfigured(): boolean {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return false;
  return dbUrl.trim().length > 0;
}
