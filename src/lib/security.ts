import crypto from "node:crypto";

/**
 * Validates and sanitizes a redirect URL path to prevent Open Redirect vulnerabilities.
 * Prevents protocol-relative URLs (//evil.com), backslash tricks (/\\evil.com),
 * javascript: schemes, and CRLF injection.
 */
export function sanitizeRedirectPath(path: string | null | undefined, fallback = "/events"): string {
  if (!path || typeof path !== "string") return fallback;
  const trimmed = path.trim();

  // Must begin with a single forward slash
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }

  // Must not contain backslashes (prevents /\evil.com bypass)
  if (trimmed.includes("\\")) {
    return fallback;
  }

  // Must not contain CRLF characters (prevents HTTP header injection)
  if (/[\r\n\t\0]/.test(trimmed)) {
    return fallback;
  }

  // Must not contain scheme colon (prevents /javascript:... or /https:... quirks)
  if (trimmed.startsWith("/javascript:") || trimmed.startsWith("/data:")) {
    return fallback;
  }

  return trimmed;
}

/**
 * Constant-time string comparison to prevent timing attacks on secrets and tokens.
 */
export function timingSafeCompare(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Checks if a push service endpoint is safe to contact (SSRF protection).
 * Web Push standard RFC 8291 requires HTTPS endpoints.
 * Explicitly rejects loopback, RFC 1918 private IPs, link-local / cloud metadata (169.254.x.x),
 * and non-standard ports.
 */
export function isValidPushEndpoint(endpoint: string): boolean {
  if (!endpoint || typeof endpoint !== "string" || endpoint.length > 1024) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return false;
  }

  // 1. Must be HTTPS
  if (parsed.protocol !== "https:") {
    return false;
  }

  // 2. Reject credentials in URL
  if (parsed.username || parsed.password) {
    return false;
  }

  // 3. Reject non-standard ports (Web push is on 443)
  if (parsed.port && parsed.port !== "443") {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();

  // 4. Reject localhost, raw IP addresses, and private hostnames
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return false;
  }

  // 5. Reject loopback and private IPv4 ranges:
  // - 127.0.0.0/8 (Loopback)
  // - 10.0.0.0/8 (Private)
  // - 172.16.0.0/12 (Private)
  // - 192.168.0.0/16 (Private)
  // - 169.254.0.0/16 (Link-local / Cloud metadata: AWS, GCP, Azure, DigitalOcean, etc.)
  // - 0.0.0.0/8
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ipMatch = hostname.match(ipv4Regex);
  if (ipMatch) {
    const [, a, b] = ipMatch.map(Number);
    if (a === 127 || a === 10 || a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
  }

  // 6. Reject IPv6 loopback / unique local / link local
  if (
    hostname === "[::1]" ||
    hostname === "::1" ||
    hostname.startsWith("fc00:") ||
    hostname.startsWith("fe80:")
  ) {
    return false;
  }

  return true;
}
