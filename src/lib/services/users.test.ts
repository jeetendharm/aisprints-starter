import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { UniqueConstraintError, userService, type PublicUser } from "@/lib/services/users";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
	getDb: vi.fn(),
}));

type UserRow = {
	id: string;
	first_name: string;
	last_name: string;
	username: string;
	email: string;
	password_hash: string;
	created_at: string;
	updated_at: string;
};

function createMemoryDb() {
	const rows: UserRow[] = [];

	function throwIfUniqueConflict(username: string, email: string, exceptId?: string) {
		const conflict = rows.find(
			(row) => row.id !== exceptId && (row.username === username || row.email === email),
		);
		if (conflict) {
			const column = conflict.username === username ? "username" : "email";
			throw new Error(`UNIQUE constraint failed: users.${column}`);
		}
	}

	function select(sql: string, params: unknown[]): UserRow[] {
		if (/\bWHERE\s+id\s*=/i.test(sql)) {
			return rows.filter((row) => row.id === params[0]);
		}
		if (/\bWHERE\s+username\s*=/i.test(sql)) {
			return rows.filter((row) => row.username === params[0]);
		}
		return [];
	}

	function insert(params: unknown[]) {
		const [id, firstName, lastName, username, email, passwordHash] = params as string[];
		throwIfUniqueConflict(username, email);
		const now = new Date().toISOString();
		rows.push({
			id,
			first_name: firstName,
			last_name: lastName,
			username,
			email,
			password_hash: passwordHash,
			created_at: now,
			updated_at: now,
		});
	}

	function update(sql: string, params: unknown[]) {
		const id = String(params[params.length - 1]);
		const row = rows.find((candidate) => candidate.id === id);
		if (!row) {
			return;
		}

		const setClause = sql.split(/WHERE/i)[0] ?? "";
		const columns = [...setClause.matchAll(/(\w+)\s*=\s*\?\d+/g)].map((match) => match[1]);
		columns.forEach((column, index) => {
			const value = String(params[index]);
			if (column === "first_name") row.first_name = value;
			if (column === "last_name") row.last_name = value;
			if (column === "username") {
				throwIfUniqueConflict(value, row.email, row.id);
				row.username = value;
			}
			if (column === "email") {
				throwIfUniqueConflict(row.username, value, row.id);
				row.email = value;
			}
			if (column === "password_hash") row.password_hash = value;
			if (column === "updated_at") row.updated_at = value;
		});
	}

	let lastMutationSql = "";

	const db = {
		prepare(sql: string) {
			return {
				bind(...params: unknown[]) {
					return {
						async run() {
							lastMutationSql = sql;
							if (/INSERT\s+INTO\s+users/i.test(sql)) {
								insert(params);
							} else if (/UPDATE\s+users/i.test(sql)) {
								update(sql, params);
							} else if (/DELETE\s+FROM\s+users/i.test(sql)) {
								const id = String(params[0]);
								const index = rows.findIndex((row) => row.id === id);
								if (index >= 0) {
									rows.splice(index, 1);
								}
							}
							return { success: true };
						},
						async all() {
							return { results: select(sql, params) };
						},
					};
				},
			};
		},
	};

	return { db, rows, getLastMutationSql: () => lastMutationSql };
}

const ada = {
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ALovelace",
	email: "Ada@School.edu",
	passwordHash: "pbkdf2$hashed-secret",
};

describe("userService", () => {
	let rows: UserRow[];
	let getLastMutationSql: () => string;

	beforeEach(() => {
		vi.clearAllMocks();
		const memory = createMemoryDb();
		rows = memory.rows;
		getLastMutationSql = memory.getLastMutationSql;
		vi.mocked(getDb).mockResolvedValue(memory.db as unknown as D1Database);
	});

	it("create inserts a user and returns PublicUser without password_hash", async () => {
		const created = await userService.create(ada);

		expect(created).toMatchObject({
			firstName: "Ada",
			lastName: "Lovelace",
			username: "alovelace",
			email: "ada@school.edu",
		});
		expect(created.id).toEqual(expect.any(String));
		expect(created).not.toHaveProperty("passwordHash");
		expect(created).not.toHaveProperty("password_hash");
		expect(rows).toHaveLength(1);
		expect(rows[0]?.password_hash).toBe("pbkdf2$hashed-secret");
	});

	it("create normalizes username and email to lowercase", async () => {
		const created = await userService.create(ada);

		expect(created.username).toBe("alovelace");
		expect(created.email).toBe("ada@school.edu");
		expect(rows[0]?.username).toBe("alovelace");
		expect(rows[0]?.email).toBe("ada@school.edu");
	});

	it("getById returns the user when present and null when missing", async () => {
		const created = await userService.create(ada);

		await expect(userService.getById(created.id)).resolves.toEqual(created);
		await expect(userService.getById("missing-id")).resolves.toBeNull();
	});

	it("getByUsername finds a user after case-insensitive lookup", async () => {
		await userService.create(ada);

		const found = await userService.getByUsername("ALOVELACE");
		expect(found?.username).toBe("alovelace");
		expect(found?.email).toBe("ada@school.edu");
	});

	it("getByUsername returns password_hash only on the internal type used for login compare", async () => {
		const created: PublicUser = await userService.create(ada);
		const found = await userService.getByUsername("alovelace");

		expect(created).not.toHaveProperty("passwordHash");
		expect(found).toMatchObject({
			id: created.id,
			firstName: "Ada",
			username: "alovelace",
			passwordHash: "pbkdf2$hashed-secret",
		});
	});

	it("update changes provided fields and sets updated_at", async () => {
		const created = await userService.create(ada);

		const updated = await userService.update(created.id, { firstName: "Grace" });

		expect(updated.firstName).toBe("Grace");
		expect(updated.lastName).toBe("Lovelace");
		expect(updated).not.toHaveProperty("passwordHash");
		expect(getLastMutationSql()).toMatch(/updated_at\s*=/i);
		expect(rows[0]?.updated_at).toEqual(expect.any(String));
	});

	it("delete removes the user", async () => {
		const created = await userService.create(ada);

		await userService.delete(created.id);

		await expect(userService.getById(created.id)).resolves.toBeNull();
		expect(rows).toHaveLength(0);
	});

	it("create surfaces a unique-constraint failure when username or email already exists", async () => {
		await userService.create(ada);

		await expect(
			userService.create({
				...ada,
				email: "other@school.edu",
			}),
		).rejects.toBeInstanceOf(UniqueConstraintError);

		await expect(
			userService.create({
				...ada,
				username: "otheruser",
			}),
		).rejects.toBeInstanceOf(UniqueConstraintError);
	});
});
