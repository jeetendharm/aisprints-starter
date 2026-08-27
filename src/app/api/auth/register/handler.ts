import "server-only";
import { z } from "zod";
import { UniqueConstraintError, userService } from "@/lib/services/users";
import { hashPassword } from "@/lib/password";
import { createSessionCookie } from "@/lib/session";

const registerSchema = z.object({
	firstName: z.string().trim().min(1).max(50),
	lastName: z.string().trim().min(1).max(50),
	username: z
		.string()
		.trim()
		.min(3)
		.max(30)
		.regex(/^[a-zA-Z0-9_]+$/),
	email: z.email(),
	password: z.string().min(8),
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

	const parsed = registerSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: "Validation failed." }, 400);
	}

	const { password, firstName, lastName, username, email } = parsed.data;

	try {
		const passwordHash = await hashPassword(password);
		const user = await userService.create({
			firstName,
			lastName,
			username: username.toLowerCase(),
			email: email.toLowerCase(),
			passwordHash,
		});

		return json(
			{ user, redirectTo: "/mcqs" },
			201,
			{ "Set-Cookie": createSessionCookie(user.id) },
		);
	} catch (error) {
		if (error instanceof UniqueConstraintError) {
			return json({ error: error.message }, 409);
		}
		return json({ error: "Unexpected server error." }, 500);
	}
}
