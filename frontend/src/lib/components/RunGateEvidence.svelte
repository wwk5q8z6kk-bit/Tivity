<script lang="ts">
	import { GATE_LABELS, type GateResultView } from '$lib/api/workOrders';
	export let gate: GateResultView;
	function gateBadge(outcome: string): string {
		switch (outcome) {
			case 'pass':
				return 'bg-emerald-500/20 text-[rgb(var(--mv-text))]';
			case 'fail':
				return 'bg-red-500/20 text-[rgb(var(--mv-text))]';
			default:
				return 'bg-amber-500/20 text-[rgb(var(--mv-text))]';
		}
	}
</script>

<details class="rounded-md border border-[rgb(var(--mv-border))] p-2 text-xs">
	<summary
		class="cursor-pointer text-[rgb(var(--mv-text))] focus-visible:outline focus-visible:outline-2"
	>
		<span class="font-medium">{GATE_LABELS[gate.gate] ?? gate.gate}</span>
		<span class={`ml-1 rounded px-1.5 py-0.5 ${gateBadge(gate.outcome)}`}
			>{gate.outcome === 'pass'
				? 'Passed'
				: gate.outcome === 'fail'
					? 'Failed'
					: gate.outcome === 'blocked'
						? 'Blocked'
						: gate.outcome}</span
		>
	</summary>
	{#if gate.detail}<p class="mt-2">{gate.detail}</p>{/if}
	<dl class="mt-2 grid gap-1 break-words">
		<dt>Check</dt>
		<dd>{gate.gate.toUpperCase()}</dd>
		<dt>Evaluator</dt>
		<dd class="break-all">{gate.evaluator_actor}</dd>
		<dt>Evaluated</dt>
		<dd>
			<time datetime={gate.evaluated_at}>{new Date(gate.evaluated_at).toLocaleString()}</time>
		</dd>
		<dt>Evidence digest</dt>
		<dd class="break-all font-mono">{gate.evidence_digest}</dd>
	</dl>
</details>
