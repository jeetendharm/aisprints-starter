import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getCloudflareEnv() {
	const { env } = await getCloudflareContext({ async: true });
	// OpenNext loads .dev.vars onto Cloudflare env, not process.env.
	if (!process.env.SESSION_SECRET && env.SESSION_SECRET) {
		process.env.SESSION_SECRET = env.SESSION_SECRET;
	}
	return env;
}
