import { ZodError } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { InvalidMcqChoiceError, McqNotFoundError, mcqService } from "@/lib/services/mcqs";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
	getDb: vi.fn(),
}));

type McqRow = {
	id: string;
	name: string;
	question: string;
	created_by: string;
	created_at: string;
	updated_at: string;
};

type ChoiceRow = {
	id: string;
	mcq_id: string;
	body: string;
	is_correct: number;
	position: number;
	created_at: string;
	updated_at: string;
};

function createMemoryDb() {
	const mcqs: McqRow[] = [];
	const choices: ChoiceRow[] = [];
	let clock = Date.parse("2026-09-08T00:00:00.000Z");

	function now() {
		clock += 1000;
		return new Date(clock).toISOString();
	}

	function apply(sql: string, params: unknown[]) {
		if (/INSERT\s+INTO\s+mcqs\b/i.test(sql)) {
			const [id, name, question, createdBy] = params as string[];
			const timestamp = now();
			mcqs.push({
				id,
				name,
				question,
				created_by: createdBy,
				created_at: timestamp,
				updated_at: timestamp,
			});
			return;
		}

		if (/INSERT\s+INTO\s+mcq_choices\b/i.test(sql)) {
			const [id, mcqId, body, isCorrect, position] = params;
			const timestamp = now();
			choices.push({
				id: String(id),
				mcq_id: String(mcqId),
				body: String(body),
				is_correct: Number(isCorrect),
				position: Number(position),
				created_at: timestamp,
				updated_at: timestamp,
			});
			return;
		}

		if (/UPDATE\s+mcqs\b/i.test(sql)) {
			const id = String(params[params.length - 1]);
			const row = mcqs.find((candidate) => candidate.id === id);
			if (!row) {
				return;
			}
			const setClause = sql.split(/WHERE/i)[0] ?? "";
			const columns = [...setClause.matchAll(/(\w+)\s*=\s*\?\d+/g)].map((match) => match[1]);
			columns.forEach((column, index) => {
				const value = String(params[index]);
				if (column === "name") row.name = value;
				if (column === "question") row.question = value;
				if (column === "updated_at") row.updated_at = value;
			});
			return;
		}

		if (/UPDATE\s+mcq_choices\b/i.test(sql)) {
			const id = String(params[params.length - 1]);
			const row = choices.find((candidate) => candidate.id === id);
			if (!row) {
				return;
			}
			const setClause = sql.split(/WHERE/i)[0] ?? "";
			const columns = [...setClause.matchAll(/(\w+)\s*=\s*\?\d+/g)].map((match) => match[1]);
			columns.forEach((column, index) => {
				const value = params[index];
				if (column === "body") row.body = String(value);
				if (column === "is_correct") row.is_correct = Number(value);
				if (column === "position") row.position = Number(value);
				if (column === "updated_at") row.updated_at = String(value);
			});
			return;
		}

		if (/DELETE\s+FROM\s+mcq_choices\b/i.test(sql)) {
			if (/\bWHERE\s+id\s*=/i.test(sql)) {
				const id = String(params[0]);
				const index = choices.findIndex((row) => row.id === id);
				if (index >= 0) {
					choices.splice(index, 1);
				}
				return;
			}
			if (/\bWHERE\s+mcq_id\s*=/i.test(sql)) {
				const mcqId = String(params[0]);
				for (let index = choices.length - 1; index >= 0; index -= 1) {
					if (choices[index]?.mcq_id === mcqId) {
						choices.splice(index, 1);
					}
				}
			}
			return;
		}

		if (/DELETE\s+FROM\s+mcqs\b/i.test(sql)) {
			const id = String(params[0]);
			const index = mcqs.findIndex((row) => row.id === id);
			if (index >= 0) {
				mcqs.splice(index, 1);
			}
			for (let choiceIndex = choices.length - 1; choiceIndex >= 0; choiceIndex -= 1) {
				if (choices[choiceIndex]?.mcq_id === id) {
					choices.splice(choiceIndex, 1);
				}
			}
		}
	}

	function select(sql: string, params: unknown[]): unknown[] {
		if (/FROM\s+mcq_choices\b/i.test(sql)) {
			const mcqId = String(params[0]);
			const rows = choices.filter((row) => row.mcq_id === mcqId);
			if (/ORDER BY\s+position/i.test(sql)) {
				return [...rows].sort((left, right) => left.position - right.position);
			}
			return rows;
		}

		if (/FROM\s+mcqs\b/i.test(sql) && /\bWHERE\s+id\s*=/i.test(sql)) {
			return mcqs.filter((row) => row.id === params[0]);
		}

		if (/FROM\s+mcqs\b/i.test(sql)) {
			const rows = [...mcqs];
			if (/ORDER BY\s+created_at\s+DESC/i.test(sql)) {
				return rows.sort((left, right) => right.created_at.localeCompare(left.created_at));
			}
			return rows;
		}

		return [];
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
		async batch(statements: Array<{ run: () => Promise<unknown> }>) {
			for (const item of statements) {
				await item.run();
			}
			return [];
		},
	};

	return { db, mcqs, choices };
}

