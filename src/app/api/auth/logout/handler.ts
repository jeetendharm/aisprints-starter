import "server-only";
import { clearSessionCookie } from "@/lib/session";

export async function POST(_request: Request): Promise<Response> {
	return new Response(JSON.stringify({ redirectTo: "/login" }), {
		status: 200,
		headers: {
			"Content-Type": "application/json",
			"Set-Cookie": clearSessionCookie(),
		},
	});
}
