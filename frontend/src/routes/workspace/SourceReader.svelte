<script lang="ts">
	import { getNode } from '$lib/api/nodes';
	import type { ChatSource } from '$lib/api/chat';
	import type { KnowledgeNode } from '$lib/api/types';
	import { sourceHref } from '$lib/chat/citations';

	export let source: ChatSource;
	export let number: number;
	export let token: string;
	export let namespace: string | undefined;

	let record: Promise<KnowledgeNode> | null = null;

	async function readSource() {
		const node = await getNode(source.node_id, token);
		if (node.id !== source.node_id || (namespace && node.namespace !== namespace)) {
			throw new Error('Source unavailable');
		}
		return node;
	}
</script>

<details
	class="mt-1 text-xs"
	on:toggle={(event) => {
		record = event.currentTarget.open ? readSource() : null;
	}}
>
	<summary class="cursor-pointer underline">[{number}] {source.title}</summary>
	{#if record}
		{#await record}
			<p role="status">Loading source…</p>
		{:then node}
			{@const href = sourceHref(node.kind, node.id, node.title || '')}
			<div class="my-2 space-y-2 border-l pl-2">
				<strong>{node.title || 'Untitled'}</strong>
				<p>{node.kind} · {node.namespace}</p>
				<p class="max-h-56 overflow-auto whitespace-pre-wrap break-words">
					{node.content || 'This record has no text.'}
				</p>
				<a class="underline" {href}
					>{href.startsWith('/search?')
						? 'Search vault'
						: node.kind === 'event'
							? 'Open calendar'
							: 'Open full record'}</a
				>
			</div>
		{:catch}
			<p role="status">Source unavailable. Close and reopen to retry.</p>
		{/await}
	{/if}
</details>