const teacherId = "teacher-ada";

function validCreateInput(overrides: Partial<{ name: string; question: string; createdBy: string }> = {}) {
	return {
		name: "Addition facts",
		question: "What is 2 + 2?",
		createdBy: teacherId,
		choices: [
			{ body: "3", isCorrect: false },
			{ body: "4", isCorrect: true },
		],
		...overrides,
	};
}

describe("mcqService", () => {
	let mcqs: McqRow[];
	let choices: ChoiceRow[];

	beforeEach(() => {
		vi.clearAllMocks();
		const memory = createMemoryDb();
		mcqs = memory.mcqs;
		choices = memory.choices;
		vi.mocked(getDb).mockResolvedValue(memory.db as unknown as D1Database);
	});

	it("create inserts an mcq and its choices and returns them without a D1 row shape", async () => {
		const created = await mcqService.create(validCreateInput());

		expect(created).toMatchObject({
			name: "Addition facts",
			question: "What is 2 + 2?",
			createdBy: teacherId,
		});
		expect(created.id).toEqual(expect.any(String));
		expect(created.createdAt).toEqual(expect.any(String));
		expect(created.updatedAt).toEqual(expect.any(String));
		expect(created.choices).toHaveLength(2);
		expect(created).not.toHaveProperty("created_by");
		expect(created).not.toHaveProperty("created_at");
		expect(created.choices[0]).not.toHaveProperty("is_correct");
		expect(created.choices[0]).not.toHaveProperty("mcq_id");
		expect(mcqs).toHaveLength(1);
		expect(choices).toHaveLength(2);
	});

	it("create assigns position in array order and persists exactly one is_correct = 1", async () => {
		await mcqService.create(validCreateInput());

		const ordered = [...choices].sort((left, right) => left.position - right.position);
		expect(ordered.map((row) => row.body)).toEqual(["3", "4"]);
		expect(ordered.map((row) => row.position)).toEqual([0, 1]);
		expect(ordered.filter((row) => row.is_correct === 1)).toHaveLength(1);
		expect(ordered.find((row) => row.body === "4")?.is_correct).toBe(1);
	});

	it("create rejects fewer than 2 or more than 6 choices", async () => {
		await expect(
			mcqService.create({
				...validCreateInput(),
				choices: [{ body: "only", isCorrect: true }],
			}),
		).rejects.toBeInstanceOf(ZodError);

		await expect(
			mcqService.create({
				...validCreateInput(),
				choices: [
					{ body: "1", isCorrect: true },
					{ body: "2", isCorrect: false },
					{ body: "3", isCorrect: false },
					{ body: "4", isCorrect: false },
					{ body: "5", isCorrect: false },
					{ body: "6", isCorrect: false },
					{ body: "7", isCorrect: false },
				],
			}),
		).rejects.toBeInstanceOf(ZodError);
	});

	it("create rejects a payload with zero or multiple correct choices", async () => {
		await expect(
			mcqService.create({
				...validCreateInput(),
				choices: [
					{ body: "3", isCorrect: false },
					{ body: "5", isCorrect: false },
				],
			}),
		).rejects.toBeInstanceOf(ZodError);

		await expect(
			mcqService.create({
				...validCreateInput(),
				choices: [
					{ body: "3", isCorrect: true },
					{ body: "4", isCorrect: true },
				],
			}),
		).rejects.toBeInstanceOf(ZodError);
	});

	it("list returns mcqs newest first and does not include choices", async () => {
		const first = await mcqService.create(validCreateInput({ name: "Older" }));
		const second = await mcqService.create(validCreateInput({ name: "Newer", question: "What is 3 + 1?" }));

		const listed = await mcqService.list();

		expect(listed.map((item) => item.id)).toEqual([second.id, first.id]);
		expect(listed[0]).not.toHaveProperty("choices");
		expect(listed[0]).toMatchObject({
			name: "Newer",
			question: "What is 3 + 1?",
			createdBy: teacherId,
		});
	});

	it("getById returns the mcq with choices ordered by position, or null when missing", async () => {
		const created = await mcqService.create(validCreateInput());

		const found = await mcqService.getById(created.id);
		expect(found).toEqual(created);
		expect(found?.choices.map((choice) => choice.position)).toEqual([0, 1]);
		expect(found?.choices.map((choice) => choice.body)).toEqual(["3", "4"]);

		await expect(mcqService.getById("missing-id")).resolves.toBeNull();
	});

	it("update changes name/question, updates existing choice ids, inserts new choices, and deletes omitted ones", async () => {
		const created = await mcqService.create(validCreateInput());
		const keepId = created.choices[0]?.id;
		const dropId = created.choices[1]?.id;
		expect(keepId).toBeDefined();
		expect(dropId).toBeDefined();

		const updated = await mcqService.update(created.id, {
			name: "Subtraction facts",
			question: "What is 5 - 1?",
			choices: [
				{ id: keepId, body: "3", isCorrect: false },
				{ body: "4", isCorrect: true },
			],
		});

		expect(updated.name).toBe("Subtraction facts");
		expect(updated.question).toBe("What is 5 - 1?");
		expect(updated.choices).toHaveLength(2);
		expect(updated.choices[0]).toMatchObject({ id: keepId, body: "3", isCorrect: false, position: 0 });
		expect(updated.choices[1]).toMatchObject({ body: "4", isCorrect: true, position: 1 });
		expect(updated.choices[1]?.id).not.toBe(dropId);
		expect(choices.find((row) => row.id === dropId)).toBeUndefined();
		expect(choices).toHaveLength(2);
	});

	it("update rejects a choice id that does not belong to the mcq", async () => {
		const created = await mcqService.create(validCreateInput());
		const other = await mcqService.create(validCreateInput({ name: "Other", question: "What is 1 + 1?" }));

		await expect(
			mcqService.update(created.id, {
				name: created.name,
				question: created.question,
				choices: [
					{ id: other.choices[0]?.id, body: "stolen", isCorrect: true },
					{ body: "extra", isCorrect: false },
				],
			}),
		).rejects.toBeInstanceOf(InvalidMcqChoiceError);
	});

	it("delete removes the mcq", async () => {
		const created = await mcqService.create(validCreateInput());

		await mcqService.delete(created.id);

		await expect(mcqService.getById(created.id)).resolves.toBeNull();
		expect(mcqs).toHaveLength(0);
		expect(choices).toHaveLength(0);
	});

	it("delete throws McqNotFoundError when the row is missing", async () => {
		await expect(mcqService.delete("missing-id")).rejects.toBeInstanceOf(McqNotFoundError);
	});

	it("create and update trim name and question", async () => {
		const created = await mcqService.create(
			validCreateInput({
				name: "  Addition facts  ",
				question: "  What is 2 + 2?  ",
			}),
		);

		expect(created.name).toBe("Addition facts");
		expect(created.question).toBe("What is 2 + 2?");
		expect(mcqs[0]?.name).toBe("Addition facts");
		expect(mcqs[0]?.question).toBe("What is 2 + 2?");

		const updated = await mcqService.update(created.id, {
			name: "  Trimmed name  ",
			question: "  Trimmed question  ",
			choices: created.choices.map((choice, index) => ({
				id: choice.id,
				body: choice.body,
				isCorrect: index === 1,
			})),
		});

		expect(updated.name).toBe("Trimmed name");
		expect(updated.question).toBe("Trimmed question");
	});

	it("create rejects a missing or blank question", async () => {
		await expect(
			mcqService.create({
				name: "Addition facts",
				question: "   ",
				createdBy: teacherId,
				choices: [
					{ body: "3", isCorrect: false },
					{ body: "4", isCorrect: true },
				],
			}),
		).rejects.toBeInstanceOf(ZodError);

		await expect(
			mcqService.create({
				name: "Addition facts",
				createdBy: teacherId,
				choices: [
					{ body: "3", isCorrect: false },
					{ body: "4", isCorrect: true },
				],
			} as never),
		).rejects.toBeInstanceOf(ZodError);
	});
});
