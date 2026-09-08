import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { McqTable } from "@/components/mcqs/mcq-table";

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push, refresh }),
}));

const rows = [
	{
		id: "mcq-1",
		name: "Addition facts",
		question: "What is 2 + 2?",
		createdBy: "user-ada",
		createdAt: "2026-09-08T00:00:00.000Z",
		updatedAt: "2026-09-08T00:00:00.000Z",
	},
	{
		id: "mcq-2",
		name: "Subtraction facts",
		question: "What is 5 - 1?",
		createdBy: "user-ada",
		createdAt: "2026-09-08T00:00:01.000Z",
		updatedAt: "2026-09-08T00:00:01.000Z",
	},
];

async function openActions(user: ReturnType<typeof userEvent.setup>, name: string) {
	await user.click(screen.getByRole("button", { name: `Actions for ${name}` }));
	await screen.findByRole("menuitem", { name: /^edit$/i });
}

describe("McqTable", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	it("renders a row for each question name and question text", () => {
		render(<McqTable mcqs={rows} />);

		expect(screen.getByText("Addition facts")).toBeTruthy();
		expect(screen.getByText("What is 2 + 2?")).toBeTruthy();
		expect(screen.getByText("Subtraction facts")).toBeTruthy();
		expect(screen.getByText("What is 5 - 1?")).toBeTruthy();
	});

	it("actions menu contains Edit, Preview, and Delete", async () => {
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		render(<McqTable mcqs={rows} />);

		await openActions(user, "Addition facts");

		expect(screen.getByRole("menuitem", { name: /^edit$/i })).toBeTruthy();
		expect(screen.getByRole("menuitem", { name: /^preview$/i })).toBeTruthy();
		expect(screen.getByRole("menuitem", { name: /^delete$/i })).toBeTruthy();
	});

	it("Edit navigates to /mcqs/{id}/edit", async () => {
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		render(<McqTable mcqs={rows} />);

		await openActions(user, "Addition facts");
		await user.click(screen.getByRole("menuitem", { name: /^edit$/i }));

		expect(push).toHaveBeenCalledWith("/mcqs/mcq-1/edit");
	});

	it("Preview navigates to /mcqs/{id}/preview", async () => {
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		render(<McqTable mcqs={rows} />);

		await openActions(user, "Addition facts");
		await user.click(screen.getByRole("menuitem", { name: /^preview$/i }));

		expect(push).toHaveBeenCalledWith("/mcqs/mcq-1/preview");
	});

	it("Delete opens a confirm dialog and DELETEs /api/mcqs/{id} on confirm", async () => {
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
		render(<McqTable mcqs={rows} />);

		await openActions(user, "Addition facts");
		await user.click(screen.getByRole("menuitem", { name: /^delete$/i }));

		const dialog = screen.getByRole("dialog");
		expect(within(dialog).getByRole("heading", { name: /delete question\?/i })).toBeTruthy();

		await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));

		expect(fetch).toHaveBeenCalledWith("/api/mcqs/mcq-1", expect.objectContaining({ method: "DELETE" }));
		expect(refresh).toHaveBeenCalled();
	});
});
