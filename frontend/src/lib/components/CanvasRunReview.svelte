<script lang="ts">
	import {
		verifyArtifact,
		getRunEvidence,
		listRuns,
		listWorkOrders,
		submitRunReview
	} from '$lib/api/workOrders';
	import type { RunReviewDecision, RunReviewReceipt } from '$lib/api/workOrders';
	import { ApiError } from '$lib/api/client';
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
	let reason = '';
	let decisionError = '';
	let pending = false;
	let retry: { fingerprint: string; key: string } | undefined;

	function currentDecision(result: Awaited<ReturnType<typeof readEvidence>>) {
		return result.review_decisions?.find(
			(receipt) => receipt.evidence_revision === result.revision
		);
	}

	function isPinned(result: Awaited<ReturnType<typeof readEvidence>>, ref?: RunReference) {
		return (
			!!ref?.fingerprint &&
			ref.orderId === result.order.work_order_id &&
			ref.runId === result.run.run_id &&
			(ref.fingerprint === result.fingerprint || ref.fingerprint === result.revision)
		);
	}

	async function decide(
		result: Awaited<ReturnType<typeof readEvidence>>,
		decision: RunReviewDecision
	) {
		const ref = reference;
		const access = token;
		const displayedEvidence = evidence;
		const note = reason.trim();
		if (!ref || !access || !isPinned(result, ref) || !note || pending || disabled) return;
		const fingerprint = JSON.stringify([ref.orderId, ref.runId, result.revision, decision, note]);
		const key = retry?.fingerprint === fingerprint ? retry.key : crypto.randomUUID();
		retry = { fingerprint, key };
		pending = true;
		decisionError = '';
		const isCurrentView = () =>
			reviewing && reference === ref && token === access && evidence === displayedEvidence;
		try {
			await submitRunReview(ref.orderId, ref.runId, access, {
				expected_revision: result.revision,
				decision,
				reason: note,
				idempotency_key: key
			});
			if (!isCurrentView()) return;
			reason = '';
			retry = undefined;
			checks = {};
			evidence = readEvidence(ref);
		} catch (err) {
			if (!isCurrentView()) return;
			const status = err instanceof ApiError ? err.status : 0;
			if (status === 409 || status === 401 || status === 404) {
				decisionError =
					status === 409
						? 'The decision did not apply. Recheck the current evidence and any recorded decisions.'
						: 'Access changed. Rechecking whether this run is still available.';
				checks = {};
				evidence = readEvidence(ref);
			} else {
				decisionError =
					status === 403
						? 'Only an authorized independent reviewer can decide this revision.'
						: 'Could not confirm the decision. Retry with the same reason to check whether it was recorded.';
			}
		} finally {
			pending = false;
		}
	}

	function choose() {
		choosing = true;
		reviewing = false;
		orderId = '';
		runId = '';
		orders = listWorkOrders(undefined, token);
	}

	async function readEvidence(ref: RunReference, revision?: string) {
		const snapshot = await getRunEvidence(ref.orderId, ref.runId, token, revision);
		if (
			snapshot.order.work_order_id !== ref.orderId ||
			snapshot.run.run_id !== ref.runId ||
			!/^server-v1:[0-9a-f]{64}$/.test(snapshot.revision) ||
			(revision && revision !== snapshot.revision) ||
			snapshot.artifacts.some((a) => a.run_id !== ref.runId)
		)
			throw new Error('Invalid evidence response');
		const fingerprint = ref.fingerprint?.startsWith('v1:')
			? crypto.subtle &&
				(await reviewFingerprint(ref.orderId, snapshot.run, snapshot.gates, snapshot.artifacts))
			: snapshot.revision;
		return { ...snapshot, fingerprint };
	}

	function openEvidence(revision?: string) {
		if (!reference) return;
		checks = {};
		reason = '';
		decisionError = '';
		evidence = readEvidence(reference, revision);
	}

	function review() {
		if (!reference) return;
		openEvidence();
		reviewing = true;
	}
</script>

