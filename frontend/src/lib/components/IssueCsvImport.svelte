<script lang="ts">
	import { ApiError } from '$lib/api/client';
	import { saveSourceNode } from '$lib/api/source-import';
	import { parseIssueCsv } from '$lib/tasks/issue-csv';
	import { nodeToTask } from '$lib/api/mappers';
	import { tasksStore } from '$lib/stores/tasks';
	import { activeNamespace } from '$lib/stores/namespace';

	let workspace = '';
	let destination = $activeNamespace ?? 'default';
	let file: File | undefined;
	let preview: ReturnType<typeof parseIssueCsv> | undefined;
	let progress = 0;
	let busy = false;
	let token = '';
	let needsToken = false;
	let message = '';

	function reset() {
		preview = undefined;
		progress = 0;
		message = '';
	}
	async function prepare() {
		if (!file || busy) return;
		reset();
		busy = true;
		try {
			preview = parseIssueCsv(await file.text(), workspace, destination);
		} catch (error) {
			message = String(error);
		} finally {
			busy = false;
		}
	}
	async function apply() {
		if (!preview || busy) return;
		busy = true;
		message = '';
		try {
			while (progress < preview.nodes.length) {
				const payload = preview.nodes[progress];
				const node = await saveSourceNode(payload, [payload.namespace!, payload.source!], token);
				progress++;
				if (!$activeNamespace || $activeNamespace === payload.namespace) {
					const task = nodeToTask(node);
					tasksStore.update((items) => [task, ...items.filter((item) => item.id !== task.id)]);
				}
			}
			message = 'Import complete.';
		} catch (error) {
			needsToken = error instanceof ApiError && error.status === 401;
			message = needsToken ? 'Enter a vault access token to continue.' : String(error);
		} finally {
			busy = false;
		}
	}
</script>

<details class="rounded border border-white/10 p-4">
	<summary>Import issues from Linear or Jira</summary>
	<div class="mt-3 grid gap-3">
		<label
			>Source workspace or Jira site <input
				bind:value={workspace}
				on:input={reset}
				disabled={busy}
			/></label
		>
		<label
			>Vault namespace <input bind:value={destination} on:input={reset} disabled={busy} /></label
		>
		<label
			>Issue CSV <input
				type="file"
				accept=".csv,text/csv"
				disabled={busy}
				on:change={(event) => {
					file = event.currentTarget.files?.[0];
					reset();
				}}
			/></label
		>
		<button
			class="underline justify-self-start"
			disabled={busy || !file || !workspace.trim() || !destination.trim()}
			on:click={prepare}>Preview import</button
		>
		{#if preview}
			<p>
				{preview.nodes.length}
				{preview.provider === 'jira' ? 'Jira' : 'Linear'} issues for {destination}. Unrecognized
				statuses go to Inbox.
			</p>
			<ul>
				{#each preview.nodes.slice(0, 5) as node}<li>
						{node.title} · {node.metadata?.task_status}
					</li>{/each}
			</ul>
			{#if needsToken}<label
					>Vault access token <input
						type="password"
						autocomplete="off"
						bind:value={token}
						disabled={busy}
					/></label
				>{/if}
			<button
				class="underline justify-self-start"
				disabled={busy || progress === preview.nodes.length}
				on:click={apply}>{progress ? 'Resume import' : 'Import issues'}</button
			>
			<p aria-live="polite">{progress} of {preview.nodes.length} accepted</p>
		{/if}
		{#if message}<p role="status">{message}</p>{/if}
	</div>
</details>
