import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/mcqs/handler";
import { getSessionUserId } from "@/lib/current-session";
import { mcqService } from "@/lib/services/mcqs";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/current-session", () => ({
	getSessionUserId: vi.fn(),
}));

vi.mock("@/lib/services/mcqs", () => ({
	McqNotFoundError: class McqNotFoundError extends Error {
		constructor(message = "Question not found.") {
			super(message);
			this.name = "McqNotFoundError";
		}
	},
	InvalidMcqChoiceError: class InvalidMcqChoiceError extends Error {
		constructor(message = "Choice does not belong to this question.") {
			super(message);
			this.name = "InvalidMcqChoiceError";
		}
	},
	mcqService: {
		list: vi.fn(),
		getById: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
	},
}));

const createdMcq = {
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

const validBody = {
	name: "Addition facts",
	question: "What is 2 + 2?",
	choices: [
		{ body: "3", isCorrect: false },
		{ body: "4", isCorrect: true },
	],
};

function postRequest(body: unknown) {
	return new Request("http://localhost/api/mcqs", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
}

describe("POST /api/mcqs", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getSessionUserId).mockResolvedValue("user-ada");
		vi.mocked(mcqService.create).mockResolvedValue(createdMcq);
	});

	it("POST /api/mcqs with a valid body returns 201 and uses the session user as createdBy", async () => {
		const response = await POST(postRequest({ ...validBody, createdBy: "forged-user" }));
		const json = (await response.json()) as { mcq: unknown };

		expect(response.status).toBe(201);
		expect(json).toEqual({ mcq: createdMcq });
		expect(mcqService.create).toHaveBeenCalledWith({
			name: "Addition facts",
			question: "What is 2 + 2?",
			createdBy: "user-ada",
			choices: validBody.choices,
		});
	});

	it("POST /api/mcqs with a missing question returns 400", async () => {
		const { question: _question, ...withoutQuestion } = validBody;
		const response = await POST(postRequest(withoutQuestion));
		const json = (await response.json()) as { error: string };

		expect(response.status).toBe(400);
		expect(json.error).toBe("Validation failed.");
		expect(mcqService.create).not.toHaveBeenCalled();
	});

	it("POST /api/mcqs with 1 choice or two correct choices returns 400", async () => {
		const oneChoice = await POST(
			postRequest({
				...validBody,
				choices: [{ body: "4", isCorrect: true }],
			}),
		);
		const twoCorrect = await POST(
			postRequest({
				...validBody,
				choices: [
					{ body: "3", isCorrect: true },
					{ body: "4", isCorrect: true },
				],
			}),
		);

		expect(oneChoice.status).toBe(400);
		expect(twoCorrect.status).toBe(400);
		expect(mcqService.create).not.toHaveBeenCalled();
	});

	it("POST /api/mcqs returns 401 when there is no session", async () => {
		vi.mocked(getSessionUserId).mockResolvedValue(null);

		const response = await POST(postRequest(validBody));
		const json = (await response.json()) as { error: string };

		expect(response.status).toBe(401);
		expect(json.error).toBe("Authentication required.");
		expect(mcqService.create).not.toHaveBeenCalled();
	});
});
