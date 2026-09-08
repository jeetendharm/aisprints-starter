import "server-only";
import { z } from "zod";
import { json, requireApiSession } from "@/lib/mcqs/http";
import { InvalidMcqChoiceError, McqNotFoundError, mcqService } from "@/lib/services/mcqs";

type RouteContext = { params: Promise<{ id: string }> };

const updateBodySchema = z
	.object({
		name: z.string().trim().min(1).max(200),
		question: z.string().trim().min(1).max(2000),
		choices: z
			.array(
				z.object({
					id: z.string().min(1).optional(),
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

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
	const session = await requireApiSession();
	if (session.error) {
		return session.error;
	}

	try {
		const { id } = await context.params;
		const mcq = await mcqService.getById(id);
		if (!mcq) {
			return json({ error: "Question not found." }, 404);
		}
		return json({ mcq }, 200);
	} catch {
		return json({ error: "Unexpected server error." }, 500);
	}
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
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

	const parsed = updateBodySchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: "Validation failed." }, 400);
	}

	try {
		const { id } = await context.params;
		const mcq = await mcqService.update(id, parsed.data);
		return json({ mcq }, 200);
	} catch (error) {
		if (error instanceof McqNotFoundError) {
			return json({ error: error.message }, 404);
		}
		if (error instanceof InvalidMcqChoiceError) {
			return json({ error: error.message }, 400);
		}
		return json({ error: "Unexpected server error." }, 500);
	}
}

export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
	const session = await requireApiSession();
	if (session.error) {
		return session.error;
	}

	try {
		const { id } = await context.params;
		await mcqService.delete(id);
		return new Response(null, { status: 204 });
	} catch (error) {
		if (error instanceof McqNotFoundError) {
			return json({ error: error.message }, 404);
		}
		return json({ error: "Unexpected server error." }, 500);
	}
}
