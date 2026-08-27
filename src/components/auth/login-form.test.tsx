import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/components/auth/login-form";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push }),
}));

describe("LoginForm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	it("renders username and password fields", () => {
		render(<LoginForm />);

		expect(screen.getByLabelText(/^username$/i)).toBeTruthy();
		expect(screen.getByLabelText(/^password$/i)).toBeTruthy();
	});

	it("POSTs /api/auth/login and navigates to redirectTo on success", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ user: { id: "user-ada" }, redirectTo: "/mcqs" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
		render(<LoginForm />);

		await user.type(screen.getByLabelText(/^username$/i), "alovelace");
		await user.type(screen.getByLabelText(/^password$/i), "correct-horse-battery");
		await user.click(screen.getByRole("button", { name: /^login$/i }));

		expect(fetch).toHaveBeenCalledTimes(1);
		const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
		expect(url).toBe("/api/auth/login");
		expect(init?.method).toBe("POST");
		expect(JSON.parse(String(init?.body))).toEqual({
			username: "alovelace",
			password: "correct-horse-battery",
		});
		expect(push).toHaveBeenCalledWith("/mcqs");
	});

	it("shows Invalid username or password when the API returns 401", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ error: "Invalid username or password." }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			}),
		);
		render(<LoginForm />);

		await user.type(screen.getByLabelText(/^username$/i), "alovelace");
		await user.type(screen.getByLabelText(/^password$/i), "wrong-password");
		await user.click(screen.getByRole("button", { name: /^login$/i }));

		expect(push).not.toHaveBeenCalled();
		expect(screen.getByRole("alert").textContent).toBe("Invalid username or password.");
	});
});
