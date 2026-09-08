import Link from "next/link";
import { McqForm } from "@/components/mcqs/mcq-form";
import { buttonVariants } from "@/components/ui/button";
import { requireTeacher } from "@/lib/mcqs/require-teacher";

export const dynamic = "force-dynamic";

export default async function NewMcqPage() {
	await requireTeacher();

	return (
		<main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-6 p-6 md:p-10">
			<div className="space-y-1">
				<h1 className="font-heading text-2xl font-medium">Create question</h1>
				<p className="text-sm text-muted-foreground">Add a multiple-choice question to the shared bank.</p>
			</div>
			<McqForm />
			<Link href="/mcqs" className={buttonVariants({ variant: "link" })}>
				Back to question bank
			</Link>
		</main>
	);
}
