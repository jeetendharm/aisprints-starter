import { beforeEach, describe, expect, it, vi } from "vitest";
import { UniqueConstraintError, userService } from "@/lib/services/users";
import { hashPassword } from "@/lib/password";
import { createSessionCookie } from "@/lib/session";
import { POST } from "./handler";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/services/users", () => {
	class UniqueConstraintError extends Error {
		constructor(message = "An account with that username or email already exists.") {
			super(message);
			this.name = "UniqueConstraintError";
		}
	}

	return {
		UniqueConstraintError,
		userService: {
			create: vi.fn(),
			getByUsername: vi.fn(),
		},
	};
});

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

const ada = {
	firstName: "Ada",
	lastName: "Lovelace",
	username: "alovelace",
	email: "ada@school.edu",
	password: "correct-horse-battery",
};

const publicAda = {
	id: "user-ada",
	firstName: "Ada",
	lastName: "Lovelace",
	username: "alovelace",
	email: "ada@school.edu",
};

function registerRequest(body: unknown) {
	return new Request("http://localhost/api/auth/register", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
}

describe("POST /api/auth/register", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(hashPassword).mockResolvedValue("hashed-secret");
		vi.mocked(userService.create).mockResolvedValue(publicAda);
		vi.mocked(createSessionCookie).mockReturnValue(
			"qm_session=signed-user-ada; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800",
		);
	});

	it("POST register with valid body returns 201, public user, and redirectTo /mcqs", async () => {
		const response = await POST(registerRequest(ada));
		const json = (await response.json()) as AuthJson;

		expect(response.status).toBe(201);
		expect(json).toEqual({
			user: publicAda,
			redirectTo: "/mcqs",
		});
	});

	it("POST register hashes the password before create and never echoes password or password_hash", async () => {
		const response = await POST(registerRequest(ada));
		const json = (await response.json()) as AuthJson;

		expect(hashPassword).toHaveBeenCalledWith("correct-horse-battery");
		expect(userService.create).toHaveBeenCalledWith({
			firstName: "Ada",
			lastName: "Lovelace",
			username: "alovelace",
			email: "ada@school.edu",
			passwordHash: "hashed-secret",
		});
		expect(vi.mocked(userService.create).mock.calls[0]?.[0]).not.toHaveProperty("password");
		expect(json.user).not.toHaveProperty("password");
		expect(json.user).not.toHaveProperty("passwordHash");
		expect(json.user).not.toHaveProperty("password_hash");
		expect(JSON.stringify(json)).not.toContain("correct-horse-battery");
		expect(JSON.stringify(json)).not.toContain("hashed-secret");
	});

	it("POST register sets the session cookie", async () => {
		const response = await POST(registerRequest(ada));

		expect(createSessionCookie).toHaveBeenCalledWith("user-ada");
		expect(response.headers.get("Set-Cookie")).toContain("qm_session=signed-user-ada");
		expect(response.headers.get("Set-Cookie")?.toLowerCase()).toContain("httponly");
	});

	it("POST register with missing or invalid fields returns 400", async () => {
		const missing = await POST(registerRequest({ username: "alovelace" }));
		expect(missing.status).toBe(400);

		const shortPassword = await POST(registerRequest({ ...ada, password: "short" }));
		expect(shortPassword.status).toBe(400);

		const badEmail = await POST(registerRequest({ ...ada, email: "not-an-email" }));
		expect(badEmail.status).toBe(400);

		const shortUsername = await POST(registerRequest({ ...ada, username: "ab" }));
		expect(shortUsername.status).toBe(400);

		expect(userService.create).not.toHaveBeenCalled();
	});

	it("POST register when username or email is taken returns 409 with the generic message", async () => {
		vi.mocked(userService.create).mockRejectedValue(new UniqueConstraintError());

		const response = await POST(registerRequest(ada));
		const json = (await response.json()) as AuthJson;

		expect(response.status).toBe(409);
		expect(json.error).toBe("An account with that username or email already exists.");
	});
});
