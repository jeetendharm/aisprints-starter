import "server-only";
import { getCloudflareEnv } from "@/lib/cloudflare-env";

export async function getDb(): Promise<D1Database> {
	const env = await getCloudflareEnv();
	if (!env.DB) {
		throw new Error("D1 binding DB is not available");
	}
	return env.DB;
}
