import { landingRedirect } from "@/lib/auth-guards";
import { getSessionUserId } from "@/lib/current-session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
	const userId = await getSessionUserId();
	redirect(landingRedirect(userId));
}
