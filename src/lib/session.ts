import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "qm_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

type SessionPayload = {
	userId: string;
	exp: number;
};

type CookieOptions = {
	nowMs?: number;
	maxAgeSeconds?: number;
	secret?: string;
	secure?: boolean;
};

function getSessionSecret(override?: string): string {
	const secret = override ?? process.env.SESSION_SECRET;
	if (!secret) {
		throw new Error("SESSION_SECRET is not configured");
	}
	return secret;
}

function encodePayload(payload: SessionPayload): string {
	return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function sign(encodedPayload: string, secret: string): string {
	return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function signaturesEqual(left: string, right: string): boolean {
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);
	if (leftBuffer.length !== rightBuffer.length) {
		return false;
	}
	return timingSafeEqual(leftBuffer, rightBuffer);
}

function cookieAttributes(maxAgeSeconds: number, secure: boolean): string {
	const parts = ["Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSeconds}`];
	if (secure) {
		parts.push("Secure");
	}
	return parts.join("; ");
}

function shouldUseSecureCookie(override?: boolean): boolean {
	if (override !== undefined) {
		return override;
	}
	return process.env.NODE_ENV === "production";
}

export function createSessionCookie(userId: string, options: CookieOptions = {}): string {
	const nowMs = options.nowMs ?? Date.now();
	const maxAgeSeconds = options.maxAgeSeconds ?? SESSION_MAX_AGE_SECONDS;
	const secret = getSessionSecret(options.secret);
	const payload: SessionPayload = {
		userId,
		exp: Math.floor(nowMs / 1000) + maxAgeSeconds,
	};
	const encodedPayload = encodePayload(payload);
	const value = `${encodedPayload}.${sign(encodedPayload, secret)}`;
	return `${SESSION_COOKIE_NAME}=${value}; ${cookieAttributes(maxAgeSeconds, shouldUseSecureCookie(options.secure))}`;
}

export function readSessionUserId(
	cookieHeader: string | null | undefined,
	options: { nowMs?: number; secret?: string } = {},
): string | null {
	if (!cookieHeader) {
		return null;
	}

	const cookies = cookieHeader.split(";").map((part) => part.trim());
	const sessionCookie = cookies.find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));
	if (!sessionCookie) {
		return null;
	}

	const value = sessionCookie.slice(`${SESSION_COOKIE_NAME}=`.length);
	const separator = value.lastIndexOf(".");
	if (separator <= 0) {
		return null;
	}

	const encodedPayload = value.slice(0, separator);
	const signature = value.slice(separator + 1);
	const expected = sign(encodedPayload, getSessionSecret(options.secret));
	if (!signaturesEqual(signature, expected)) {
		return null;
	}

	try {
		const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as SessionPayload;
		const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
		if (!payload.userId || typeof payload.exp !== "number" || payload.exp <= nowSeconds) {
			return null;
		}
		return payload.userId;
	} catch {
		return null;
	}
}

export function clearSessionCookie(options: { secure?: boolean } = {}): string {
	return `${SESSION_COOKIE_NAME}=; ${cookieAttributes(0, shouldUseSecureCookie(options.secure))}`;
}
