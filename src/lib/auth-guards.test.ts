import { describe, expect, it } from "vitest";
import { landingRedirect, redirectIfAuthenticated, requireSessionRedirect } from "@/lib/auth-guards";

describe("auth guards", () => {
	it("requireSessionRedirect returns /login when there is no user id", () => {
		expect(requireSessionRedirect(null)).toBe("/login");
		expect(requireSessionRedirect(undefined)).toBe("/login");
		expect(requireSessionRedirect("")).toBe("/login");
	});

	it("requireSessionRedirect returns null when there is a user id", () => {
		expect(requireSessionRedirect("user-ada")).toBeNull();
	});

	it("redirectIfAuthenticated returns /mcqs when there is a user id", () => {
		expect(redirectIfAuthenticated("user-ada")).toBe("/mcqs");
	});

	it("redirectIfAuthenticated returns null when there is no user id", () => {
		expect(redirectIfAuthenticated(null)).toBeNull();
		expect(redirectIfAuthenticated(undefined)).toBeNull();
		expect(redirectIfAuthenticated("")).toBeNull();
	});

	it("landingRedirect returns /login when there is no user id", () => {
		expect(landingRedirect(null)).toBe("/login");
		expect(landingRedirect(undefined)).toBe("/login");
		expect(landingRedirect("")).toBe("/login");
	});

	it("landingRedirect returns /mcqs when there is a user id", () => {
		expect(landingRedirect("user-ada")).toBe("/mcqs");
	});
});
