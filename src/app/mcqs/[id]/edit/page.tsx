import Link from "next/link";
import { redirect } from "next/navigation";
import { McqForm } from "@/components/mcqs/mcq-form";
import { buttonVariants } from "@/components/ui/button";
import { requireTeacher } from "@/lib/mcqs/require-teacher";
import { mcqService } from "@/lib/services/mcqs";

export const dynamic = "force-dynamic";

export default async function EditMcqPage({ params }: { params: Promise<{ id: string }> }) {
	await requireTeacher();
	const { id } = await params;
	const mcq = await mcqService.getById(id);
	if (!mcq) {
		redirect("/mcqs");
	}

	return (
		<main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-6 p-6 md:p-10">
			<div className="space-y-1">
				<h1 className="font-heading text-2xl font-medium">Edit question</h1>
				<p className="text-sm text-muted-foreground">Update this multiple-choice question.</p>
			</div>
			<McqForm mcq={mcq} />
			<Link href="/mcqs" className={buttonVariants({ variant: "link" })}>
				Back to question bank
			</Link>
		</main>
	);
}
