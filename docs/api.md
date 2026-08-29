# Methods and fields

This page lists the options, methods, fields, and errors available in the SDK.

## Start the client

```ts
import { Ari } from '@hackclub/ari';

const ari = new Ari({
	programId: process.env.ARI_PROGRAM_ID!,
	signingSecret: process.env.ARI_SIGNING_SECRET!
});
```

### Client options

| Option          | Type       | Default                             | What it does                                                    |
| --------------- | ---------- | ----------------------------------- | --------------------------------------------------------------- |
| `programId`     | `string`   | Required                            | Your program ID from Ari.                                       |
| `signingSecret` | `string`   | Required                            | The secret used when your program sends requests to Ari.        |
| `baseUrl`       | `string`   | `https://webhooks.ari.hackclub.com` | Changes the Ari address. This is mostly useful in local tests.  |
| `timeoutMs`     | `number`   | `15000`                             | How many milliseconds each try may take.                        |
| `maxRetries`    | `number`   | `2`                                 | How many extra times a safe request may be tried. From 0 to 10. |
| `fetch`         | `AriFetch` | `globalThis.fetch`                  | Lets tests or special server setups provide their own `fetch`.  |

Every method can also receive these options:

| Option        | Type          | What it does                                    |
| ------------- | ------------- | ----------------------------------------------- |
| `signal`      | `AbortSignal` | Stops the request.                              |
| `timeout_ms`  | `number`      | Changes the timeout for this request only.      |
| `max_retries` | `number`      | Changes the number of extra tries when allowed. |

## Send a project

