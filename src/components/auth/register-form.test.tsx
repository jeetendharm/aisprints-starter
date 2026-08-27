import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RegisterForm } from "@/components/auth/register-form";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push }),
}));

const ada = {
	firstName: "Ada",
	lastName: "Lovelace",
	username: "alovelace",
	email: "ada@school.edu",
	password: "correct-horse-battery",
};

async function fillRegisterForm(user: ReturnType<typeof userEvent.setup>, confirmPassword = ada.password) {
	await user.type(screen.getByLabelText(/first name/i), ada.firstName);
	await user.type(screen.getByLabelText(/last name/i), ada.lastName);
	await user.type(screen.getByLabelText(/^username$/i), ada.username);
	await user.type(screen.getByLabelText(/^email$/i), ada.email);
	await user.type(screen.getByLabelText(/^password$/i), ada.password);
	await user.type(screen.getByLabelText(/confirm password/i), confirmPassword);
}

describe("RegisterForm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	it("renders first name, last name, username, email, password, and confirm password fields", () => {
		render(<RegisterForm />);

		expect(screen.getByLabelText(/first name/i)).toBeTruthy();
		expect(screen.getByLabelText(/last name/i)).toBeTruthy();
		expect(screen.getByLabelText(/^username$/i)).toBeTruthy();
		expect(screen.getByLabelText(/^email$/i)).toBeTruthy();
		expect(screen.getByLabelText(/^password$/i)).toBeTruthy();
		expect(screen.getByLabelText(/confirm password/i)).toBeTruthy();
	});

	it("does not submit when confirm password does not match", async () => {
		const user = userEvent.setup();
		render(<RegisterForm />);

		await fillRegisterForm(user, "different-password");
		await user.click(screen.getByRole("button", { name: /create account/i }));

		expect(fetch).not.toHaveBeenCalled();
		expect(screen.getByRole("alert").textContent).toMatch(/passwords do not match/i);
	});

	it("POSTs /api/auth/register without confirmPassword and navigates to redirectTo on success", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ user: { id: "user-ada" }, redirectTo: "/mcqs" }), {
				status: 201,
				headers: { "Content-Type": "application/json" },
			}),
		);
		render(<RegisterForm />);

		await fillRegisterForm(user);
		await user.click(screen.getByRole("button", { name: /create account/i }));

		expect(fetch).toHaveBeenCalledTimes(1);
		const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
		expect(url).toBe("/api/auth/register");
		expect(init?.method).toBe("POST");
		expect(JSON.parse(String(init?.body))).toEqual({
			firstName: ada.firstName,
			lastName: ada.lastName,
			username: ada.username,
			email: ada.email,
			password: ada.password,
		});
		expect(JSON.parse(String(init?.body))).not.toHaveProperty("confirmPassword");
		expect(push).toHaveBeenCalledWith("/mcqs");
	});

	it("shows the server error message when register fails", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ error: "An account with that username or email already exists." }), {
				status: 409,
				headers: { "Content-Type": "application/json" },
			}),
		);
		render(<RegisterForm />);

		await fillRegisterForm(user);
		await user.click(screen.getByRole("button", { name: /create account/i }));

		expect(push).not.toHaveBeenCalled();
		expect(screen.getByRole("alert").textContent).toBe(
			"An account with that username or email already exists.",
		);
	});
});
