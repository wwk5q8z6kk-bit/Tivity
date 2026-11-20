<script lang="ts">
	import { activeNamespace } from '$lib/stores/namespace';
	import Workbench from './Workbench.svelte';
	let token = '';
	let entered = '';
	function connect() {
		token = entered.trim();
		entered = '';
	}
</script>

<div class="mb-2 flex justify-end text-xs">
	{#if token}
		<button class="underline" on:click={() => (token = '')}>Disconnect vault token</button>
	{:else}
		<details>
			<summary class="cursor-pointer">Vault access</summary>
			<form class="flex flex-wrap items-center gap-2 p-2" on:submit|preventDefault={connect}>
				<label>Access token <input type="password" autocomplete="off" bind:value={entered} /></label
				>
				<button class="underline" disabled={!entered.trim()}>Use token</button>
			</form>
		</details>
	{/if}
</div>
{#key JSON.stringify([$activeNamespace, token])}
	<Workbench namespace={$activeNamespace ?? undefined} {token} />
{/key}
