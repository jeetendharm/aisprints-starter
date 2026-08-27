import "server-only";

/** PBKDF2-SHA-256 iteration count. High enough for interactive login on Workers. */
export const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;
const HASH_PREFIX = "pbkdf2";

function encodeBytes(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString("base64");
}

function decodeBytes(value: string): Uint8Array | null {
	try {
		return new Uint8Array(Buffer.from(value, "base64"));
	} catch {
		return null;
	}
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
	if (left.length !== right.length) {
		return false;
	}

	let diff = 0;
	for (let i = 0; i < left.length; i += 1) {
		diff |= left[i]! ^ right[i]!;
	}
	return diff === 0;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(password),
		"PBKDF2",
		false,
		["deriveBits"],
	);

	const bits = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			hash: "SHA-256",
			salt,
			iterations,
		},
		keyMaterial,
		KEY_BITS,
	);

	return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const hash = await deriveKey(password, salt, PBKDF2_ITERATIONS);
	return `${HASH_PREFIX}$${PBKDF2_ITERATIONS}$${encodeBytes(salt)}$${encodeBytes(hash)}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
	const parts = storedHash.split("$");
	if (parts.length !== 4 || parts[0] !== HASH_PREFIX) {
		return false;
	}

	const iterations = Number(parts[1]);
	if (!Number.isInteger(iterations) || iterations <= 0) {
		return false;
	}

	const salt = decodeBytes(parts[2] ?? "");
	const expected = decodeBytes(parts[3] ?? "");
	if (!salt || !expected || salt.length === 0 || expected.length === 0) {
		return false;
	}

	const actual = await deriveKey(password, salt, iterations);
	return timingSafeEqual(actual, expected);
}
