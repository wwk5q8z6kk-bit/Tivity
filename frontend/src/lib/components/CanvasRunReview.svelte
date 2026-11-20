<script lang="ts">
	import { verifyArtifact, getRunEvidence, listRuns, listWorkOrders } from '$lib/api/workOrders';
	import { reviewFingerprint } from '$lib/canvas/reviewEvidence';
	import RunGateEvidence from './RunGateEvidence.svelte';
	import type { RunReference } from '$lib/canvas/savedCanvases';

	export let token: string;
	export let disabled = false;
	export let reference: RunReference | undefined;

	let choosing = false;
	let reviewing = false;
	let orderId = '';
	let runId = '';
	let orders: ReturnType<typeof listWorkOrders>;
	let runs: ReturnType<typeof listRuns>;
	let evidence: ReturnType<typeof readEvidence>;
	let checks: Partial<Record<string, Promise<boolean>>> = {};

	function choose() {
		choosing = true;
		reviewing = false;
		orderId = '';
		runId = '';
		orders = listWorkOrders(undefined, token);
	}

	async function readEvidence(ref: RunReference) {
		const snapshot = await getRunEvidence(ref.orderId, ref.runId, token);
		if (
			snapshot.order.work_order_id !== ref.orderId ||
			snapshot.run.run_id !== ref.runId ||
			!/^server-v1:[0-9a-f]{64}$/.test(snapshot.revision) ||
			snapshot.artifacts.some((a) => a.run_id !== ref.runId)
		)
			throw new Error('Invalid evidence response');
		const fingerprint = ref.fingerprint?.startsWith('v1:')
			? crypto.subtle &&
				(await reviewFingerprint(ref.orderId, snapshot.run, snapshot.gates, snapshot.artifacts))
			: snapshot.revision;
		return { ...snapshot, fingerprint };
	}

	function review() {
		if (!reference) return;
		checks = {};
		evidence = readEvidence(reference);
		reviewing = true;
	}
</script>

<section
	class="space-y-2 rounded-lg border border-[rgb(var(--mv-border))] p-3 text-sm"
	aria-label="Canvas run review"
>
	{#if reference}
		<button
			class="underline"
			{disabled}
			aria-expanded={reviewing}
			on:click={() => {
				if (reviewing) reviewing = false;
				else {
					choosing = false;
					review();
				}
			}}>{reviewing ? 'Close run review' : 'Review linked run'}</button
		>
	{/if}
	{#if !reviewing && !choosing}
		<button class="ml-1 underline" {disabled} on:click={choose}
			>{reference ? 'Change linked run' : 'Link a work-order run'}</button
		>
	{/if}
	{#if choosing}
		{#await orders}
			<p role="status">Loading work orders…</p>
		{:then choices}
			<label
				>Work order <select
					bind:value={orderId}
					on:change={(e) => {
						runId = '';
						if (e.currentTarget.value) runs = listRuns(e.currentTarget.value, token);
					}}
				>
					<option value="">Choose a work order</option>
					{#each choices as order}<option value={order.work_order_id}>{order.goal}</option>{/each}
				</select></label
			>
			{#if !choices.length}<p>No work orders available to this identity.</p>{/if}
			{#if orderId}
				{#await runs}<p role="status">Loading runs…</p>
				{:then attempts}
					<label
						>Run <select bind:value={runId}
							><option value="">Choose a run</option>
							{#each attempts as run}<option value={run.run_id}
									>Attempt {run.attempt_no} · {run.status} · {run.run_id}</option
								>{/each}
						</select></label
					>
					{#if !attempts.length}<p>This order has no runs.</p>{/if}
					<button
						class="underline"
						disabled={disabled || !runId}
						on:click={() => {
							reference = { orderId, runId };
							choosing = false;
							review();
						}}>Link run</button
					>
				{:catch}<p role="alert">Runs unavailable. Choose the order again to retry.</p>{/await}
			{/if}
		{:catch}<p role="alert">
				Work orders unavailable. Use a vault identity with access to the order. Namespace-only
				credentials cannot read runs.
			</p>{/await}
		<button class="underline" on:click={() => (choosing = false)}>Cancel</button>
		{#if reference}<button
				class="underline"
				{disabled}
				on:click={() => {
					reference = undefined;
					choosing = false;
				}}>Remove link from copy</button
			>{/if}
	{/if}
	{#if reviewing}
		{#await evidence}<p role="status">Loading run evidence…</p>
		{:then result}
			<h3 class="font-semibold">{result.order.goal}</h3>
			<p>Attempt {result.run.attempt_no} · {result.run.status}</p>
			{#if result.fingerprint}
				{#if reference?.fingerprint === result.fingerprint || reference?.fingerprint === result.revision}
					<p role="status">Run evidence matches the pinned version.</p>
				{:else}
					{#if reference?.fingerprint}
						<p role="alert">
							Run evidence has changed since it was pinned. Review the current checks and artifacts.
						</p>
					{/if}
					<button
						class="underline"
						{disabled}
						on:click={() => {
							reference = {
								orderId: result.order.work_order_id,
								runId: result.run.run_id,
								fingerprint: result.revision
							};
						}}
						>{reference?.fingerprint
							? 'Use current evidence for a new copy'
							: 'Pin current evidence for a saved copy'}</button
					>
				{/if}
			{:else}<p>Open the vault over HTTPS or localhost to compare evidence fingerprints.</p>{/if}
			{#if result.admission_receipt}
				<details class="break-all">
					<summary>Work order admission receipt</summary>
					<dl>
						<dt>Accountable principal</dt>
						<dd>{result.admission_receipt.principal}</dd>
						<dt>Acting identity</dt>
						<dd>{result.admission_receipt.actor}</dd>
						<dt>Admitted</dt>
						<dd>
							<time datetime={result.admission_receipt.occurred_at}
								>{new Date(result.admission_receipt.occurred_at).toLocaleString()}</time
							>
						</dd>
						<dt>Event ID</dt>
						<dd>{result.admission_receipt.event_id}</dd>
					</dl>
				</details>
			{:else if result.admission_receipt === null}<p>
					No local admission receipt is available for this order.
				</p>{/if}
			<h4>Checks</h4>
			{#each result.gates as gate}
				<RunGateEvidence {gate} />
			{:else}<p>No checks recorded.</p>{/each}
			<h4>Artifacts</h4>
			{#each result.artifacts as artifact}
				<div class="break-all">
					<p>{artifact.artifact_kind} · {artifact.content_digest}</p>
					<button
						class="underline"
						on:click={() =>
							(checks = {
								...checks,
								[artifact.artifact_id]: verifyArtifact(result.order.work_order_id, artifact, token)
							})}>Check artifact bytes</button
					>
					{#if checks[artifact.artifact_id]}
						{#await checks[artifact.artifact_id]}<span role="status">Checking…</span>
						{:then matched}<span role="status"
								>{matched ? 'Digest matches' : 'Digest mismatch'}</span
							>
						{:catch}<span role="alert">Could not check artifact bytes.</span>{/await}
					{/if}
				</div>
			{:else}<p>No artifacts recorded.</p>{/each}
		{:catch}<p role="alert">
				Run evidence unavailable. Check vault access and reopen the review.
			</p>{/await}
	{/if}
	{#if reference && !choosing}<p class="text-xs">
			A saved copy includes the order and run IDs and any evidence fingerprint you pinned. Each
			reader needs access to the work order.
		</p>{/if}
</section>
