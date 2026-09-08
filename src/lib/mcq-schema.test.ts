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

function getTableSql(sql: string, tableName: string): string {
	const match = sql.match(new RegExp(`CREATE TABLE\\s+${tableName}\\s*\\(([\\s\\S]*?)\\);`, "i"));
	expect(match, `CREATE TABLE ${tableName} statement must exist`).not.toBeNull();
	return match![0];
}

describe("mcq schema migration", () => {
	it("mcqs migration creates an mcqs table", () => {
		const sql = loadMigrationSql();
		expect(sql).toMatch(/CREATE TABLE\s+mcqs\b/i);
	});

	it("mcqs table has a TEXT primary key named id", () => {
		const mcqsTable = getTableSql(loadMigrationSql(), "mcqs");
		expect(mcqsTable).toMatch(/\bid\s+TEXT\s+PRIMARY KEY\b/i);
	});

	it("mcqs table has name TEXT NOT NULL, question TEXT NOT NULL, created_by TEXT NOT NULL, created_at, and updated_at", () => {
		const mcqsTable = getTableSql(loadMigrationSql(), "mcqs");

		for (const column of ["name", "question", "created_by"]) {
			expect(mcqsTable, `${column} must be TEXT NOT NULL`).toMatch(
				new RegExp(`\\b${column}\\s+TEXT\\s+NOT NULL\\b`, "i"),
			);
		}

		expect(mcqsTable).toMatch(/\bcreated_at\s+DATETIME\b/i);
		expect(mcqsTable).toMatch(/\bupdated_at\s+DATETIME\b/i);
	});

	it("mcqs table does not have a description column", () => {
		const mcqsTable = getTableSql(loadMigrationSql(), "mcqs");
		expect(mcqsTable).not.toMatch(/\bdescription\b/i);
	});

	it("mcq_choices table exists with mcq_id, body, is_correct, and position", () => {
		const choicesTable = getTableSql(loadMigrationSql(), "mcq_choices");

		expect(choicesTable).toMatch(/\bmcq_id\s+TEXT\s+NOT NULL\b/i);
		expect(choicesTable).toMatch(/\bbody\s+TEXT\s+NOT NULL\b/i);
		expect(choicesTable).toMatch(/\bis_correct\s+INTEGER\s+NOT NULL\b/i);
		expect(choicesTable).toMatch(/\bposition\s+INTEGER\s+NOT NULL\b/i);
	});

	it("mcq_choices.is_correct is INTEGER with a 0/1 check", () => {
		const choicesTable = getTableSql(loadMigrationSql(), "mcq_choices");
		expect(choicesTable).toMatch(/\bis_correct\s+INTEGER\s+NOT NULL\b/i);
		expect(choicesTable).toMatch(/CHECK\s*\(\s*is_correct\s+IN\s*\(\s*0\s*,\s*1\s*\)\s*\)/i);
	});

	it("mcq_choices has a unique index that allows only one correct choice per mcq_id", () => {
		const sql = loadMigrationSql();
		expect(sql).toMatch(
			/CREATE UNIQUE INDEX\s+\w+\s+ON\s+mcq_choices\s*\(\s*mcq_id\s*\)\s+WHERE\s+is_correct\s*=\s*1/i,
		);
	});

	it("mcq_attempts table exists with mcq_id, user_id, choice_id, and is_correct", () => {
		const attemptsTable = getTableSql(loadMigrationSql(), "mcq_attempts");

		expect(attemptsTable).toMatch(/\bmcq_id\s+TEXT\s+NOT NULL\b/i);
		expect(attemptsTable).toMatch(/\buser_id\s+TEXT\s+NOT NULL\b/i);
		expect(attemptsTable).toMatch(/\bchoice_id\s+TEXT\s+NOT NULL\b/i);
		expect(attemptsTable).toMatch(/\bis_correct\s+INTEGER\s+NOT NULL\b/i);
	});

	it("mcq_choices and mcq_attempts reference mcqs(id) with ON DELETE CASCADE", () => {
		const choicesTable = getTableSql(loadMigrationSql(), "mcq_choices");
		const attemptsTable = getTableSql(loadMigrationSql(), "mcq_attempts");

		expect(choicesTable).toMatch(
			/FOREIGN KEY\s*\(\s*mcq_id\s*\)\s+REFERENCES\s+mcqs\s*\(\s*id\s*\)\s+ON DELETE CASCADE/i,
		);
		expect(attemptsTable).toMatch(
			/FOREIGN KEY\s*\(\s*mcq_id\s*\)\s+REFERENCES\s+mcqs\s*\(\s*id\s*\)\s+ON DELETE CASCADE/i,
		);
	});
});
