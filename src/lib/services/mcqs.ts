import "server-only";
import { z } from "zod";
import { getDb } from "@/lib/db";

export class McqNotFoundError extends Error {
	constructor(message = "Question not found.") {
		super(message);
		this.name = "McqNotFoundError";
	}
}

export class InvalidMcqChoiceError extends Error {
	constructor(message = "Choice does not belong to this question.") {
		super(message);
		this.name = "InvalidMcqChoiceError";
	}
}

export type McqChoice = {
	id: string;
	body: string;
	isCorrect: boolean;
	position: number;
};

export type McqListItem = {
	id: string;
	name: string;
	question: string;
	createdBy: string;
	createdAt: string;
	updatedAt: string;
};

export type Mcq = McqListItem & {
	choices: McqChoice[];
};

export type CreateMcqInput = {
	name: string;
	question: string;
	createdBy: string;
	choices: { body: string; isCorrect: boolean }[];
};

export type UpdateMcqInput = {
	name: string;
	question: string;
	choices: { id?: string; body: string; isCorrect: boolean }[];
};

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
};

const choiceBodySchema = z.string().trim().min(1).max(500);

const createChoiceSchema = z.object({
	body: choiceBodySchema,
	isCorrect: z.boolean(),
});

const updateChoiceSchema = z.object({
	id: z.string().min(1).optional(),
	body: choiceBodySchema,
	isCorrect: z.boolean(),
});

const exactlyOneCorrect = {
	message: "Exactly one choice must be correct",
	path: ["choices"],
};

const createMcqSchema = z
	.object({
		name: z.string().trim().min(1).max(200),
		question: z.string().trim().min(1).max(2000),
		createdBy: z.string().min(1),
		choices: z.array(createChoiceSchema).min(2).max(6),
	})
	.refine((value) => value.choices.filter((choice) => choice.isCorrect).length === 1, exactlyOneCorrect);

const updateMcqSchema = z
	.object({
		name: z.string().trim().min(1).max(200),
		question: z.string().trim().min(1).max(2000),
		choices: z.array(updateChoiceSchema).min(2).max(6),
	})
	.refine((value) => value.choices.filter((choice) => choice.isCorrect).length === 1, exactlyOneCorrect);

function toListItem(row: McqRow): McqListItem {
	return {
		id: row.id,
		name: row.name,
		question: row.question,
		createdBy: row.created_by,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toChoice(row: ChoiceRow): McqChoice {
	return {
		id: row.id,
		body: row.body,
		isCorrect: row.is_correct === 1,
		position: row.position,
	};
}

async function listChoices(mcqId: string): Promise<McqChoice[]> {
	const db = await getDb();
	const { results } = await db
		.prepare(
			"SELECT id, mcq_id, body, is_correct, position FROM mcq_choices WHERE mcq_id = ?1 ORDER BY position ASC",
		)
		.bind(mcqId)
		.all<ChoiceRow>();
	return results.map(toChoice);
}

async function list(): Promise<McqListItem[]> {
	const db = await getDb();
	const { results } = await db
		.prepare(
			"SELECT id, name, question, created_by, created_at, updated_at FROM mcqs ORDER BY created_at DESC",
		)
		.all<McqRow>();
	return results.map(toListItem);
}

async function getById(id: string): Promise<Mcq | null> {
	const db = await getDb();
	const { results } = await db
		.prepare(
			"SELECT id, name, question, created_by, created_at, updated_at FROM mcqs WHERE id = ?1",
		)
		.bind(id)
		.all<McqRow>();
	const row = results[0];
	if (!row) {
		return null;
	}
	return {
		...toListItem(row),
		choices: await listChoices(id),
	};
}

async function create(input: CreateMcqInput): Promise<Mcq> {
	const parsed = createMcqSchema.parse(input);
	const id = crypto.randomUUID();
	const db = await getDb();
	const choiceInserts = parsed.choices.map((choice, position) =>
		db
			.prepare(
				"INSERT INTO mcq_choices (id, mcq_id, body, is_correct, position) VALUES (?1, ?2, ?3, ?4, ?5)",
			)
			.bind(crypto.randomUUID(), id, choice.body, choice.isCorrect ? 1 : 0, position),
	);

	await db.batch([
		db
			.prepare("INSERT INTO mcqs (id, name, question, created_by) VALUES (?1, ?2, ?3, ?4)")
			.bind(id, parsed.name, parsed.question, parsed.createdBy),
		...choiceInserts,
	]);

	const created = await getById(id);
	if (!created) {
		throw new Error("Question was inserted but could not be read back.");
	}
	return created;
}

async function update(id: string, input: UpdateMcqInput): Promise<Mcq> {
	const existing = await getById(id);
	if (!existing) {
		throw new McqNotFoundError();
	}

	const parsed = updateMcqSchema.parse(input);
	const existingIds = new Set(existing.choices.map((choice) => choice.id));

	for (const choice of parsed.choices) {
		if (choice.id && !existingIds.has(choice.id)) {
			throw new InvalidMcqChoiceError();
		}
	}

	const keepIds = new Set(parsed.choices.filter((choice) => choice.id).map((choice) => choice.id as string));
	const removed = existing.choices.filter((choice) => !keepIds.has(choice.id));
	const db = await getDb();
	const now = new Date().toISOString();
	const statements = [
		...removed.map((choice) => db.prepare("DELETE FROM mcq_choices WHERE id = ?1").bind(choice.id)),
		db
			.prepare("UPDATE mcqs SET name = ?1, question = ?2, updated_at = ?3 WHERE id = ?4")
			.bind(parsed.name, parsed.question, now, id),
	];

	parsed.choices.forEach((choice, position) => {
		if (choice.id) {
			statements.push(
				db
					.prepare(
						"UPDATE mcq_choices SET body = ?1, is_correct = ?2, position = ?3, updated_at = ?4 WHERE id = ?5",
					)
					.bind(choice.body, choice.isCorrect ? 1 : 0, position, now, choice.id),
			);
			return;
		}
		statements.push(
			db
				.prepare(
					"INSERT INTO mcq_choices (id, mcq_id, body, is_correct, position) VALUES (?1, ?2, ?3, ?4, ?5)",
				)
				.bind(crypto.randomUUID(), id, choice.body, choice.isCorrect ? 1 : 0, position),
		);
	});

	await db.batch(statements);

	const updated = await getById(id);
	if (!updated) {
		throw new McqNotFoundError();
	}
	return updated;
}

async function deleteMcq(id: string): Promise<void> {
	const existing = await getById(id);
	if (!existing) {
		throw new McqNotFoundError();
	}
	const db = await getDb();
	await db.prepare("DELETE FROM mcqs WHERE id = ?1").bind(id).run();
}

export const mcqService = {
	list,
	getById,
	create,
	update,
	delete: deleteMcq,
};
