export type AriTrack = 'software' | 'hardware';

export type AriEvidence = 'commits' | 'elapsed' | 'devlog';

export type AriDecision = 'approved' | 'changes' | 'rejected';

export type AriShipPhase =
	| 'processing'
	| 'fraud_review'
	| 'review'
	| 'under_review'
	| 'second_pass'
	| 'reviewed'
	| 'withdrawn'
	| 'reverted';

export type AriJsonPrimitive = string | number | boolean | null;

export type AriMeta = Record<string, AriJsonPrimitive | readonly AriJsonPrimitive[] | undefined>;

export interface AriMakerInput {
	email: string;
	name: string;
	slack_id: string;
	hackatime_id?: string;
	program_minutes?: number;
	program_hours?: number;
}

export interface AriCollaboratorInput {
	email: string;
	name?: string;
	slack_id?: string;
	hackatime_id?: string;
	program_minutes?: number;
	program_hours?: number;
	hackatime_projects?: readonly string[];
}

export type AriJournalDuration =
	{ minutes: number; hours?: never } | { hours: number; minutes?: never };

export type AriJournalInput = AriJournalDuration & {
	at: string | Date;
	text: string;
	markdown?: string;
	email?: string;
};

interface AriShipInputBase {
	external_id: string;
	maker: AriMakerInput;
	title: string;
	description: string;
	repo_url: string;
	thumbnail_url: string;
	shipped_at?: string | Date;
	evidence?: readonly AriEvidence[];
	hackatime_projects?: readonly string[];
	journals?: readonly AriJournalInput[];
	meta?: AriMeta;
	is_update?: boolean;
	update_message?: string;
	collaborators?: readonly AriCollaboratorInput[];
}

export type AriShipInput = AriShipInputBase &
	({ track?: 'software'; demo_url: string } | { track: 'hardware'; demo_url?: string });

export interface AriRequestOptions {
	signal?: AbortSignal;
	timeout_ms?: number;
	max_retries?: number;
}

export interface AriCreateShipResponse {
	status: 'accepted' | 'duplicate';
	id: string;
}

export interface AriWithdrawShipResponse {
	status: 'withdrawn';
	id: string;
}

export type AriShipLookup =
	{ id: string; external_id?: never } | { external_id: string; id?: never };

export interface AriShipStatus {
	id: string;
	external_id: string;
	version: number;
	phase: AriShipPhase;
	decision: AriDecision | null;
}

export interface AriActor {
	email: string;
	slack_id: string | null;
}

export interface AriMaker {
	email: string;
	name: string;
	slack_id: string | null;
}

export interface AriShipAuthor {
	email: string;
	name: string;
}

export interface AriShipSnapshot {
	title: string;
	description: string | null;
	track: AriTrack;
	thumbnail_url: string | null;
	authors: AriShipAuthor[];
	repo_url: string;
	demo_url: string | null;
	hackatime_projects: string[];
}

export interface AriMinutesBreakdown {
	hackatime: number;
	journals: number;
	lapse: number;
	program: number;
}

export interface AriCollaborator {
	email: string;
	name: string;
	slack_id: string | null;
	hackatime_id: string | null;
	note_to_maker?: string;
	approved_minutes?: number;
	approved_hours?: number;
	minutes_breakdown?: AriMinutesBreakdown;
}

export type AriReviewFieldType = 'checkbox' | 'text' | 'number' | 'select' | 'multiselect';

export interface AriReviewField {
	key: string;
	label: string;
	type: AriReviewFieldType;
	value: unknown;
}

export interface AriReviewJustification {
	hackatime_projects?: string;
	hackatime_user_id?: string;
	lapse_links?: string;
	technical_features?: string;
	deflation_reason?: string;
	time_evidence?: string;
	supporting_evidence?: string;
	hours_reasoning?: string;
	additional_justification?: string;
	unified_db_record?: string;
}

export interface AriReview {
	note_to_maker: string;
	reviewer: AriActor | null;
	audit_note?: string;
	approved_minutes?: number;
	approved_hours?: number;
	minutes_breakdown?: AriMinutesBreakdown;
	fields?: AriReviewField[];
	justification?: AriReviewJustification;
}

interface AriReviewEventBase {
	id: string;
	external_id: string;
	priority?: boolean;
	maker: AriMaker;
	ship: AriShipSnapshot;
	collaborators?: AriCollaborator[];
	review: AriReview;
}

export type AriReviewDecisionEvent = AriReviewEventBase &
	(
		| { event: 'review.approved'; decision: 'approved' }
		| { event: 'review.changes'; decision: 'changes' }
		| { event: 'review.rejected'; decision: 'rejected' }
	);

export type AriReviewResetEvent = AriReviewEventBase & {
	event: 'review.reverted' | 'review.requeued';
	decision: null;
};

export interface AriFraudCheck {
	email: string;
	slack_id: string | null;
	trust_score: number | null;
	justification: string | null;
}

export interface AriFraudEvent extends AriReviewEventBase {
	event: 'review.fraud';
	decision: null;
	fraud: {
		verdict: 'passed' | 'failed';
		checks: AriFraudCheck[];
	};
}

export type AriShipChangeField =
	| 'title'
	| 'track'
	| 'description'
	| 'thumbnail_url'
	| 'author_names'
	| 'repo_url'
	| 'demo_url'
	| 'hackatime_projects';

export interface AriShipChange {
	field: AriShipChangeField;
	old_value: string | string[] | null;
	new_value: string | string[] | null;
}

export interface AriShipUpdatedEvent {
	event: 'ship.updated';
	id: string;
	external_id: string;
	ship: AriShipSnapshot;
	edited_by: AriActor | null;
	changes: AriShipChange[];
}

export type AriKnownWebhookEvent =
	AriShipUpdatedEvent | AriReviewDecisionEvent | AriReviewResetEvent | AriFraudEvent;

export interface AriUnknownWebhookEvent {
	event: 'unknown';
	event_name: string;
	payload: Record<string, unknown>;
}

export type AriWebhookEvent = AriKnownWebhookEvent | AriUnknownWebhookEvent;

export interface AriWebhookDelivery {
	delivery_id: string;
	timestamp: number;
	event: AriWebhookEvent;
}

export type AriWebhookHeaders =
	| Headers
	| { get(name: string): string | null }
	| Record<string, string | readonly string[] | undefined>;

export interface AriWebhookOptions {
	secret: string;
	tolerance_seconds?: number;
	now?: Date;
}

export interface AriWebhookContext {
	delivery_id: string;
	timestamp: number;
}

export interface AriWebhookHandlerOptions extends AriWebhookOptions {
	on_event(
		event: AriWebhookEvent,
		context: AriWebhookContext
	): void | Response | Promise<void | Response>;
}

export interface AriTestWebhookOptions {
	secret: string;
	delivery_id: string;
	timestamp?: number;
}
