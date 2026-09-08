import { RegisterForm } from "@/components/auth/register-form";
import { redirectIfAuthenticated } from "@/lib/auth-guards";
import { getSessionUserId } from "@/lib/current-session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
	const userId = await getSessionUserId();
	const destination = redirectIfAuthenticated(userId);
	if (destination) {
		redirect(destination);
	}

	return (
		<div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
			<div className="w-full max-w-sm">
				<RegisterForm />
			</div>
		</div>
	);
}
