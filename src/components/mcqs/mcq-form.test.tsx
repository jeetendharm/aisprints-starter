import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { McqForm } from "@/components/mcqs/mcq-form";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push }),
}));

const existing = {
	id: "mcq-1",
	name: "Addition facts",
	question: "What is 2 + 2?",
	createdBy: "user-ada",
	createdAt: "2026-09-08T00:00:00.000Z",
	updatedAt: "2026-09-08T00:00:00.000Z",
	choices: [
		{ id: "choice-1", body: "3", isCorrect: false, position: 0 },
		{ id: "choice-2", body: "4", isCorrect: true, position: 1 },
	],
};

async function fillCreateForm(user: ReturnType<typeof userEvent.setup>) {
	await user.type(screen.getByLabelText(/^name$/i), "Addition facts");
	await user.type(screen.getByLabelText(/^question$/i), "What is 2 + 2?");
	await user.type(screen.getByLabelText(/^choice 1$/i), "3");
	await user.type(screen.getByLabelText(/^choice 2$/i), "4");
	await user.click(screen.getByRole("radio", { name: /choice 2 is correct/i }));
}

describe("McqForm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	it("renders name, question, two choice fields, Save, and Cancel on create", () => {
		render(<McqForm />);

		expect(screen.getByLabelText(/^name$/i)).toBeTruthy();
		expect(screen.getByLabelText(/^question$/i)).toBeTruthy();
		expect(screen.getByLabelText(/^choice 1$/i)).toBeTruthy();
		expect(screen.getByLabelText(/^choice 2$/i)).toBeTruthy();
		expect(screen.getByRole("button", { name: /^save$/i })).toBeTruthy();
		expect(screen.getByRole("button", { name: /^cancel$/i })).toBeTruthy();
	});

	it("Add choice adds a row and is disabled at 6 choices", async () => {
		const user = userEvent.setup();
		render(<McqForm />);

		const add = screen.getByRole("button", { name: /add choice/i });
		await user.click(add);
		await user.click(add);
		await user.click(add);
		await user.click(add);

		expect(screen.getByLabelText(/^choice 6$/i)).toBeTruthy();
		expect((screen.getByRole("button", { name: /add choice/i }) as HTMLButtonElement).disabled).toBe(true);
	});

	it("cannot remove below 2 choices", async () => {
		const user = userEvent.setup();
		render(<McqForm />);

		const removeButtons = screen.getAllByRole("button", { name: /remove choice/i }) as HTMLButtonElement[];
		expect(removeButtons).toHaveLength(2);
		expect(removeButtons[0]?.disabled).toBe(true);
		expect(removeButtons[1]?.disabled).toBe(true);

		await user.click(screen.getByRole("button", { name: /add choice/i }));
		const afterAdd = screen.getAllByRole("button", { name: /remove choice/i }) as HTMLButtonElement[];
		expect(afterAdd).toHaveLength(3);
		expect(afterAdd[0]?.disabled).toBe(false);

		await user.click(afterAdd[2]!);
		const afterRemove = screen.getAllByRole("button", { name: /remove choice/i }) as HTMLButtonElement[];
		expect(afterRemove).toHaveLength(2);
		expect(afterRemove[0]?.disabled).toBe(true);
	});

	it("Save on create POSTs /api/mcqs and navigates to /mcqs", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ mcq: { id: "mcq-1" } }), {
				status: 201,
				headers: { "Content-Type": "application/json" },
			}),
		);
		render(<McqForm />);

		await fillCreateForm(user);
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		expect(fetch).toHaveBeenCalledTimes(1);
		const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
		expect(url).toBe("/api/mcqs");
		expect(init?.method).toBe("POST");
		expect(JSON.parse(String(init?.body))).toEqual({
			name: "Addition facts",
			question: "What is 2 + 2?",
			choices: [
				{ body: "3", isCorrect: false },
				{ body: "4", isCorrect: true },
			],
		});
		expect(JSON.parse(String(init?.body))).not.toHaveProperty("createdBy");
		expect(push).toHaveBeenCalledWith("/mcqs");
	});

	it("Save on edit PUTs /api/mcqs/{id} including existing choice ids", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ mcq: existing }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
		render(<McqForm mcq={existing} />);

		await user.click(screen.getByRole("button", { name: /^save$/i }));

		expect(fetch).toHaveBeenCalledTimes(1);
		const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
		expect(url).toBe("/api/mcqs/mcq-1");
		expect(init?.method).toBe("PUT");
		expect(JSON.parse(String(init?.body))).toEqual({
			name: "Addition facts",
			question: "What is 2 + 2?",
			choices: [
				{ id: "choice-1", body: "3", isCorrect: false },
				{ id: "choice-2", body: "4", isCorrect: true },
			],
		});
		expect(push).toHaveBeenCalledWith("/mcqs");
	});

	it("Cancel navigates to /mcqs without fetching", async () => {
		const user = userEvent.setup();
		render(<McqForm />);

		await user.click(screen.getByRole("button", { name: /^cancel$/i }));

		expect(fetch).not.toHaveBeenCalled();
		expect(push).toHaveBeenCalledWith("/mcqs");
	});

	it("shows the server error message when save fails", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ error: "Validation failed." }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			}),
		);
		render(<McqForm />);

		await fillCreateForm(user);
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		expect(push).not.toHaveBeenCalled();
		expect(screen.getByRole("alert").textContent).toBe("Validation failed.");
	});
});
