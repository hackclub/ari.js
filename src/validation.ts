import { AriConfigurationError, AriInputError } from './errors.js';

import type {
	AriCollaboratorInput,
	AriJournalInput,
	AriMakerInput,
	AriShipInput,
	AriShipLookup
} from './types.js';

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown, field: string): asserts value is string {
	if (typeof value !== 'string' || value.trim() === '') {
		throw new AriInputError(`${field} must be a non-empty string.`, field);
	}
}

function optionalString(value: unknown, field: string): void {
	if (value !== undefined && typeof value !== 'string') {
		throw new AriInputError(`${field} must be a string.`, field);
	}
}

function httpUrl(value: unknown, field: string): void {
	nonEmpty(value, field);
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new AriInputError(`${field} must be a valid HTTP or HTTPS URL.`, field);
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new AriInputError(`${field} must be a valid HTTP or HTTPS URL.`, field);
	}
}

function programTime(person: AriMakerInput | AriCollaboratorInput, field: string): number {
	if (person.program_minutes !== undefined) {
		if (
			typeof person.program_minutes !== 'number' ||
			!Number.isFinite(person.program_minutes) ||
			person.program_minutes < 0 ||
			person.program_minutes > 60_000
		) {
			throw new AriInputError(`${field}.program_minutes must be between 0 and 60000.`, field);
		}
		return person.program_minutes;
	}
	if (person.program_hours !== undefined) {
		if (
			typeof person.program_hours !== 'number' ||
			!Number.isFinite(person.program_hours) ||
			person.program_hours < 0 ||
			person.program_hours > 1_000
		) {
			throw new AriInputError(`${field}.program_hours must be between 0 and 1000.`, field);
		}
		return person.program_hours * 60;
	}
	return 0;
}

function collaborator(person: AriCollaboratorInput, index: number): number {
	const field = `collaborators[${index}]`;
	if (!record(person)) throw new AriInputError(`${field} must be an object.`, 'collaborators');
	nonEmpty(person.email, `${field}.email`);
	optionalString(person.name, `${field}.name`);
	optionalString(person.slack_id, `${field}.slack_id`);
	optionalString(person.hackatime_id, `${field}.hackatime_id`);
	if (person.hackatime_projects !== undefined) {
		if (!Array.isArray(person.hackatime_projects)) {
			throw new AriInputError(`${field}.hackatime_projects must be an array.`, 'collaborators');
		}
		for (const project of person.hackatime_projects) {
			if (typeof project !== 'string') {
				throw new AriInputError(
					`${field}.hackatime_projects must contain strings.`,
					'collaborators'
				);
			}
		}
	}
	return programTime(person, field);
}

function journal(entry: AriJournalInput, index: number, collaboratorEmails: Set<string>): void {
	const field = `journals[${index}]`;
	if (!record(entry)) throw new AriInputError(`${field} must be an object.`, 'journals');
	const at = entry.at instanceof Date ? entry.at : new Date(entry.at);
	if (Number.isNaN(at.getTime()))
		throw new AriInputError(`${field}.at must be a valid date.`, 'journals');
	const minutes = entry.minutes ?? (entry.hours === undefined ? undefined : entry.hours * 60);
	if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0 || minutes > 1_440) {
		throw new AriInputError(
			`${field} must include a duration between 0 and 1440 minutes.`,
			'journals'
		);
	}
	nonEmpty(entry.text, `${field}.text`);
	optionalString(entry.markdown, `${field}.markdown`);
	if (collaboratorEmails.size > 0) {
		nonEmpty(entry.email, `${field}.email`);
		if (!collaboratorEmails.has(entry.email.trim().toLowerCase())) {
			throw new AriInputError(`${field}.email must match a collaborator.`, 'journals');
		}
	} else {
		optionalString(entry.email, `${field}.email`);
	}
}

function shippedAt(value: string | Date): void {
	const date = value instanceof Date ? value : new Date(value);
	if (
		Number.isNaN(date.getTime()) ||
		date.getTime() < Date.UTC(2000, 0, 1) ||
		date.getTime() > Date.now() + 86_400_000
	) {
		throw new AriInputError(
			'shipped_at must be a valid date between 2000 and tomorrow.',
			'shipped_at'
		);
	}
}

export function validateConfiguration(input: {
	programId: string;
	signingSecret: string;
	baseUrl: string;
	timeoutMs: number;
	maxRetries: number;
}): URL {
	if (input.programId.trim() === '') throw new AriConfigurationError('programId is required.');
	if (input.signingSecret.trim() === '')
		throw new AriConfigurationError('signingSecret is required.');
	if (!Number.isFinite(input.timeoutMs) || input.timeoutMs <= 0) {
		throw new AriConfigurationError('timeoutMs must be greater than zero.');
	}
	if (!Number.isInteger(input.maxRetries) || input.maxRetries < 0 || input.maxRetries > 10) {
		throw new AriConfigurationError('maxRetries must be an integer between 0 and 10.');
	}
	let url: URL;
	try {
		url = new URL(input.baseUrl);
	} catch {
		throw new AriConfigurationError('baseUrl must be a valid URL.');
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new AriConfigurationError('baseUrl must use HTTP or HTTPS.');
	}
	url.pathname = url.pathname.replace(/\/$/, '');
	url.search = '';
	url.hash = '';
	return url;
}

