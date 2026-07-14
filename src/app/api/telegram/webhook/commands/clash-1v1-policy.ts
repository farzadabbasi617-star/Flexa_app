export function isSupportedClashInvite(value?: string | null) {
  const candidate = String(value || "").trim();
  if (!candidate) return false;
  if (/^(clashroyale|supercell|scid):\/\//i.test(candidate)) return true;
  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (
      host === "link.clashroyale.com" ||
      host.endsWith(".clashroyale.com") ||
      host === "link.supercell.com" ||
      host.endsWith(".supercell.com")
    );
  } catch {
    return false;
  }
}
