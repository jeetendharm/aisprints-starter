import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LogoutButton } from "@/components/auth/logout-button";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push }),
}));

describe("LogoutButton", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	it("POSTs /api/auth/logout and navigates to /login", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ redirectTo: "/login" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
		render(<LogoutButton />);

		await user.click(screen.getByRole("button", { name: /log out/i }));

		expect(fetch).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" }));
		expect(push).toHaveBeenCalledWith("/login");
	});
});
