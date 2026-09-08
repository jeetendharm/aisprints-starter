import "server-only";
import { z } from "zod";
import { json, requireApiSession } from "@/lib/mcqs/http";
import { mcqService } from "@/lib/services/mcqs";

const createBodySchema = z
	.object({
		name: z.string().trim().min(1).max(200),
		question: z.string().trim().min(1).max(2000),
		choices: z
			.array(
				z.object({
					body: z.string().trim().min(1).max(500),
					isCorrect: z.boolean(),
				}),
			)
			.min(2)
			.max(6),
	})
	.refine((value) => value.choices.filter((choice) => choice.isCorrect).length === 1, {
		message: "Exactly one choice must be correct",
		path: ["choices"],
	});

export async function GET(): Promise<Response> {
	const session = await requireApiSession();
	if (session.error) {
		return session.error;
	}

	try {
		const mcqs = await mcqService.list();
		return json({ mcqs }, 200);
	} catch {
		return json({ error: "Unexpected server error." }, 500);
	}
}

export async function POST(request: Request): Promise<Response> {
	const session = await requireApiSession();
	if (session.error) {
		return session.error;
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: "Invalid request body." }, 400);
	}

	const parsed = createBodySchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: "Validation failed." }, 400);
	}

	try {
		const mcq = await mcqService.create({
			...parsed.data,
			createdBy: session.userId,
		});
		return json({ mcq }, 201);
	} catch {
		return json({ error: "Unexpected server error." }, 500);
	}
}
