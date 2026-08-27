import "server-only";
import { cookies } from "next/headers";
import { getCloudflareEnv } from "@/lib/cloudflare-env";
import { readSessionUserId, SESSION_COOKIE_NAME } from "@/lib/session";

export async function getSessionUserId(): Promise<string | null> {
	await getCloudflareEnv();
	const cookieStore = await cookies();
	const value = cookieStore.get(SESSION_COOKIE_NAME)?.value;
	return readSessionUserId(value ? `${SESSION_COOKIE_NAME}=${value}` : null);
}
