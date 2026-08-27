import { LogoutButton } from "@/components/auth/logout-button";
import { requireSessionRedirect } from "@/lib/auth-guards";
import { getSessionUserId } from "@/lib/current-session";
import { userService } from "@/lib/services/users";
import { redirect } from "next/navigation";

export default async function McqsPage() {
	const userId = await getSessionUserId();
	const destination = requireSessionRedirect(userId);
	if (destination) {
		redirect(destination);
	}

	const user = userId ? await userService.getById(userId) : null;
	if (!user) {
		redirect("/login");
	}

	return (
		<main className="mx-auto flex min-h-svh w-full max-w-lg flex-col gap-6 p-6 md:p-10">
			<div className="flex items-start justify-between gap-4">
				<div className="space-y-1">
					<h1 className="font-heading text-2xl font-medium">Question bank</h1>
					<p className="text-sm text-muted-foreground">
						This page is a placeholder for the MCQ test bank.
					</p>
				</div>
				<LogoutButton />
			</div>
			<p className="text-sm">
				Signed in as {user.firstName} ({user.username})
			</p>
		</main>
	);
}
