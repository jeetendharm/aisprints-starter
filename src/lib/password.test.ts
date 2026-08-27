import { describe, expect, it, vi } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

vi.mock("server-only", () => ({}));

describe("password hashing", () => {
	it("hashPassword returns a string that is not the plaintext password", async () => {
		const password = "correct-horse-battery";
		const hash = await hashPassword(password);

		expect(hash).not.toBe(password);
		expect(typeof hash).toBe("string");
		expect(hash.length).toBeGreaterThan(password.length);
	});

	it("hashPassword produces a different hash for the same password (unique salt)", async () => {
		const password = "correct-horse-battery";
		const first = await hashPassword(password);
		const second = await hashPassword(password);

		expect(first).not.toBe(second);
	});

	it("verifyPassword accepts the original password", async () => {
		const password = "correct-horse-battery";
		const hash = await hashPassword(password);

		await expect(verifyPassword(password, hash)).resolves.toBe(true);
	});

	it("verifyPassword rejects a wrong password", async () => {
		const hash = await hashPassword("correct-horse-battery");

		await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
	});

	it("verifyPassword rejects a malformed stored hash", async () => {
		await expect(verifyPassword("correct-horse-battery", "not-a-hash")).resolves.toBe(false);
		await expect(verifyPassword("correct-horse-battery", "pbkdf2$not-valid")).resolves.toBe(false);
		await expect(verifyPassword("correct-horse-battery", "")).resolves.toBe(false);
	});
});
