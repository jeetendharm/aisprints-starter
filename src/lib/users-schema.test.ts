import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "migrations");

function loadMigrationSql(): string {
	expect(existsSync(migrationsDir), "migrations directory must exist").toBe(true);

	const files = readdirSync(migrationsDir)
		.filter((file) => file.endsWith(".sql"))
		.sort();

	expect(files.length, "at least one SQL migration file must exist").toBeGreaterThan(0);

	return files.map((file) => readFileSync(join(migrationsDir, file), "utf8")).join("\n");
}

function getUsersTableSql(sql: string): string {
	const match = sql.match(/CREATE TABLE\s+users\s*\(([\s\S]*?)\);/i);
	expect(match, "CREATE TABLE users statement must exist").not.toBeNull();
	return match![0];
}

describe("users migration", () => {
	it("users migration creates a users table", () => {
		const sql = loadMigrationSql();
		expect(sql).toMatch(/CREATE TABLE\s+users\b/i);
	});

	it("users table has a TEXT primary key named id", () => {
		const usersTable = getUsersTableSql(loadMigrationSql());
		expect(usersTable).toMatch(/\bid\s+TEXT\s+PRIMARY KEY\b/i);
	});

	it("users table has first_name, last_name, username, email, and password_hash as NOT NULL columns", () => {
		const usersTable = getUsersTableSql(loadMigrationSql());

		for (const column of ["first_name", "last_name", "username", "email", "password_hash"]) {
			expect(usersTable, `${column} must be TEXT NOT NULL`).toMatch(
				new RegExp(`\\b${column}\\s+TEXT\\s+NOT NULL\\b`, "i"),
			);
		}
	});

	it("username and email are UNIQUE", () => {
		const usersTable = getUsersTableSql(loadMigrationSql());
		expect(usersTable).toMatch(/\busername\s+TEXT\s+NOT NULL\s+UNIQUE\b/i);
		expect(usersTable).toMatch(/\bemail\s+TEXT\s+NOT NULL\s+UNIQUE\b/i);
	});

	it("users table does not store a plaintext password column", () => {
		const usersTable = getUsersTableSql(loadMigrationSql());
		expect(usersTable).not.toMatch(/\bpassword\b(?!_hash)/i);
		expect(usersTable).toMatch(/\bpassword_hash\b/i);
	});
});
