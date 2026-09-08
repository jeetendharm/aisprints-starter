import "server-only";
import { z } from "zod";
import { getDb } from "@/lib/db";

export type Attempt = {
	id: string;
	mcqId: string;
	userId: string;
	choiceId: string;
	isCorrect: boolean;
	createdAt: string;
};

export type CreateAttemptInput = {
	mcqId: string;
	userId: string;
	choiceId: string;
	isCorrect: boolean;
};

type AttemptRow = {
	id: string;
	mcq_id: string;
	user_id: string;
	choice_id: string;
	is_correct: number;
	created_at: string;
};

const createAttemptSchema = z.object({
	mcqId: z.string().min(1),
	userId: z.string().min(1),
	choiceId: z.string().min(1),
	isCorrect: z.boolean(),
});

function toAttempt(row: AttemptRow): Attempt {
	return {
		id: row.id,
		mcqId: row.mcq_id,
		userId: row.user_id,
		choiceId: row.choice_id,
		isCorrect: row.is_correct === 1,
		createdAt: row.created_at,
	};
}

async function create(input: CreateAttemptInput): Promise<Attempt> {
	const parsed = createAttemptSchema.parse(input);
	const id = crypto.randomUUID();
	const db = await getDb();

	await db
		.prepare(
			"INSERT INTO mcq_attempts (id, mcq_id, user_id, choice_id, is_correct) VALUES (?1, ?2, ?3, ?4, ?5)",
		)
		.bind(id, parsed.mcqId, parsed.userId, parsed.choiceId, parsed.isCorrect ? 1 : 0)
		.run();

	const { results } = await db
		.prepare(
			"SELECT id, mcq_id, user_id, choice_id, is_correct, created_at FROM mcq_attempts WHERE id = ?1",
		)
		.bind(id)
		.all<AttemptRow>();
	const row = results[0];
	if (!row) {
		throw new Error("Attempt was inserted but could not be read back.");
	}
	return toAttempt(row);
}

async function listByMcqAndUser(mcqId: string, userId: string): Promise<Attempt[]> {
	const db = await getDb();
	const { results } = await db
		.prepare(
			"SELECT id, mcq_id, user_id, choice_id, is_correct, created_at FROM mcq_attempts WHERE mcq_id = ?1 AND user_id = ?2 ORDER BY created_at DESC",
		)
		.bind(mcqId, userId)
		.all<AttemptRow>();
	return results.map(toAttempt);
}

export const attemptService = {
	create,
	listByMcqAndUser,
};