{#snippet receiptDetails(receipt: RunReviewReceipt)}
	<p>{receipt.reason}</p>
	<dl class="break-all text-xs">
		<dt>Reviewer</dt>
		<dd>{receipt.reviewer}</dd>
		<dt>Revision</dt>
		<dd>{receipt.evidence_revision}</dd>
		<dt>Receipt ID</dt>
		<dd>{receipt.receipt_id}</dd>
		<dt>Decided</dt>
		<dd>
			<time datetime={receipt.decided_at}>{new Date(receipt.decided_at).toLocaleString()}</time>
		</dd>
	</dl>
{/snippet}

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
		{#if decisionError}<p role="alert">{decisionError}</p>{/if}
		{#await evidence}<p role="status">Loading run evidence…</p>
		{:then result}
			{@const decision = currentDecision(result)}
			{@const historical = !!result.current_revision && result.current_revision !== result.revision}
			{@const earlier =
				result.review_decisions?.filter(
					(receipt) => receipt.evidence_revision !== result.revision
				) ?? []}
			<h3 class="font-semibold">{result.order.goal}</h3>
			<p>Attempt {result.run.attempt_no} · {result.run.status}</p>
			{#if historical}
				<p role="status">
					Viewing a historical evidence revision. Decisions here do not apply to current evidence.
				</p>
				<button class="underline" on:click={() => openEvidence()}>Back to current evidence</button>
			{:else if result.fingerprint}
				{#if reference?.fingerprint === result.fingerprint || reference?.fingerprint === result.revision}
					<p role="status">Run evidence matches the pinned version.</p>
				{:else}
					{#if reference?.fingerprint}
						<p role="alert">
							Run evidence has changed since it was pinned. Review the current checks and artifacts.
						</p>
						{#if result.evidence_revisions?.includes(reference.fingerprint)}
							<button class="underline" on:click={() => openEvidence(reference?.fingerprint)}
								>Open pinned revision</button
							>
						{/if}
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
			{#if decision}
				<div class="space-y-1">
					<p role="status">
						{historical
							? decision.decision === 'accept'
								? 'Accepted this historical revision'
								: 'Returned this historical revision'
							: decision.decision === 'accept'
								? 'Accepted this evidence revision'
								: 'Returned this evidence revision'}
					</p>
					{@render receiptDetails(decision)}
				</div>
			{:else if !historical && result.review_decisions && token && isPinned(result, reference) && ['completed', 'failed', 'cancelled', 'budget_exhausted'].includes(result.run.status)}
				<div class="space-y-1" aria-label="Decide this evidence revision">
					<p class="break-all text-xs">Decision applies only to {result.revision}.</p>
					<label
						>Decision reason
						<textarea
							class="block w-full rounded border p-1"
							bind:value={reason}
							maxlength="4096"
							disabled={pending || disabled}
						></textarea>
					</label>
					{#if result.run.status === 'completed' && result.gates.every((gate) => gate.outcome === 'pass')}
						<button
							class="underline"
							disabled={pending || disabled || !reason.trim()}
							on:click={() => decide(result, 'accept')}>Accept exact revision</button
						>
					{/if}
					<button
						class="underline"
						disabled={pending || disabled || !reason.trim()}
						on:click={() => decide(result, 'return')}>Return exact revision</button
					>
				</div>
			{/if}
			{#if earlier.length}
				<details>
					<summary>Earlier review decisions</summary>
					{#each earlier as receipt (receipt.receipt_id)}
						<p>{receipt.decision === 'accept' ? 'Previously accepted' : 'Previously returned'}</p>
						{@render receiptDetails(receipt)}
					{/each}
				</details>
			{/if}
		{:catch}<p role="alert">
				Run evidence unavailable. Check vault access and reopen the review.
			</p>{/await}
	{/if}
	{#if reference && !choosing}<p class="text-xs">
			A saved copy includes the order and run IDs and any evidence fingerprint you pinned. Each
			reader needs access to the work order.
		</p>{/if}
</section>
