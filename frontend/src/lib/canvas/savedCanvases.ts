import { ApiError } from '$lib/api/client';
import { getNode, listNodes } from '$lib/api/nodes';
import { saveSourceNode } from '$lib/api/source-import';
import type { KnowledgeNode } from '$lib/api/types';

export interface CardPosition {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface RunReference {
	orderId: string;
	runId: string;
	fingerprint?: string;
}

export interface CanvasLayout {
	run?: RunReference;
	cards: CardPosition[];
	pan: { x: number; y: number };
	zoom: number;
}

const nodeIdPattern = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;

export const canvasTag = 'tivity-canvas-v1';

export function isSavedCanvas(node: KnowledgeNode) {
	return node.kind === 'saved_view' && node.tags?.includes(canvasTag);
}

export async function listCanvases(namespace: string | undefined, token: string) {
	const found = new Map<string, KnowledgeNode>();
	const limit = 100;
	for (let offset = 0; ; offset += limit) {
		const page = await listNodes({ kind: 'saved_view', namespace, offset, limit }, token);
		for (const node of page) if (isSavedCanvas(node)) found.set(node.id, node);
		if (page.length < limit) return [...found.values()];
	}
}

export function includesTaskInReview(canvas: KnowledgeNode, taskId: string) {
	const layout = canvas.metadata?.canvas_layout;
	return (
		isSavedCanvas(canvas) &&
		validLayout(layout) &&
		!!layout.run &&
		layout.cards.some((card) => card.id === taskId)
	);
}

export function saveCanvas(
	name: string,
	namespace: string,
	layout: CanvasLayout,
	token: string,
	key: string
) {
	if (!validLayout(layout)) throw new Error('Invalid card positions.');
	return saveSourceNode(
		{
			kind: 'saved_view',
			title: name,
			content: name,
			namespace,
			tags: [canvasTag],
			metadata: { canvas_layout: layout }
		},
		[canvasTag, key, namespace, name, JSON.stringify(layout)],
		token
	);
}

function validLayout(value: unknown): value is CanvasLayout {
	if (!value || typeof value !== 'object') return false;
	const layout = value as CanvasLayout;
	return (
		(layout.run === undefined ||
			(layout.run &&
				typeof layout.run.orderId === 'string' &&
				typeof layout.run.runId === 'string' &&
				(layout.run.fingerprint === undefined ||
					(typeof layout.run.fingerprint === 'string' &&
						/^(?:server-)?v1:[a-f0-9]{64}$/.test(layout.run.fingerprint))) &&
				nodeIdPattern.test(layout.run.orderId) &&
				nodeIdPattern.test(layout.run.runId))) &&
		Array.isArray(layout.cards) &&
		layout.cards.length <= 50 &&
		new Set(layout.cards.map((card) => card?.id)).size === layout.cards.length &&
		layout.cards.every(
			(card) =>
				card &&
				typeof card.id === 'string' &&
				nodeIdPattern.test(card.id) &&
				[card.x, card.y, card.width, card.height].every(Number.isFinite) &&
				card.width > 0 &&
				card.height > 0
		) &&
		Number.isFinite(layout.pan?.x) &&
		Number.isFinite(layout.pan?.y) &&
		Number.isFinite(layout.zoom) &&
		layout.zoom >= 0.3 &&
		layout.zoom <= 2
	);
}

export async function openCanvas(id: string, namespace: string | undefined, token: string) {
	if (!nodeIdPattern.test(id)) throw new Error('Invalid canvas ID.');
	const node = await getNode(id, token);
	const layout = node.metadata.canvas_layout;
	if (!isSavedCanvas(node) || (namespace && node.namespace !== namespace) || !validLayout(layout))
		throw new Error('This saved canvas cannot be opened.');
	const cards = [];
	for (let i = 0; i < layout.cards.length; i += 6) {
		const batch = await Promise.all(
			layout.cards.slice(i, i + 6).map(async (position) => {
				try {
					const record = await getNode(position.id, token);
					if (record.namespace === node.namespace && !isSavedCanvas(record))
						return {
							record,
							position: {
								x: position.x,
								y: position.y,
								width: position.width,
								height: position.height
							}
						};
				} catch (err) {
					if (!(err instanceof ApiError && (err.status === 404 || err.status === 403))) throw err;
				}
				return null;
			})
		);
		for (const card of batch) if (card) cards.push(card);
	}
	return { node, layout, cards };
}
