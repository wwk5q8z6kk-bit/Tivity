<script lang="ts">
	import { page } from '$app/stores';
	import { FolderOpen, LayoutDashboard, PanelsTopLeft, Send } from '@lucide/svelte';
	import { sendChatMessage, type ChatSource } from '$lib/api/chat';
	import { describeChatFailure } from '$lib/chat/errors';
	import { sourceHref } from '$lib/chat/citations';
	import LibraryWorkspaceBrowser from '$lib/components/LibraryWorkspaceBrowser.svelte';
	import NotesCanvasView from '$lib/components/NotesCanvasView.svelte';
	import type { KnowledgeNode } from '$lib/api/types';
	import type { WorkspaceDocumentRead } from '$lib/api/workspaces';
	import Delivery from '../delivery/+page.svelte';

	export let namespace: string | undefined;
	export let token: string;
	const views = [
		{ id: 'files', title: 'Files', icon: FolderOpen },
		{ id: 'projects', title: 'Projects', icon: LayoutDashboard },
		{ id: 'canvas', title: 'Canvas', icon: PanelsTopLeft }
	];
	$: requested = $page.url.searchParams.get('view');
	$: view = views.some((v) => v.id === requested) ? requested : 'files';
	let visited = new Set<string>();
	$: if (view && !visited.has(view)) visited = new Set([...visited, view]);
	let document: WorkspaceDocumentRead | null = null;
	let attachment: WorkspaceDocumentRead | null = null;
	type CanvasRef = Pick<KnowledgeNode, 'id' | 'title' | 'namespace'>;
	let selectedCanvas: CanvasRef | null = null;
	let attachedCanvas: CanvasRef | null = null;
	let draft = '';
	let busy = false;
	let error = '';
	type Turn = {
		canvasId?: string;
		question: string;
		attachment?: string;
		answer: string;
		sources: ChatSource[];
	};
	let turns: Turn[] = [];
	async function send() {
		const question = draft.trim();
		if (!question || busy) return;
		const context = attachment
			? '\n\nFile excerpt (' +
				attachment.relative_path +
				')\n' +
				Array.from(attachment.content).slice(0, 1000).join('')
			: '';
		const message = question + context;
		if (new TextEncoder().encode(message).length > 4096) {
			error =
				'Message and file excerpt exceed the vault limit. Shorten the question or remove the excerpt.';
			return;
		}
		busy = true;
		error = '';
		try {
			const response = await sendChatMessage(
				{
					message,
					namespace: attachedCanvas?.namespace ?? namespace,
					history: turns
						.filter((t) => t.canvasId === attachedCanvas?.id)
						.slice(-4)
						.flatMap((t) => [
							{ role: 'user' as const, content: t.question },
							{ role: 'assistant' as const, content: t.answer }
						])
				},
				token,
				attachedCanvas?.id
			);
			turns = [
				...turns,
				{
					question,
					attachment: attachedCanvas?.title ?? attachment?.relative_path,
					canvasId: attachedCanvas?.id,
					answer: response.answer,
					sources: response.sources
				}
			];
			draft = '';
			attachment = null;
		} catch (err) {
			error = describeChatFailure(err);
		} finally {
			busy = false;
		}
	}
</script>

<div class="grid items-start gap-4 lg:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]">
	<aside class="mv-section space-y-5" aria-label="Workspace assistant">
		<nav
			aria-label="Workspace views"
			class="grid grid-cols-3 gap-1 border-b border-[rgb(var(--mv-border))] pb-3"
		>
			{#each views as tab}
				<a
					href={'/workspace?view=' + tab.id}
					aria-current={view === tab.id ? 'page' : undefined}
					class="flex flex-col items-center gap-1 rounded-md px-1 py-1.5 text-sm hover:underline aria-[current=page]:bg-sky-500/15"
				>
					<svelte:component this={tab.icon} size={15} />{tab.title}
				</a>
			{/each}
		</nav>
		<h2 class="text-base font-semibold">Ask your vault</h2>
		{#if turns.length}
			<div class="max-h-80 space-y-4 overflow-auto" role="log" aria-label="Workspace conversation">
				{#each turns as turn}
					<div>
						<strong class="text-sm">{turn.question}</strong>
						{#if turn.attachment}<p class="text-xs">{turn.attachment}</p>{/if}
						<p class="mt-1 whitespace-pre-wrap text-sm">{turn.answer}</p>
						{#each turn.sources as source, i}
							<a
								class="block text-xs underline"
								href={sourceHref(source.kind, source.node_id, source.title)}
								>[{i + 1}] {source.title}</a
							>
						{/each}
					</div>
				{/each}
			</div>
		{/if}
		<form class="grid gap-2" on:submit|preventDefault={send}>
			<label class="text-xs" for="work-question">Message</label>
			<textarea
				id="work-question"
				rows="3"
				class="rounded-md border bg-transparent p-2 text-sm"
				placeholder="Ask about your work…"
				bind:value={draft}
				disabled={busy}
			></textarea>
			{#if attachedCanvas}
				<button
					type="button"
					class="text-left text-xs underline"
					disabled={busy}
					on:click={() => (attachedCanvas = null)}>Remove canvas · {attachedCanvas.title}</button
				>
				<small>Replies use this canvas until you remove it.</small>
			{:else if attachment}
				<button
					type="button"
					class="text-left text-xs underline"
					disabled={busy}
					on:click={() => (attachment = null)}>Remove excerpt · {attachment.relative_path}</button
				>
			{:else if view === 'canvas' && selectedCanvas}
				<button
					type="button"
					class="text-left text-xs underline"
					disabled={busy}
					on:click={() => (attachedCanvas = selectedCanvas)}
					>Ask about canvas · {selectedCanvas.title}</button
				>
			{:else if view === 'files' && document}
				<button
					type="button"
					class="text-left text-xs underline"
					disabled={busy}
					on:click={() => (attachment = document)}>Attach excerpt · {document.relative_path}</button
				>
			{/if}
			{#if attachment}<small
					>Includes the first {Math.min(Array.from(attachment.content).length, 1000)} characters.</small
				>{/if}
			<button
				class="flex items-center justify-center gap-2 rounded-md bg-sky-500/20 px-3 py-2 text-sm disabled:opacity-50"
				disabled={busy || !draft.trim()}><Send size={14} />{busy ? 'Asking…' : 'Send'}</button
			>
			{#if error}<p role="alert" class="text-sm">{error}</p>{/if}
		</form>
	</aside>
	<section aria-label="Workspace content" class="min-w-0">
		{#if visited.has('files')}<div hidden={view !== 'files'}>
				<LibraryWorkspaceBrowser {token} {namespace} bind:selectedDocument={document} />
			</div>{/if}
		{#if visited.has('projects')}<div hidden={view !== 'projects'}><Delivery /></div>{/if}
		{#if visited.has('canvas')}<div hidden={view !== 'canvas'}>
				<NotesCanvasView {token} {namespace} bind:selectedCanvas />
			</div>{/if}
	</section>
</div>