export function validateShip(input: AriShipInput): void {
	if (!record(input)) throw new AriInputError('The ship must be an object.');
	nonEmpty(input.external_id, 'external_id');
	nonEmpty(input.title, 'title');
	nonEmpty(input.description, 'description');
	httpUrl(input.repo_url, 'repo_url');
	httpUrl(input.thumbnail_url, 'thumbnail_url');
	if (!record(input.maker)) throw new AriInputError('maker must be an object.', 'maker');
	nonEmpty(input.maker.email, 'maker.email');
	nonEmpty(input.maker.name, 'maker.name');
	nonEmpty(input.maker.slack_id, 'maker.slack_id');
	optionalString(input.maker.hackatime_id, 'maker.hackatime_id');
	const makerMinutes = programTime(input.maker, 'maker');

	const track = input.track ?? 'software';
	if (track !== 'software' && track !== 'hardware') {
		throw new AriInputError('track must be software or hardware.', 'track');
	}
	if (track === 'software') httpUrl(input.demo_url, 'demo_url');
	if (input.demo_url !== undefined) httpUrl(input.demo_url, 'demo_url');
	if (input.shipped_at !== undefined) shippedAt(input.shipped_at);
	optionalString(input.update_message, 'update_message');
	if (input.is_update !== undefined && typeof input.is_update !== 'boolean') {
		throw new AriInputError('is_update must be a boolean.', 'is_update');
	}

	if (input.evidence !== undefined) {
		if (!Array.isArray(input.evidence))
			throw new AriInputError('evidence must be an array.', 'evidence');
		for (const evidence of input.evidence) {
			if (evidence !== 'commits' && evidence !== 'elapsed' && evidence !== 'devlog') {
				throw new AriInputError('evidence contains an unsupported value.', 'evidence');
			}
		}
	}

	if (input.hackatime_projects !== undefined) {
		if (!Array.isArray(input.hackatime_projects)) {
			throw new AriInputError('hackatime_projects must be an array.', 'hackatime_projects');
		}
		for (const project of input.hackatime_projects) {
			if (typeof project !== 'string') {
				throw new AriInputError('hackatime_projects must contain strings.', 'hackatime_projects');
			}
		}
	}

	const collaborators: readonly AriCollaboratorInput[] = input.collaborators ?? [];
	if (!Array.isArray(collaborators) || collaborators.length > 10) {
		throw new AriInputError('collaborators must contain at most 10 people.', 'collaborators');
	}
	const collaboratorEmails = new Set<string>();
	let collaboratorMinutes = 0;
	let collaboratorProjects = 0;
	for (const [index, person] of collaborators.entries()) {
		collaboratorMinutes += collaborator(person, index);
		const email = person.email.trim().toLowerCase();
		if (collaboratorEmails.has(email)) {
			throw new AriInputError('collaborator emails must be unique.', 'collaborators');
		}
		collaboratorEmails.add(email);
		collaboratorProjects +=
			person.hackatime_projects?.filter((value: string) => value.trim() !== '').length ?? 0;
	}

	const journals: readonly AriJournalInput[] = input.journals ?? [];
	if (!Array.isArray(journals) || journals.length > 200) {
		throw new AriInputError('journals must contain at most 200 entries.', 'journals');
	}
	for (const [index, entry] of journals.entries()) journal(entry, index, collaboratorEmails);

	if (input.meta !== undefined) {
		if (!record(input.meta) || Object.keys(input.meta).length > 24) {
			throw new AriInputError('meta must be a flat object with at most 24 keys.', 'meta');
		}
		for (const value of Object.values(input.meta)) {
			if (value === undefined) continue;
			if (Array.isArray(value)) {
				if (value.some((item) => record(item) || Array.isArray(item))) {
					throw new AriInputError('meta arrays may only contain scalar values.', 'meta');
				}
			} else if (record(value)) {
				throw new AriInputError('meta must not contain nested objects.', 'meta');
			}
		}
	}

	const shipProjects = input.hackatime_projects?.filter((value) => value.trim() !== '').length ?? 0;
	const creditedMinutes = collaborators.length > 0 ? collaboratorMinutes : makerMinutes;
	if (shipProjects + collaboratorProjects === 0 && journals.length === 0 && creditedMinutes <= 0) {
		throw new AriInputError(
			'Include a Hackatime project, journal entry, or program-provided time.',
			'hackatime_projects'
		);
	}
}

export function validateLookup(lookup: AriShipLookup): void {
	if (!record(lookup)) throw new AriInputError('A ship lookup is required.');
	const hasId = typeof lookup.id === 'string' && lookup.id.trim() !== '';
	const hasExternalId = typeof lookup.external_id === 'string' && lookup.external_id.trim() !== '';
	if (hasId === hasExternalId) {
		throw new AriInputError('Provide exactly one of id or external_id.');
	}
}
