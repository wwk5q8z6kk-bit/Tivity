import { bearerHeaders, fetchJson } from './client';
import type { KnowledgeNode, StoreNodeRequest } from './types';

export async function saveSourceNode(
	payload: StoreNodeRequest,
	identity: (string | null)[],
	token: string
) {
	const bytes = new TextEncoder().encode(JSON.stringify(identity));
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
	const key = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
	return fetchJson<KnowledgeNode>('/api/v1/nodes', {
		method: 'POST',
		headers: { 'Idempotency-Key': key, ...bearerHeaders(token) },
		body: JSON.stringify(payload)
	});
}
