import { landingRedirect } from "@/lib/auth-guards";
import { getSessionUserId } from "@/lib/current-session";
import { redirect } from "next/navigation";

export default async function Home() {
	const userId = await getSessionUserId();
	redirect(landingRedirect(userId));
}
