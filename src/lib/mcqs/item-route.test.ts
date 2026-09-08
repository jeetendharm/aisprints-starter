import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, PUT } from "@/app/api/mcqs/[id]/handler";
import { getSessionUserId } from "@/lib/current-session";
import { InvalidMcqChoiceError, McqNotFoundError, mcqService } from "@/lib/services/mcqs";

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

const updateBody = {
	name: "Addition facts",
	question: "What is 2 + 2?",
	choices: [
		{ id: "choice-1", body: "3", isCorrect: false },
		{ id: "choice-2", body: "4", isCorrect: true },
	],
};

function context(id = "mcq-1") {
	return { params: Promise.resolve({ id }) };
}

function jsonRequest(method: string, body?: unknown) {
	return new Request(`http://localhost/api/mcqs/mcq-1`, {
		method,
		headers: { "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

describe("/api/mcqs/[id]", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getSessionUserId).mockResolvedValue("user-ada");
		vi.mocked(mcqService.getById).mockResolvedValue(mcq);
		vi.mocked(mcqService.update).mockResolvedValue(mcq);
		vi.mocked(mcqService.delete).mockResolvedValue(undefined);
	});

	it("GET /api/mcqs/[id] returns 200 with choices when found", async () => {
		const response = await GET(jsonRequest("GET"), context());
		const json = (await response.json()) as { mcq: unknown };

		expect(response.status).toBe(200);
		expect(json).toEqual({ mcq });
		expect(mcqService.getById).toHaveBeenCalledWith("mcq-1");
	});

	it("GET /api/mcqs/[id] returns 404 when missing", async () => {
		vi.mocked(mcqService.getById).mockResolvedValue(null);

		const response = await GET(jsonRequest("GET"), context());
		const json = (await response.json()) as { error: string };

		expect(response.status).toBe(404);
		expect(json.error).toBe("Question not found.");
	});

	it("PUT /api/mcqs/[id] returns 200 on a valid update", async () => {
		const response = await PUT(jsonRequest("PUT", updateBody), context());
		const json = (await response.json()) as { mcq: unknown };

		expect(response.status).toBe(200);
		expect(json).toEqual({ mcq });
		expect(mcqService.update).toHaveBeenCalledWith("mcq-1", updateBody);
	});

	it("PUT /api/mcqs/[id] returns 404 when missing", async () => {
		vi.mocked(mcqService.update).mockRejectedValue(new McqNotFoundError());

		const response = await PUT(jsonRequest("PUT", updateBody), context());
		const json = (await response.json()) as { error: string };

		expect(response.status).toBe(404);
		expect(json.error).toBe("Question not found.");
	});

	it("PUT /api/mcqs/[id] returns 400 when a choice id does not belong to the mcq", async () => {
		vi.mocked(mcqService.update).mockRejectedValue(new InvalidMcqChoiceError());

		const response = await PUT(jsonRequest("PUT", updateBody), context());
		const json = (await response.json()) as { error: string };

		expect(response.status).toBe(400);
		expect(json.error).toBe("Choice does not belong to this question.");
	});

	it("DELETE /api/mcqs/[id] returns 204 when the service deletes", async () => {
		const response = await DELETE(jsonRequest("DELETE"), context());

		expect(response.status).toBe(204);
		expect(await response.text()).toBe("");
		expect(mcqService.delete).toHaveBeenCalledWith("mcq-1");
	});

	it("DELETE /api/mcqs/[id] returns 404 when missing", async () => {
		vi.mocked(mcqService.delete).mockRejectedValue(new McqNotFoundError());

		const response = await DELETE(jsonRequest("DELETE"), context());
		const json = (await response.json()) as { error: string };

		expect(response.status).toBe(404);
		expect(json.error).toBe("Question not found.");
	});

	it("unauthenticated GET/PUT/DELETE return 401", async () => {
		vi.mocked(getSessionUserId).mockResolvedValue(null);

		const getResponse = await GET(jsonRequest("GET"), context());
		const putResponse = await PUT(jsonRequest("PUT", updateBody), context());
		const deleteResponse = await DELETE(jsonRequest("DELETE"), context());

		expect(getResponse.status).toBe(401);
		expect(putResponse.status).toBe(401);
		expect(deleteResponse.status).toBe(401);
		expect(mcqService.getById).not.toHaveBeenCalled();
		expect(mcqService.update).not.toHaveBeenCalled();
		expect(mcqService.delete).not.toHaveBeenCalled();
	});
});