Call `ari.ships.create(input, options?)`. See the complete project example in the
[README](../README.md#send-a-project).

`options` is optional. The result looks like this:

```ts
type AriCreateShipResponse = {
	status: 'accepted' | 'duplicate';
	id: string;
};
```

- `accepted` means Ari received a new submission.
- `duplicate` means Ari had already received the same submission and returned its existing ID.

### Required project fields

| Field            | Type     | What to provide                                       |
| ---------------- | -------- | ----------------------------------------------------- |
| `external_id`    | `string` | The project ID used by your own program.              |
| `maker.email`    | `string` | The maker’s email address.                            |
| `maker.name`     | `string` | The maker’s display name.                             |
| `maker.slack_id` | `string` | The maker’s Slack user ID.                            |
| `title`          | `string` | The project title.                                    |
| `description`    | `string` | A short project description.                          |
| `repo_url`       | `string` | An `http` or `https` link to the project repository.  |
| `demo_url`       | `string` | A live demo or video. Required for software projects. |
| `thumbnail_url`  | `string` | An `http` or `https` image link.                      |

### Optional project fields

| Field                   | Type                                     | What to provide                                                         |
| ----------------------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| `track`                 | `'software' \| 'hardware'`               | The review track. It is `software` when left out.                       |
| `maker.hackatime_id`    | `string`                                 | The maker’s Hackatime user ID.                                          |
| `maker.program_minutes` | `number`                                 | Time already checked by your program, from 0 to 60,000 minutes.         |
| `maker.program_hours`   | `number`                                 | The same kind of time in hours, from 0 to 1,000 hours.                  |
| `shipped_at`            | `string \| Date`                         | An older ship date used while moving existing data into Ari.            |
| `hackatime_projects`    | `string[]`                               | Exact Hackatime project names.                                          |
| `evidence`              | `('commits' \| 'elapsed' \| 'devlog')[]` | The kinds of work evidence Ari should check.                            |
| `journals`              | `AriJournalInput[]`                      | Up to 200 journal entries.                                              |
| `collaborators`         | `AriCollaboratorInput[]`                 | Up to 10 people when your program allows shared projects.               |
| `meta`                  | `AriMeta`                                | Up to 24 extra values for reviewers.                                    |
| `is_update`             | `boolean`                                | Set to `true` when this is an update to an earlier project.             |
| `update_message`        | `string`                                 | A short note about what changed. A non-empty note also marks an update. |

A project must include some time evidence. Add at least one Hackatime project, journal entry, or
positive amount of program-provided time.

For a hardware project, set `track: 'hardware'`. Hardware projects may leave out `demo_url`.

`shipped_at` must be between the year 2000 and one day from now. Each `meta` value can be a string,
number, boolean, `null`, or a list of those simple values.

### Journal entries

Each journal entry needs a date, text, and either `minutes` or `hours`:

```ts
{
	at: '2026-08-20T16:00:00Z',
	minutes: 90,
	text: 'Example journal entry.',
	markdown: 'Example **journal** entry.',
	email: 'example@hackclub.com'
}
```

Use `minutes` from 0 to 1,440 or `hours` from 0 to 24. For a shared project, `email` is required and
must match one of the collaborators.

### Shared projects

```ts
await ari.ships.create({
	external_id: 'project-123',
	title: 'Example Project',
	description: 'Example project description.',
	maker: {
		email: 'example@hackclub.com',
		name: 'Example',
		slack_id: 'U1234567890'
	},
	collaborators: [
		{
			email: 'example@hackclub.com',
			name: 'Example',
			hackatime_projects: ['example-project']
		},
		{
			email: 'example2@hackclub.com',
			name: 'Example Two',
			program_hours: 3
		}
	],
	repo_url: 'https://github.com/example/project',
	demo_url: 'https://example.com/demo',
	thumbnail_url: 'https://example.com/image.png',
	hackatime_projects: ['example-project']
});
```

Each collaborator email must be different. Email matching ignores uppercase and lowercase letters.
A collaborator can include `name`, `slack_id`, `hackatime_id`, `hackatime_projects`,
`program_minutes`, and `program_hours`.

Put program-provided time on each collaborator instead of on `maker` when the project is shared.

## Withdraw a project

```ts
const result = await ari.ships.withdraw('project-123');
```

This withdraws the open submission for that project. It returns:

```ts
type AriWithdrawShipResponse = {
	status: 'withdrawn';
	id: string;
};
```

If there is no open submission, Ari returns an `AriApiError` with `code === 'not_queued'`.

The SDK does not try this request again automatically. If the connection fails after you send it,
check the project status before showing a result.

## Check project status

Use exactly one kind of ID:

```ts
await ari.ships.status({ external_id: 'project-123' });
await ari.ships.status({ id: 'cm1234567890abcdefghijkl' });
```

`external_id` finds the newest submission for your project. `id` finds one exact Ari submission.

The result looks like this:

```ts
type AriShipStatus = {
	id: string;
	external_id: string;
	version: number;
	phase: AriShipPhase;
	decision: 'approved' | 'changes' | 'rejected' | null;
};
```

| Phase          | What it means                                                  |
| -------------- | -------------------------------------------------------------- |
| `processing`   | Ari is collecting the project’s work evidence.                 |
| `fraud_review` | The project is waiting for a fraud check.                      |
| `review`       | The project is waiting for a reviewer.                         |
| `under_review` | A reviewer is working on the project.                          |
| `second_pass`  | The result is waiting for an organizer to confirm it.          |
| `reviewed`     | The result is final and is available in `decision`.            |
| `withdrawn`    | Your program withdrew the project before the result was final. |
| `reverted`     | Ari removed the result, so the project may be submitted again. |

## Errors

Every SDK error extends `AriError`.

| Error class                   | What it means                                                        |
| ----------------------------- | -------------------------------------------------------------------- |
| `AriConfigurationError`       | The client or webhook helper is missing a required setting.          |
| `AriInputError`               | A value is invalid. `field` points to it when possible.              |
| `AriApiError`                 | Ari rejected the request. It includes the status and Ari error code. |
| `AriConnectionError`          | The SDK could not reach Ari.                                         |
| `AriTimeoutError`             | Ari did not answer before the request timeout.                       |
| `AriResponseError`            | Ari returned a success response the SDK could not understand.        |
| `AriWebhookVerificationError` | A webhook could not be confirmed as coming from Ari.                 |
| `AriWebhookPayloadError`      | A confirmed webhook did not contain a usable event.                  |

Common `AriApiError.code` values are `already_queued`, `bad_signature`,
`collaborators_not_enabled`, `internal_error`, `invalid_payload`, `not_found`, `not_queued`,
`unauthorized`, and `unknown_program`.
