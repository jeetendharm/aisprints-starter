import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const wranglerConfigPath = join(process.cwd(), "wrangler.jsonc");

function parseJsonc(text: string): unknown {
	const withoutComments = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
	return JSON.parse(withoutComments) as unknown;
}

describe("D1 binding", () => {
	it("wrangler.jsonc binds a D1 database as DB", () => {
		expect(existsSync(wranglerConfigPath), "wrangler.jsonc must exist").toBe(true);

		const config = parseJsonc(readFileSync(wranglerConfigPath, "utf8")) as {
			d1_databases?: Array<{
				binding?: string;
				database_name?: string;
				database_id?: string;
			}>;
		};

		expect(config.d1_databases, "d1_databases must be present").toEqual(expect.any(Array));

		const dbBinding = config.d1_databases?.find((entry) => entry.binding === "DB");
		expect(dbBinding, "a D1 binding named DB must exist").toBeDefined();
		expect(dbBinding?.database_name).toEqual(expect.any(String));
		expect(dbBinding?.database_name?.length).toBeGreaterThan(0);
		expect(dbBinding?.database_id).toEqual(expect.any(String));
		expect(dbBinding?.database_id?.length).toBeGreaterThan(0);
	});
});
