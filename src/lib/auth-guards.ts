export function requireSessionRedirect(userId: string | null | undefined): "/login" | null {
	return userId ? null : "/login";
}

export function redirectIfAuthenticated(userId: string | null | undefined): "/mcqs" | null {
	return userId ? "/mcqs" : null;
}

export function landingRedirect(userId: string | null | undefined): "/login" | "/mcqs" {
	return userId ? "/mcqs" : "/login";
}
