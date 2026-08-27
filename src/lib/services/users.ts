import "server-only";
import { z } from "zod";
import { getDb } from "@/lib/db";

export class UniqueConstraintError extends Error {
	constructor(message = "An account with that username or email already exists.") {
		super(message);
		this.name = "UniqueConstraintError";
	}
}

export type PublicUser = {
	id: string;
	firstName: string;
	lastName: string;
	username: string;
	email: string;
};

export type UserRecord = PublicUser & {
	passwordHash: string;
};

export type CreateUserInput = {
	firstName: string;
	lastName: string;
	username: string;
	email: string;
	passwordHash: string;
};

export type UpdateUserInput = {
	firstName?: string;
	lastName?: string;
	username?: string;
	email?: string;
	passwordHash?: string;
};

type UserRow = {
	id: string;
	first_name: string;
	last_name: string;
	username: string;
	email: string;
	password_hash: string;
};

const createUserSchema = z.object({
	firstName: z.string().trim().min(1).max(50),
	lastName: z.string().trim().min(1).max(50),
	username: z
		.string()
		.trim()
		.min(3)
		.max(30)
		.regex(/^[a-zA-Z0-9_]+$/),
	email: z.email(),
	passwordHash: z.string().min(1),
});

const updateUserSchema = z
	.object({
		firstName: z.string().trim().min(1).max(50).optional(),
		lastName: z.string().trim().min(1).max(50).optional(),
		username: z
			.string()
			.trim()
			.min(3)
			.max(30)
			.regex(/^[a-zA-Z0-9_]+$/)
			.optional(),
		email: z.email().optional(),
		passwordHash: z.string().min(1).optional(),
	})
	.refine((value) => Object.values(value).some((field) => field !== undefined), {
		message: "At least one field is required",
	});

function isUniqueConstraintFailure(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /UNIQUE constraint failed/i.test(message);
}

function toPublicUser(row: UserRow): PublicUser {
	return {
		id: row.id,
		firstName: row.first_name,
		lastName: row.last_name,
		username: row.username,
		email: row.email,
	};
}

function toUserRecord(row: UserRow): UserRecord {
	return {
		...toPublicUser(row),
		passwordHash: row.password_hash,
	};
}

async function queryOne(sql: string, ...params: unknown[]): Promise<UserRow | null> {
	const db = await getDb();
	const { results } = await db
		.prepare(sql)
		.bind(...params)
		.all<UserRow>();
	return results[0] ?? null;
}

async function create(input: CreateUserInput): Promise<PublicUser> {
	const parsed = createUserSchema.parse(input);
	const id = crypto.randomUUID();
	const username = parsed.username.toLowerCase();
	const email = parsed.email.toLowerCase();
	const db = await getDb();

	try {
		await db
			.prepare(
				"INSERT INTO users (id, first_name, last_name, username, email, password_hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
			)
			.bind(id, parsed.firstName, parsed.lastName, username, email, parsed.passwordHash)
			.run();
	} catch (error) {
		if (isUniqueConstraintFailure(error)) {
			throw new UniqueConstraintError();
		}
		throw error;
	}

	const created = await getById(id);
	if (!created) {
		throw new Error("User was inserted but could not be read back.");
	}
	return created;
}

async function getById(id: string): Promise<PublicUser | null> {
	const row = await queryOne(
		"SELECT id, first_name, last_name, username, email FROM users WHERE id = ?1",
		id,
	);
	return row ? toPublicUser(row) : null;
}

async function getByUsername(username: string): Promise<UserRecord | null> {
	const row = await queryOne(
		"SELECT id, first_name, last_name, username, email, password_hash FROM users WHERE username = ?1",
		username.trim().toLowerCase(),
	);
	return row ? toUserRecord(row) : null;
}

async function update(id: string, input: UpdateUserInput): Promise<PublicUser> {
	const parsed = updateUserSchema.parse(input);
	const sets: string[] = [];
	const values: unknown[] = [];
	let index = 1;

	if (parsed.firstName !== undefined) {
		sets.push(`first_name = ?${index}`);
		values.push(parsed.firstName);
		index += 1;
	}
	if (parsed.lastName !== undefined) {
		sets.push(`last_name = ?${index}`);
		values.push(parsed.lastName);
		index += 1;
	}
	if (parsed.username !== undefined) {
		sets.push(`username = ?${index}`);
		values.push(parsed.username.toLowerCase());
		index += 1;
	}
	if (parsed.email !== undefined) {
		sets.push(`email = ?${index}`);
		values.push(parsed.email.toLowerCase());
		index += 1;
	}
	if (parsed.passwordHash !== undefined) {
		sets.push(`password_hash = ?${index}`);
		values.push(parsed.passwordHash);
		index += 1;
	}

	sets.push(`updated_at = ?${index}`);
	values.push(new Date().toISOString());
	index += 1;
	values.push(id);

	const db = await getDb();
	try {
		await db
			.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?${index}`)
			.bind(...values)
			.run();
	} catch (error) {
		if (isUniqueConstraintFailure(error)) {
			throw new UniqueConstraintError();
		}
		throw error;
	}

	const updated = await getById(id);
	if (!updated) {
		throw new Error(`User ${id} was not found.`);
	}
	return updated;
}

async function deleteUser(id: string): Promise<void> {
	const db = await getDb();
	await db.prepare("DELETE FROM users WHERE id = ?1").bind(id).run();
}

export const userService = {
	create,
	getById,
	getByUsername,
	update,
	delete: deleteUser,
};
