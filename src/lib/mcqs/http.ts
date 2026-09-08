import "server-only";
import { getSessionUserId } from "@/lib/current-session";

export function json(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

export async function requireApiSession(): Promise<
	{ userId: string; error?: undefined } | { userId?: undefined; error: Response }
> {
	const userId = await getSessionUserId();
	if (!userId) {
		return { error: json({ error: "Authentication required." }, 401) };
	}
	return { userId };
}
