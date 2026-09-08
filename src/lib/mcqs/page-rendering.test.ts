import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sessionGatedPages = [
	"src/app/page.tsx",
	"src/app/login/page.tsx",
	"src/app/register/page.tsx",
	"src/app/mcqs/page.tsx",
	"src/app/mcqs/new/page.tsx",
	"src/app/mcqs/[id]/edit/page.tsx",
	"src/app/mcqs/[id]/preview/page.tsx",
];

describe("session-gated page rendering", () => {
	it("opts session-gated pages out of static prerender so next build does not start workerd", () => {
		for (const file of sessionGatedPages) {
			const source = readFileSync(join(process.cwd(), file), "utf8");
			expect(source, file).toMatch(/export const dynamic = "force-dynamic"/);
		}
	});
});
