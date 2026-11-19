<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { ApiError } from '$lib/api/client';
	import { saveSourceNode } from '$lib/api/source-import';
	import { deliveryTaskNode } from '../../../../scripts/delivery-task-node.mjs';
	import type { TaskShare } from './task-share';

	export let request: TaskShare;
	export let initialNamespace: string;
	let namespaceField: HTMLInputElement;
	onMount(() => namespaceField.focus());
	const dispatch = createEventDispatcher<{ close: string }>();
	let namespace = initialNamespace;
	let token = '';
	let error = '';
	let busy = false;
	async function save() {
		if (busy || !namespace.trim()) return;
		busy = true;
		error = '';
		try {
			const node = deliveryTaskNode(
				request.task,
				request.task.projectId,
				request.projectName,
				namespace.trim()
			);
			await saveSourceNode(node, [node.namespace, node.source], token.trim());
			dispatch('close', 'Task shared with ' + node.namespace + '.');
		} catch (err) {
			error =
				err instanceof ApiError && err.status === 409
					? 'A previous share has different task details. Review the existing vault task.'
					: err instanceof ApiError && err.status === 401
						? 'Enter a valid vault access token.'
						: err instanceof ApiError && err.status === 403
							? 'Your token cannot share tasks in this namespace.'
							: 'Could not share this task. Check your vault connection and try again.';
		} finally {
			busy = false;
		}
	}
</script>

<form
	class="grid gap-3 rounded border p-4"
	aria-label="Review task for sharing"
	on:submit|preventDefault={save}
>
	<h2>Share “{request.task.title}” with the vault?</h2>
	<p>{request.projectName} · {request.task.status}</p>
	<label
		>Vault namespace <input
			bind:this={namespaceField}
			bind:value={namespace}
			required
			disabled={busy}
		/></label
	>
	<label
		>Vault access token (if required) <input
			type="password"
			bind:value={token}
			autocomplete="off"
			disabled={busy}
		/></label
	>
	<div class="flex gap-4">
		<button class="underline" disabled={busy || !namespace.trim()}
			>{busy ? 'Sharing…' : 'Share task'}</button
		>
		<button type="button" disabled={busy} on:click={() => dispatch('close', '')}>Cancel</button>
	</div>
	{#if error}<p role="alert">{error}</p>{/if}
</form>
