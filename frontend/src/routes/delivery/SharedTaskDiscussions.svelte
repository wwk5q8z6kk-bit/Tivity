<script lang="ts">
	import { listNodes } from '$lib/api/nodes';
	import { ApiError } from '$lib/api/client';
	import type { KnowledgeNode } from '$lib/api/types';
	import CommentsPanel from '$lib/components/CommentsPanel.svelte';

	export let initialNamespace: string;
	let namespace = initialNamespace;
	let token = '';
	let connected = false;
	let busy = false;
	let error = '';
	let tasks: KnowledgeNode[] = [];
	let selected = '';
	let offset = 0;
	const pageSize = 30;

	async function load(start = 0) {
		if (busy || !namespace.trim()) return;
		busy = true;
		error = '';
		try {
			tasks = await listNodes(
				{ kind: 'task', namespace: namespace.trim(), offset: start, limit: pageSize + 1 },
				token.trim()
			);
			offset = start;
			selected =
				tasks.slice(0, pageSize).find((task) => task.id === selected)?.id ?? tasks[0]?.id ?? '';
			connected = true;
		} catch (err) {
			connected = false;
			selected = '';
			tasks = [];
			error =
				err instanceof ApiError && err.status === 401
					? 'Enter a valid vault access token.'
					: err instanceof ApiError && err.status === 403
						? 'Your token does not have access to this namespace.'
						: 'Could not load shared tasks. Check your vault connection and try again.';
		} finally {
			busy = false;
		}
	}

	function disconnect() {
		connected = false;
		token = '';
		tasks = [];
		selected = '';
		error = '';
	}
</script>

<section class="mb-3 grid gap-3 rounded border p-4" aria-label="Shared task discussions">
	{#if !connected}
		<form class="flex flex-wrap items-end gap-3" on:submit|preventDefault={() => load()}>
			<label>Vault namespace <input required bind:value={namespace} disabled={busy} /></label>
			<label
				>Vault access token <input
					type="password"
					autocomplete="off"
					bind:value={token}
					disabled={busy}
				/></label
			>
			<button class="underline" disabled={busy || !namespace.trim()}
				>{busy ? 'Loading…' : 'Load tasks'}</button
			>
		</form>
	{:else}
		<div class="flex flex-wrap items-center gap-4">
			<strong>{namespace}</strong>
			<button class="underline" disabled={busy} on:click={() => load(offset)}>Refresh tasks</button>
			<button class="underline" disabled={busy} on:click={disconnect}>Disconnect</button>
		</div>
		{#if tasks.length}
			<label
				>Shared task
				<select bind:value={selected} disabled={busy}>
					{#each tasks.slice(0, pageSize) as task (task.id)}
						<option value={task.id}>{task.title}</option>
					{/each}
				</select>
			</label>
			{#key selected}
				<CommentsPanel
					nodeId={selected}
					nodeTitle={tasks.find((task) => task.id === selected)?.title}
					token={token.trim()}
				/>
			{/key}
		{:else}
			<p>No shared tasks on this page.</p>
		{/if}
		{#if offset || tasks.length > pageSize}
			<nav class="flex gap-3" aria-label="Shared task pages">
				<button disabled={busy || !offset} on:click={() => load(offset - pageSize)}>Previous</button
				>
				<button disabled={busy || tasks.length <= pageSize} on:click={() => load(offset + pageSize)}
					>Next</button
				>
			</nav>
		{/if}
	{/if}
	{#if error}<p role="alert">{error}</p>{/if}
</section>
