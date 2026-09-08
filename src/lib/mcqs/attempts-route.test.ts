import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/mcqs/[id]/attempts/handler";
import { getSessionUserId } from "@/lib/current-session";
import { attemptService } from "@/lib/services/attempts";
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
		getById: vi.fn(),
	},
}));

vi.mock("@/lib/services/attempts", () => ({
	attemptService: {
		create: vi.fn(),
		listByMcqAndUser: vi.fn(),
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

const attempt = {
	id: "attempt-1",
	mcqId: "mcq-1",
	userId: "user-ada",
	choiceId: "choice-2",
	isCorrect: true,
	createdAt: "2026-09-08T00:00:01.000Z",
};

function context(id = "mcq-1") {
	return { params: Promise.resolve({ id }) };
}

function jsonRequest(method: string, body?: unknown) {
	return new Request("http://localhost/api/mcqs/mcq-1/attempts", {
		method,
		headers: { "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

describe("/api/mcqs/[id]/attempts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getSessionUserId).mockResolvedValue("user-ada");
		vi.mocked(mcqService.getById).mockResolvedValue(mcq);
		vi.mocked(attemptService.create).mockResolvedValue(attempt);
		vi.mocked(attemptService.listByMcqAndUser).mockResolvedValue([attempt]);
	});

	it("POST attempt with a valid choiceId returns 201 and isCorrect from the service", async () => {
		const response = await POST(jsonRequest("POST", { choiceId: "choice-2" }), context());
		const json = (await response.json()) as { attempt: unknown };

		expect(response.status).toBe(201);
		expect(json).toEqual({ attempt });
		expect(attemptService.create).toHaveBeenCalledWith({
			mcqId: "mcq-1",
			userId: "user-ada",
			choiceId: "choice-2",
			isCorrect: true,
		});
	});

	it("POST attempt with a choice that is not on the question returns 400", async () => {
		const response = await POST(jsonRequest("POST", { choiceId: "other-choice" }), context());
		const json = (await response.json()) as { error: string };

		expect(response.status).toBe(400);
		expect(json.error).toBe("Choice does not belong to this question.");
		expect(attemptService.create).not.toHaveBeenCalled();
	});

	it("POST attempt returns 401 when there is no session", async () => {
		vi.mocked(getSessionUserId).mockResolvedValue(null);

		const response = await POST(jsonRequest("POST", { choiceId: "choice-2" }), context());
		const json = (await response.json()) as { error: string };

		expect(response.status).toBe(401);
		expect(json.error).toBe("Authentication required.");
		expect(attemptService.create).not.toHaveBeenCalled();
	});

	it("GET attempts returns only the current user’s attempts", async () => {
		const response = await GET(jsonRequest("GET"), context());
		const json = (await response.json()) as { attempts: unknown };

		expect(response.status).toBe(200);
		expect(json).toEqual({ attempts: [attempt] });
		expect(attemptService.listByMcqAndUser).toHaveBeenCalledWith("mcq-1", "user-ada");
	});

	it("GET attempts returns 401 when there is no session", async () => {
		vi.mocked(getSessionUserId).mockResolvedValue(null);

		const response = await GET(jsonRequest("GET"), context());
		const json = (await response.json()) as { error: string };

		expect(response.status).toBe(401);
		expect(json.error).toBe("Authentication required.");
		expect(attemptService.listByMcqAndUser).not.toHaveBeenCalled();
	});
});
