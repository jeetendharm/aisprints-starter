import { requireSessionRedirect } from "@/lib/auth-guards";
import { getSessionUserId } from "@/lib/current-session";
import { userService, type PublicUser } from "@/lib/services/users";
import { redirect } from "next/navigation";

export async function requireTeacher(): Promise<PublicUser> {
	const userId = await getSessionUserId();
	const destination = requireSessionRedirect(userId);
	if (destination) {
		redirect(destination);
	}

	const user = userId ? await userService.getById(userId) : null;
	if (!user) {
		redirect("/login");
	}
	return user;
}
