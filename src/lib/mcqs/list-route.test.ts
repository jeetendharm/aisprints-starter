import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/mcqs/handler";
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

const listedMcq = {
	id: "mcq-1",
	name: "Addition facts",
	question: "What is 2 + 2?",
	createdBy: "user-ada",
	createdAt: "2026-09-08T00:00:00.000Z",
	updatedAt: "2026-09-08T00:00:00.000Z",
};

describe("GET /api/mcqs", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getSessionUserId).mockResolvedValue("user-ada");
		vi.mocked(mcqService.list).mockResolvedValue([listedMcq]);
	});

	it("GET /api/mcqs returns 200 and the service list when the session is valid", async () => {
		const response = await GET();
		const json = (await response.json()) as { mcqs: unknown };

		expect(response.status).toBe(200);
		expect(json).toEqual({ mcqs: [listedMcq] });
		expect(mcqService.list).toHaveBeenCalledOnce();
	});

	it("GET /api/mcqs returns 401 when there is no session", async () => {
		vi.mocked(getSessionUserId).mockResolvedValue(null);

		const response = await GET();
		const json = (await response.json()) as { error: string };

		expect(response.status).toBe(401);
		expect(json.error).toBe("Authentication required.");
		expect(mcqService.list).not.toHaveBeenCalled();
	});
});
