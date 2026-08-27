"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type AuthResponse = {
	error?: string;
	redirectTo?: string;
};

export function LoginForm({
	className,
	...props
}: React.ComponentProps<"div">) {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);

		const formData = new FormData(event.currentTarget);
		setPending(true);

		try {
			const response = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username: String(formData.get("username") ?? ""),
					password: String(formData.get("password") ?? ""),
				}),
			});
			const json = (await response.json()) as AuthResponse;

			if (!response.ok) {
				setError(json.error ?? "Invalid username or password.");
				return;
			}

			router.push(json.redirectTo ?? "/mcqs");
		} catch {
			setError("Unexpected server error.");
		} finally {
			setPending(false);
		}
	}

	return (
		<div className={cn("flex flex-col gap-6", className)} {...props}>
			<Card>
				<CardHeader>
					<CardTitle>Login to your account</CardTitle>
					<CardDescription>
						Enter your username and password to log in
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit}>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="username">Username</FieldLabel>
								<Input
									id="username"
									name="username"
									type="text"
									autoComplete="username"
									placeholder="alovelace"
									required
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="password">Password</FieldLabel>
								<Input
									id="password"
									name="password"
									type="password"
									autoComplete="current-password"
									required
								/>
							</Field>
							{error ? (
								<Field>
									<FieldError>{error}</FieldError>
								</Field>
							) : null}
							<Field>
								<Button className="w-full" type="submit" disabled={pending}>
									Login
								</Button>
								<FieldDescription className="text-center">
									Don&apos;t have an account? <Link href="/register">Sign up</Link>
								</FieldDescription>
							</Field>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
