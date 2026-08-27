import "server-only";
import { z } from "zod";
import { userService } from "@/lib/services/users";
import { verifyPassword } from "@/lib/password";
import { createSessionCookie } from "@/lib/session";

const loginSchema = z.object({
	username: z.string().trim().min(1),
	password: z.string().min(1),
});

function json(body: unknown, status: number, extraHeaders?: Record<string, string>): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json",
			...extraHeaders,
		},
	});
}

export async function POST(request: Request): Promise<Response> {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: "Invalid request body." }, 400);
	}

	const parsed = loginSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: "Validation failed." }, 400);
	}

	try {
		const record = await userService.getByUsername(parsed.data.username);
		if (!record) {
			return json({ error: "Invalid username or password." }, 401);
		}

		const matches = await verifyPassword(parsed.data.password, record.passwordHash);
		if (!matches) {
			return json({ error: "Invalid username or password." }, 401);
		}

		const { passwordHash: _passwordHash, ...user } = record;
		return json(
			{ user, redirectTo: "/mcqs" },
			200,
			{ "Set-Cookie": createSessionCookie(user.id) },
		);
	} catch {
		return json({ error: "Unexpected server error." }, 500);
	}
}
