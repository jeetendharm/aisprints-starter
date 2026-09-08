import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { attemptService } from "@/lib/services/attempts";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
	getDb: vi.fn(),
}));

type AttemptRow = {
	id: string;
	mcq_id: string;
	user_id: string;
	choice_id: string;
	is_correct: number;
	created_at: string;
};

function createMemoryDb() {
	const attempts: AttemptRow[] = [];
	let clock = Date.parse("2026-09-08T00:00:00.000Z");

	function now() {
		clock += 1000;
		return new Date(clock).toISOString();
	}

	function apply(sql: string, params: unknown[]) {
		if (/INSERT\s+INTO\s+mcq_attempts\b/i.test(sql)) {
			const [id, mcqId, userId, choiceId, isCorrect] = params;
			attempts.push({
				id: String(id),
				mcq_id: String(mcqId),
				user_id: String(userId),
				choice_id: String(choiceId),
				is_correct: Number(isCorrect),
				created_at: now(),
			});
		}
	}

	function select(sql: string, params: unknown[]): AttemptRow[] {
		if (!/FROM\s+mcq_attempts\b/i.test(sql)) {
			return [];
		}

		let rows = [...attempts];
		if (/\bWHERE\s+id\s*=/i.test(sql)) {
			rows = rows.filter((row) => row.id === params[0]);
		} else if (/\bmcq_id\s*=/i.test(sql) && /\buser_id\s*=/i.test(sql)) {
			rows = rows.filter((row) => row.mcq_id === params[0] && row.user_id === params[1]);
		} else if (/\bmcq_id\s*=/i.test(sql)) {
			rows = rows.filter((row) => row.mcq_id === params[0]);
		}

		if (/ORDER BY\s+created_at\s+DESC/i.test(sql)) {
			return rows.sort((left, right) => right.created_at.localeCompare(left.created_at));
		}
		return rows;
	}

	function statement(sql: string, params: unknown[] = []) {
		return {
			bind(...next: unknown[]) {
				return statement(sql, next);
			},
			async run() {
				apply(sql, params);
				return { success: true };
			},
			async all() {
				return { results: select(sql, params) };
			},
		};
	}

	const db = {
		prepare(sql: string) {
			return statement(sql);
		},
	};

	return { db, attempts };
}

describe("attemptService", () => {
	let attempts: AttemptRow[];

	beforeEach(() => {
		vi.clearAllMocks();
		const memory = createMemoryDb();
		attempts = memory.attempts;
		vi.mocked(getDb).mockResolvedValue(memory.db as unknown as D1Database);
	});

	it("create inserts an attempt with the given isCorrect snapshot", async () => {
		const created = await attemptService.create({
			mcqId: "mcq-1",
			userId: "user-ada",
			choiceId: "choice-4",
			isCorrect: true,
		});

		expect(created).toMatchObject({
			mcqId: "mcq-1",
			userId: "user-ada",
			choiceId: "choice-4",
			isCorrect: true,
		});
		expect(created.id).toEqual(expect.any(String));
		expect(created.createdAt).toEqual(expect.any(String));
		expect(created).not.toHaveProperty("mcq_id");
		expect(created).not.toHaveProperty("is_correct");
		expect(attempts).toHaveLength(1);
		expect(attempts[0]?.is_correct).toBe(1);
		expect(attempts[0]?.choice_id).toBe("choice-4");
	});

	it("listByMcqAndUser returns that user’s attempts newest first", async () => {
		const first = await attemptService.create({
			mcqId: "mcq-1",
			userId: "user-ada",
			choiceId: "choice-3",
			isCorrect: false,
		});
		const second = await attemptService.create({
			mcqId: "mcq-1",
			userId: "user-ada",
			choiceId: "choice-4",
			isCorrect: true,
		});

		const listed = await attemptService.listByMcqAndUser("mcq-1", "user-ada");

		expect(listed.map((attempt) => attempt.id)).toEqual([second.id, first.id]);
		expect(listed[0]?.isCorrect).toBe(true);
		expect(listed[1]?.isCorrect).toBe(false);
	});

	it("listByMcqAndUser does not return another user’s attempts", async () => {
		await attemptService.create({
			mcqId: "mcq-1",
			userId: "user-ada",
			choiceId: "choice-4",
			isCorrect: true,
		});
		await attemptService.create({
			mcqId: "mcq-1",
			userId: "user-grace",
			choiceId: "choice-3",
			isCorrect: false,
		});

		const listed = await attemptService.listByMcqAndUser("mcq-1", "user-ada");

		expect(listed).toHaveLength(1);
		expect(listed[0]?.userId).toBe("user-ada");
	});
});
