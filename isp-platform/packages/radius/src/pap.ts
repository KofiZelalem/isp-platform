import bcrypt from "bcryptjs";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

/** Rejects (rather than throws) when `hash` isn't a bcrypt hash, e.g. legacy seed placeholders. */
export async function verifyPapPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash.startsWith("$2")) return false;

  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}
