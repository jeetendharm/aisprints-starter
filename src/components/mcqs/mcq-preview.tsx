"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { Mcq } from "@/components/mcqs/types";

export function McqPreview({ mcq }: { mcq: Mcq }) {
	const router = useRouter();
	const [selected, setSelected] = useState("");
	const [result, setResult] = useState<boolean | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!selected) {
			return;
		}

		setPending(true);
		setError(null);
		try {
			const response = await fetch(`/api/mcqs/${mcq.id}/attempts`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ choiceId: selected }),
			});
			const json = (await response.json()) as { attempt?: { isCorrect: boolean }; error?: string };
			if (!response.ok || !json.attempt) {
				setError(json.error ?? "Unexpected server error.");
				return;
			}
			setResult(json.attempt.isCorrect);
		} catch {
			setError("Unexpected server error.");
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<h1 className="font-heading text-2xl font-medium">{mcq.name}</h1>
				<p className="text-sm">{mcq.question}</p>
			</div>

			<form onSubmit={handleSubmit} className="space-y-4">
				<RadioGroup value={selected} onValueChange={setSelected}>
					{mcq.choices.map((choice) => (
						<label key={choice.id} className="flex items-center gap-2 text-sm">
							<RadioGroupItem value={choice.id} />
							{choice.body}
						</label>
					))}
				</RadioGroup>

				<div className="flex flex-wrap gap-2">
					<Button type="submit" disabled={pending}>
						Submit answer
					</Button>
					<Button type="button" variant="outline" onClick={() => router.push("/mcqs")}>
						Back to question bank
					</Button>
				</div>
			</form>

			{result !== null ? (
				<Badge variant={result ? "default" : "secondary"}>{result ? "Correct" : "Incorrect"}</Badge>
			) : null}
			{error ? (
				<p role="alert" className="text-sm text-destructive">
					{error}
				</p>
			) : null}
		</div>
	);
}
