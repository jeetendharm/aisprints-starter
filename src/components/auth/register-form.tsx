"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

export function RegisterForm({ ...props }: React.ComponentProps<typeof Card>) {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);

		const formData = new FormData(event.currentTarget);
		const password = String(formData.get("password") ?? "");
		const confirmPassword = String(formData.get("confirmPassword") ?? "");

		if (password !== confirmPassword) {
			setError("Passwords do not match.");
			return;
		}

		setPending(true);

		try {
			const response = await fetch("/api/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					firstName: String(formData.get("firstName") ?? ""),
					lastName: String(formData.get("lastName") ?? ""),
					username: String(formData.get("username") ?? ""),
					email: String(formData.get("email") ?? ""),
					password,
				}),
			});
			const json = (await response.json()) as AuthResponse;

			if (!response.ok) {
				setError(json.error ?? "Unexpected server error.");
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
		<Card {...props}>
			<CardHeader>
				<CardTitle>Create an account</CardTitle>
				<CardDescription>
					Enter your information below to create your account
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit}>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="first-name">First name</FieldLabel>
							<Input
								id="first-name"
								name="firstName"
								type="text"
								autoComplete="given-name"
								placeholder="Ada"
								required
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="last-name">Last name</FieldLabel>
							<Input
								id="last-name"
								name="lastName"
								type="text"
								autoComplete="family-name"
								placeholder="Lovelace"
								required
							/>
						</Field>
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
							<FieldLabel htmlFor="email">Email</FieldLabel>
							<Input
								id="email"
								name="email"
								type="email"
								autoComplete="email"
								placeholder="m@example.com"
								required
							/>
							<FieldDescription>
								We&apos;ll use this to contact you. We will not share your email
								with anyone else.
							</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="password">Password</FieldLabel>
							<Input
								id="password"
								name="password"
								type="password"
								autoComplete="new-password"
								required
							/>
							<FieldDescription>
								Must be at least 8 characters long.
							</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel>
							<Input
								id="confirm-password"
								name="confirmPassword"
								type="password"
								autoComplete="new-password"
								required
							/>
							<FieldDescription>Please confirm your password.</FieldDescription>
						</Field>
						{error ? (
							<Field>
								<FieldError>{error}</FieldError>
							</Field>
						) : null}
						<FieldGroup>
							<Field>
								<Button className="w-full" type="submit" disabled={pending}>
									Create Account
								</Button>
								<FieldDescription className="px-6 text-center">
									Already have an account? <Link href="/login">Sign in</Link>
								</FieldDescription>
							</Field>
						</FieldGroup>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}
