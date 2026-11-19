<script lang="ts">
	import { ApiError, fetchJson } from '$lib/api/client';
	import { activeNamespace } from '$lib/stores/namespace';
	import { excerptRequest, isExcerpt, type DiscussionExcerpt } from './comment';

	let frame: HTMLIFrameElement;
	let excerpt: DiscussionExcerpt | null = null;
	let busy = false;
	let message = '';
	let needsToken = false;
	let token = '';
	let destination: string | null = null;

	function receive(event: MessageEvent) {
		if (
			busy ||
			event.origin !== location.origin ||
			event.source !== frame?.contentWindow ||
			!isExcerpt(event.data)
		)
			return;
		excerpt = event.data;
		destination = $activeNamespace;
		message = '';
	}

	async function save() {
		if (!excerpt || busy) return;
		busy = true;
		try {
			const payload = excerptRequest(excerpt, destination);
			const bytes = new TextEncoder().encode(JSON.stringify([destination, payload.source]));
			const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
			const key = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
			await fetchJson('/api/v1/nodes', {
				method: 'POST',
				headers: { 'Idempotency-Key': key, ...(token ? { Authorization: 'Bearer ' + token } : {}) },
				body: JSON.stringify(payload)
			});
			excerpt = null;
			message = 'Reference saved to the vault.';
		} catch (error) {
			if (error instanceof ApiError && error.status === 401) {
				needsToken = true;
				message = 'Enter a vault access token to save this reference.';
				return;
			}
			message = error instanceof Error ? error.message : 'Could not save the reference.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:window on:message={receive} />
{#if excerpt}
	<section class="rounded border p-4" aria-label="Review vault reference">
		<h2>Save discussion excerpt to {destination ?? 'the default namespace'}?</h2>
		<strong>{excerpt.taskTitle}</strong>
		<p>{excerpt.author}</p>
		<blockquote class="whitespace-pre-wrap">{excerpt.body}</blockquote>
		{#if needsToken}
			<label
				>Vault access token <input
					type="password"
					autocomplete="off"
					bind:value={token}
					disabled={busy}
				/></label
			>
		{/if}
		<button class="underline mr-4" disabled={busy} on:click={save}>Save reference</button>
		<button
			class="underline"
			disabled={busy}
			on:click={() => {
				excerpt = null;
				message = '';
			}}>Cancel</button
		>
	</section>
{/if}
{#if message}<p role="status">{message}</p>{/if}
<iframe
	title="Tivity delivery workspace"
	bind:this={frame}
	src="/delivery-ui/index.html"
	class="w-full rounded"
	style="height: max(70vh, 32rem);"
></iframe>
