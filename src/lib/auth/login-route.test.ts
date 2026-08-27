import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/auth/login/handler";
import { userService } from "@/lib/services/users";
import { verifyPassword } from "@/lib/password";
import { createSessionCookie } from "@/lib/session";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/services/users", () => ({
	UniqueConstraintError: class UniqueConstraintError extends Error {},
	userService: {
		create: vi.fn(),
		getByUsername: vi.fn(),
	},
}));

vi.mock("@/lib/password", () => ({
	hashPassword: vi.fn(),
	verifyPassword: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
	createSessionCookie: vi.fn(),
	clearSessionCookie: vi.fn(),
}));

type AuthJson = {
	user?: Record<string, unknown>;
	error?: string;
	redirectTo?: string;
};

const publicAda = {
	id: "user-ada",
	firstName: "Ada",
	lastName: "Lovelace",
	username: "alovelace",
	email: "ada@school.edu",
};

function loginRequest(body: unknown) {
	return new Request("http://localhost/api/auth/login", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
}

describe("POST /api/auth/login", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(userService.getByUsername).mockResolvedValue({
			...publicAda,
			passwordHash: "stored-hash",
		});
		vi.mocked(verifyPassword).mockResolvedValue(true);
		vi.mocked(createSessionCookie).mockReturnValue(
			"qm_session=signed-user-ada; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800",
		);
	});

	it("POST login with valid username and password returns 200, public user, and redirectTo /mcqs", async () => {
		const response = await POST(
			loginRequest({ username: "alovelace", password: "correct-horse-battery" }),
		);
		const json = (await response.json()) as AuthJson;

		expect(response.status).toBe(200);
		expect(json).toEqual({
			user: publicAda,
			redirectTo: "/mcqs",
		});
	});

	it("POST login sets the session cookie", async () => {
		const response = await POST(
			loginRequest({ username: "alovelace", password: "correct-horse-battery" }),
		);

		expect(createSessionCookie).toHaveBeenCalledWith("user-ada");
		expect(response.headers.get("Set-Cookie")).toContain("qm_session=signed-user-ada");
	});

	it("POST login with unknown username returns 401 Invalid username or password", async () => {
		vi.mocked(userService.getByUsername).mockResolvedValue(null);

		const response = await POST(loginRequest({ username: "missing", password: "correct-horse-battery" }));
		const json = (await response.json()) as AuthJson;

		expect(response.status).toBe(401);
		expect(json.error).toBe("Invalid username or password.");
		expect(verifyPassword).not.toHaveBeenCalled();
		expect(createSessionCookie).not.toHaveBeenCalled();
	});

	it("POST login with wrong password returns 401 with the same message", async () => {
		vi.mocked(verifyPassword).mockResolvedValue(false);

		const response = await POST(
			loginRequest({ username: "alovelace", password: "wrong-password" }),
		);
		const json = (await response.json()) as AuthJson;

		expect(response.status).toBe(401);
		expect(json.error).toBe("Invalid username or password.");
		expect(createSessionCookie).not.toHaveBeenCalled();
	});

	it("POST login response never includes password or password_hash", async () => {
		const response = await POST(
			loginRequest({ username: "alovelace", password: "correct-horse-battery" }),
		);
		const json = (await response.json()) as AuthJson;

		expect(json.user).not.toHaveProperty("password");
		expect(json.user).not.toHaveProperty("passwordHash");
		expect(json.user).not.toHaveProperty("password_hash");
		expect(JSON.stringify(json)).not.toContain("correct-horse-battery");
		expect(JSON.stringify(json)).not.toContain("stored-hash");
	});

	it("POST login with invalid body returns 400", async () => {
		const missingPassword = await POST(loginRequest({ username: "alovelace" }));
		expect(missingPassword.status).toBe(400);

		const empty = await POST(loginRequest({}));
		expect(empty.status).toBe(400);

		expect(userService.getByUsername).not.toHaveBeenCalled();
	});
});
