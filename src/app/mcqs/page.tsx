import Link from "next/link";
import { LogoutButton } from "@/components/auth/logout-button";
import { McqTable } from "@/components/mcqs/mcq-table";
import { buttonVariants } from "@/components/ui/button";
import { requireTeacher } from "@/lib/mcqs/require-teacher";
import { mcqService } from "@/lib/services/mcqs";

export const dynamic = "force-dynamic";

export default async function McqsPage() {
	const user = await requireTeacher();
	const mcqs = await mcqService.list();

	return (
		<main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-6 p-6 md:p-10">
			<div className="flex items-start justify-between gap-4">
				<div className="space-y-1">
					<h1 className="font-heading text-2xl font-medium">Question bank</h1>
					<p className="text-sm text-muted-foreground">
						Shared multiple-choice questions for the QuizMaker test bank.
					</p>
				</div>
				<LogoutButton />
			</div>
			<div className="flex items-center justify-between gap-4">
				<p className="text-sm">
					Signed in as {user.firstName} ({user.username})
				</p>
				<Link href="/mcqs/new" className={buttonVariants()}>
					Create question
				</Link>
			</div>
			<McqTable mcqs={mcqs} />
		</main>
	);
}
