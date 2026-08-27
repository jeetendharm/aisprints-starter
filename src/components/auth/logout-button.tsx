"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type AuthResponse = {
	redirectTo?: string;
};

export function LogoutButton() {
	const router = useRouter();
	const [pending, setPending] = useState(false);

	async function handleClick() {
		setPending(true);
		try {
			const response = await fetch("/api/auth/logout", { method: "POST" });
			const json = (await response.json()) as AuthResponse;
			router.push(json.redirectTo ?? "/login");
		} catch {
			router.push("/login");
		} finally {
			setPending(false);
		}
	}

	return (
		<Button type="button" variant="outline" onClick={handleClick} disabled={pending}>
			Log out
		</Button>
	);
}
