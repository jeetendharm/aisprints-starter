import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSessionCookie, createSessionCookie, readSessionUserId, SESSION_COOKIE_NAME } from "@/lib/session";

vi.mock("server-only", () => ({}));

const SECRET = "test-session-secret-at-least-32-chars";

function cookieHeaderFromSetCookie(setCookie: string): string {
	const [pair] = setCookie.split(";");
	return pair?.trim() ?? "";
}

describe("session cookies", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.SESSION_SECRET = SECRET;
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("createSessionCookie returns an httpOnly Set-Cookie for the signed user id", () => {
		const header = createSessionCookie("user-ada");
		const lower = header.toLowerCase();

		expect(header.startsWith(`${SESSION_COOKIE_NAME}=`)).toBe(true);
		expect(lower).toContain("httponly");
		expect(lower).toContain("path=/");
		expect(lower).toContain("samesite=lax");
		expect(lower).toMatch(/max-age=604800/);
		expect(cookieHeaderFromSetCookie(header).length).toBeGreaterThan(`${SESSION_COOKIE_NAME}=`.length);
	});

	it("readSessionUserId returns the user id for a valid cookie", () => {
		const setCookie = createSessionCookie("user-ada");
		const userId = readSessionUserId(cookieHeaderFromSetCookie(setCookie));

		expect(userId).toBe("user-ada");
	});

	it("readSessionUserId returns null for a missing, expired, or tampered cookie", () => {
		expect(readSessionUserId(null)).toBeNull();
		expect(readSessionUserId("")).toBeNull();
		expect(readSessionUserId("other=value")).toBeNull();

		const expired = createSessionCookie("user-ada", {
			nowMs: Date.now() - 8 * 24 * 60 * 60 * 1000,
		});
		expect(readSessionUserId(cookieHeaderFromSetCookie(expired))).toBeNull();

		const valid = createSessionCookie("user-ada");
		const [name, value] = cookieHeaderFromSetCookie(valid).split("=");
		const tampered = `${name}=${value.slice(0, -1)}x`;
		expect(readSessionUserId(tampered)).toBeNull();
	});

	it("clearSessionCookie expires the session cookie", () => {
		const header = clearSessionCookie();
		const lower = header.toLowerCase();

		expect(header.startsWith(`${SESSION_COOKIE_NAME}=`)).toBe(true);
		expect(lower).toContain("httponly");
		expect(lower).toMatch(/max-age=0/);
	});
});
