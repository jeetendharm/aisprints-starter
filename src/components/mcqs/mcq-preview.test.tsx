import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { McqPreview } from "@/components/mcqs/mcq-preview";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push }),
}));

const mcq = {
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

describe("McqPreview", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	it("renders the question and choices without exposing which is correct", () => {
		render(<McqPreview mcq={mcq} />);

		expect(screen.getByRole("heading", { name: "Addition facts" })).toBeTruthy();
		expect(screen.getByText("What is 2 + 2?")).toBeTruthy();
		expect(screen.getByRole("radio", { name: "3" })).toBeTruthy();
		expect(screen.getByRole("radio", { name: "4" })).toBeTruthy();
		expect(screen.queryByText(/^correct$/i)).toBeNull();
		expect(screen.queryByText(/^incorrect$/i)).toBeNull();
		expect(screen.getByRole("radio", { name: "3" }).getAttribute("aria-checked")).toBe("false");
		expect(screen.getByRole("radio", { name: "4" }).getAttribute("aria-checked")).toBe("false");
	});

	it("Submit POSTs /api/mcqs/{id}/attempts with the selected choiceId", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ attempt: { isCorrect: false } }), {
				status: 201,
				headers: { "Content-Type": "application/json" },
			}),
		);
		render(<McqPreview mcq={mcq} />);

		await user.click(screen.getByRole("radio", { name: "3" }));
		await user.click(screen.getByRole("button", { name: /submit answer/i }));

		expect(fetch).toHaveBeenCalledTimes(1);
		const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
		expect(url).toBe("/api/mcqs/mcq-1/attempts");
		expect(init?.method).toBe("POST");
		expect(JSON.parse(String(init?.body))).toEqual({ choiceId: "choice-1" });
	});

	it("shows Correct or Incorrect from the API response", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ attempt: { isCorrect: true } }), {
				status: 201,
				headers: { "Content-Type": "application/json" },
			}),
		);
		render(<McqPreview mcq={mcq} />);

		await user.click(screen.getByRole("radio", { name: "4" }));
		await user.click(screen.getByRole("button", { name: /submit answer/i }));

		expect(screen.getByText(/^correct$/i)).toBeTruthy();
	});

	it("does not submit when no choice is selected", async () => {
		const user = userEvent.setup();
		render(<McqPreview mcq={mcq} />);

		await user.click(screen.getByRole("button", { name: /submit answer/i }));

		expect(fetch).not.toHaveBeenCalled();
	});
});
