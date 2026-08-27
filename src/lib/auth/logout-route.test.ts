import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/auth/logout/handler";
import { clearSessionCookie } from "@/lib/session";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/session", () => ({
	createSessionCookie: vi.fn(),
	clearSessionCookie: vi.fn(),
}));

describe("POST /api/auth/logout", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(clearSessionCookie).mockReturnValue(
			"qm_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
		);
	});

	it("POST logout returns 200 and redirectTo /login", async () => {
		const response = await POST(
			new Request("http://localhost/api/auth/logout", { method: "POST" }),
		);
		const json = (await response.json()) as { redirectTo?: string };

		expect(response.status).toBe(200);
		expect(json).toEqual({ redirectTo: "/login" });
	});

	it("POST logout clears the session cookie", async () => {
		const response = await POST(
			new Request("http://localhost/api/auth/logout", { method: "POST" }),
		);

		expect(clearSessionCookie).toHaveBeenCalled();
		expect(response.headers.get("Set-Cookie")?.toLowerCase()).toMatch(/max-age=0/);
		expect(response.headers.get("Set-Cookie")).toContain("qm_session=");
	});

	it("POST logout without a cookie still returns 200", async () => {
		const response = await POST(
			new Request("http://localhost/api/auth/logout", { method: "POST" }),
		);

		expect(response.status).toBe(200);
	});
});
