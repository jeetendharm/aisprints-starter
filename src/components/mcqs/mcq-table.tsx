"use client";

import { useState } from "react";
import { EllipsisVertical } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { McqListItem } from "@/components/mcqs/types";

export function McqTable({ mcqs }: { mcqs: McqListItem[] }) {
	const router = useRouter();
	const [pendingDelete, setPendingDelete] = useState<McqListItem | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [deleting, setDeleting] = useState(false);

	async function confirmDelete() {
		if (!pendingDelete) {
			return;
		}

		setDeleting(true);
		setError(null);
		try {
			const response = await fetch(`/api/mcqs/${pendingDelete.id}`, { method: "DELETE" });
			if (!response.ok) {
				const json = (await response.json()) as { error?: string };
				setError(json.error ?? "Unexpected server error.");
				return;
			}
			setPendingDelete(null);
			router.refresh();
		} catch {
			setError("Unexpected server error.");
		} finally {
			setDeleting(false);
		}
	}

	return (
		<>
			{mcqs.length === 0 ? (
				<p className="text-sm text-muted-foreground">No questions yet.</p>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Question</TableHead>
							<TableHead className="w-16">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{mcqs.map((mcq) => (
							<TableRow key={mcq.id}>
								<TableCell className="whitespace-normal font-medium">{mcq.name}</TableCell>
								<TableCell className="whitespace-normal">{mcq.question}</TableCell>
								<TableCell>
									<DropdownMenu modal={false}>
										<DropdownMenuTrigger
											aria-label={`Actions for ${mcq.name}`}
											className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-muted"
										>
											<EllipsisVertical />
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem onClick={() => router.push(`/mcqs/${mcq.id}/edit`)}>
												Edit
											</DropdownMenuItem>
											<DropdownMenuItem onClick={() => router.push(`/mcqs/${mcq.id}/preview`)}>
												Preview
											</DropdownMenuItem>
											<DropdownMenuItem
												variant="destructive"
												onClick={() => {
													setError(null);
													setPendingDelete(mcq);
												}}
											>
												Delete
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}

			<Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete question?</DialogTitle>
						<DialogDescription>
							This cannot be undone. The question, its choices, and its attempts will be deleted.
						</DialogDescription>
					</DialogHeader>
					{error ? (
						<p role="alert" className="text-sm text-destructive">
							{error}
						</p>
					) : null}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setPendingDelete(null)}>
							Cancel
						</Button>
						<Button type="button" variant="destructive" disabled={deleting} onClick={confirmDelete}>
							Delete
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
