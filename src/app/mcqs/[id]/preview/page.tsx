import { redirect } from "next/navigation";
import { McqPreview } from "@/components/mcqs/mcq-preview";
import { requireTeacher } from "@/lib/mcqs/require-teacher";
import { mcqService } from "@/lib/services/mcqs";

export default async function PreviewMcqPage({ params }: { params: Promise<{ id: string }> }) {
	await requireTeacher();
	const { id } = await params;
	const mcq = await mcqService.getById(id);
	if (!mcq) {
		redirect("/mcqs");
	}

	return (
		<main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-6 p-6 md:p-10">
			<McqPreview mcq={mcq} />
		</main>
	);
}
