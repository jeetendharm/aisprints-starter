import "server-only";
import { z } from "zod";
import { json, requireApiSession } from "@/lib/mcqs/http";
import { attemptService } from "@/lib/services/attempts";
import { mcqService } from "@/lib/services/mcqs";

type RouteContext = { params: Promise<{ id: string }> };

const createAttemptBodySchema = z.object({
	choiceId: z.string().min(1),
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

		const attempts = await attemptService.listByMcqAndUser(id, session.userId);
		return json({ attempts }, 200);
	} catch {
		return json({ error: "Unexpected server error." }, 500);
	}
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
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

	const parsed = createAttemptBodySchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: "Validation failed." }, 400);
	}

	try {
		const { id } = await context.params;
		const mcq = await mcqService.getById(id);
		if (!mcq) {
			return json({ error: "Question not found." }, 404);
		}

		const choice = mcq.choices.find((item) => item.id === parsed.data.choiceId);
		if (!choice) {
			return json({ error: "Choice does not belong to this question." }, 400);
		}

		const attempt = await attemptService.create({
			mcqId: id,
			userId: session.userId,
			choiceId: choice.id,
			isCorrect: choice.isCorrect,
		});
		return json({ attempt }, 201);
	} catch {
		return json({ error: "Unexpected server error." }, 500);
	}
}
