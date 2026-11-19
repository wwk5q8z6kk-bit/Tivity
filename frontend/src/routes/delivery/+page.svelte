<script lang="ts">
	import { ApiError } from '$lib/api/client';
	import { saveSourceNode } from '$lib/api/source-import';
	import { activeNamespace } from '$lib/stores/namespace';
	import { excerptRequest, isExcerpt, type DiscussionExcerpt } from './comment';

	let frame: HTMLIFrameElement;
	let excerpt: DiscussionExcerpt | null = null;
	let busy = false;
	let kind: 'reference' | 'task' = 'reference';
	let title = '';
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
		kind = 'reference';
		title = excerpt.taskTitle;
		destination = $activeNamespace;
		message = '';
	}

	async function save() {
		if (!excerpt || busy || (kind === 'task' && !title.trim())) return;
		busy = true;
		try {
			const payload = excerptRequest(
				excerpt,
				destination,
				kind,
				kind === 'task' ? title.trim() : excerpt.taskTitle
			);
			const identity = [destination, payload.source];
			if (kind === 'task') identity.push(kind);
			await saveSourceNode(payload, identity, token);
			excerpt = null;
			message =
				kind === 'task'
					? 'Follow-up task created in the vault inbox.'
					: 'Reference saved to the vault.';
		} catch (error) {
			if (error instanceof ApiError && error.status === 401) {
				needsToken = true;
				message = 'Enter a vault access token to save this excerpt.';
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
	<section class="rounded border p-4" aria-label="Review discussion excerpt">
		<h2>Save discussion excerpt to {destination ?? 'the default namespace'}?</h2>
		<label
			>Save as
			<select bind:value={kind} disabled={busy}>
				<option value="reference">Evidence reference</option>
				<option value="task">Follow-up task</option>
			</select>
		</label>
		{#if kind === 'task'}
			<label>Follow-up title <input bind:value={title} disabled={busy} /></label>
		{:else}
			<strong>{excerpt.taskTitle}</strong>
		{/if}
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
		<button
			class="underline mr-4"
			disabled={busy || (kind === 'task' && !title.trim())}
			on:click={save}>{kind === 'task' ? 'Create follow-up task' : 'Save reference'}</button
		>
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
