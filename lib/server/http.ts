/**
 * Plain Web-standard request and response helpers.
 *
 * The endpoints are written against `Request` and `Response` rather than
 * Next's wrappers, which keeps `app/api/**` down to two-line adapters and lets
 * the whole HTTP layer — cookies, status codes, parsing — be tested by calling
 * a function, with no server and no test-runner dependency.
 */

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function jsonError(message: string, status: number, extraHeaders?: HeadersInit): Response {
  const response = json({ error: message }, status);
  if (extraHeaders) {
    for (const [key, value] of new Headers(extraHeaders).entries()) response.headers.set(key, value);
  }
  return response;
}

export function setCookie(response: Response, name: string, value: string, maxAge = COOKIE_MAX_AGE): Response {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  response.headers.append("set-cookie", parts.join("; "));
  return response;
}

export function clearCookie(response: Response, name: string): Response {
  return setCookie(response, name, "", 0);
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Best-effort client identity for rate limiting. Behind Vercel the left-most
 * x-forwarded-for entry is the real client; locally there is nothing, so all
 * unknown callers share one bucket, which is the safe direction to be wrong in.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
