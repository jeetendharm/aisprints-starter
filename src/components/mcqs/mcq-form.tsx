"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { Mcq } from "@/components/mcqs/types";

type DraftChoice = {
	key: string;
	id?: string;
	body: string;
};

function newChoice(): DraftChoice {
	return { key: crypto.randomUUID(), body: "" };
}

export function McqForm({ mcq }: { mcq?: Mcq }) {
	const router = useRouter();
	const [name, setName] = useState(mcq?.name ?? "");
	const [question, setQuestion] = useState(mcq?.question ?? "");
	const [choices, setChoices] = useState<DraftChoice[]>(
		mcq
			? mcq.choices.map((choice) => ({ key: choice.id, id: choice.id, body: choice.body }))
			: [newChoice(), newChoice()],
	);
	const [correctKey, setCorrectKey] = useState<string>(
		mcq?.choices.find((choice) => choice.isCorrect)?.id ?? "",
	);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	function addChoice() {
		if (choices.length >= 6) {
			return;
		}
		setChoices((current) => [...current, newChoice()]);
	}

	function removeChoice(key: string) {
		if (choices.length <= 2) {
			return;
		}
		setChoices((current) => current.filter((choice) => choice.key !== key));
		if (correctKey === key) {
			setCorrectKey("");
		}
	}

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);

		const trimmedName = name.trim();
		const trimmedQuestion = question.trim();
		const trimmedChoices = choices.map((choice) => ({
			...choice,
			body: choice.body.trim(),
		}));

		if (!trimmedName || !trimmedQuestion || trimmedChoices.some((choice) => !choice.body) || !correctKey) {
			setError("Enter a name, question, two to six choices, and mark one correct answer.");
			return;
		}

		setPending(true);
		try {
			const payload = {
				name: trimmedName,
				question: trimmedQuestion,
				choices: trimmedChoices.map((choice) => ({
					...(choice.id ? { id: choice.id } : {}),
					body: choice.body,
					isCorrect: choice.key === correctKey,
				})),
			};
			const response = await fetch(mcq ? `/api/mcqs/${mcq.id}` : "/api/mcqs", {
				method: mcq ? "PUT" : "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			const json = (await response.json()) as { error?: string };
			if (!response.ok) {
				setError(json.error ?? "Unexpected server error.");
				return;
			}
			router.push("/mcqs");
		} catch {
			setError("Unexpected server error.");
		} finally {
			setPending(false);
		}
	}

	return (
		<form onSubmit={handleSubmit} className="space-y-6">
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor="mcq-name">Name</FieldLabel>
					<Input
						id="mcq-name"
						name="name"
						value={name}
						maxLength={200}
						onChange={(event) => setName(event.target.value)}
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="mcq-question">Question</FieldLabel>
					<Textarea
						id="mcq-question"
						name="question"
						value={question}
						maxLength={2000}
						onChange={(event) => setQuestion(event.target.value)}
					/>
				</Field>
				<Field>
					<FieldLabel>Choices</FieldLabel>
					<RadioGroup value={correctKey} onValueChange={setCorrectKey} className="gap-3">
						{choices.map((choice, index) => (
							<div key={choice.key} className="flex items-start gap-3">
								<div className="flex flex-1 flex-col gap-1.5">
									<label htmlFor={`choice-${choice.key}`} className="text-sm font-medium">
										Choice {index + 1}
									</label>
									<Input
										id={`choice-${choice.key}`}
										value={choice.body}
										maxLength={500}
										onChange={(event) => {
											const body = event.target.value;
											setChoices((current) =>
												current.map((item) => (item.key === choice.key ? { ...item, body } : item)),
											);
										}}
									/>
								</div>
								<label className="mt-7 flex items-center gap-2 text-sm">
									<RadioGroupItem
										value={choice.key}
										aria-label={`Choice ${index + 1} is correct`}
									/>
									<span className="sr-only">Choice {index + 1} is correct</span>
								</label>
								<Button
									type="button"
									variant="outline"
									className="mt-7"
									disabled={choices.length <= 2}
									onClick={() => removeChoice(choice.key)}
								>
									Remove choice
								</Button>
							</div>
						))}
					</RadioGroup>
				</Field>
			</FieldGroup>

			<div className="flex flex-wrap gap-2">
				<Button type="button" variant="outline" disabled={choices.length >= 6} onClick={addChoice}>
					Add choice
				</Button>
				<Button type="submit" disabled={pending}>
					Save
				</Button>
				<Button type="button" variant="outline" onClick={() => router.push("/mcqs")}>
					Cancel
				</Button>
			</div>

			{error ? <FieldError role="alert">{error}</FieldError> : null}
		</form>
	);
}
