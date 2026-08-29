# Receiving updates from Ari

Ari can send your program a request when a project or review changes. This request is called a
webhook.

Webhook code must run on your server because it uses a secret. Use the webhook secret from Ari,
not the signing secret used to send projects.

## Add a webhook route

`Ari.webhooks.createHandler()` checks that the request came from Ari, reads the event, and gives it
to your function.

```ts
import { Ari } from '@hackclub/ari';

export const POST = Ari.webhooks.createHandler({
	secret: process.env.ARI_WEBHOOK_SECRET!,
	async on_event(event, context) {
		console.log(context.delivery_id, event.event);
	}
});
```

Use `POST` as the handler for your Ari webhook route. When your function finishes, the SDK returns
an empty `204` success response.

If your work fails, throw the error. This lets your server return a failure response so Ari can try
again.

## Keep the original request body

The easiest option is to give the standard `Request` directly to `createHandler()` as shown above.
The SDK reads it before anything changes it.

If your server does not give you a standard `Request`, pass the original body and headers yourself:

```ts
const delivery = await Ari.webhooks.constructEvent(rawBody, headers, {
	secret: process.env.ARI_WEBHOOK_SECRET!
});
```

`rawBody` can be a string, `ArrayBuffer`, Node.js `Buffer`, or another byte array. It must be exactly
what Ari sent. Do not parse the JSON and turn it back into a string first, because that can change
the body and make the safety check fail.

The result contains:

```ts
{
	delivery_id: string;
	timestamp: number;
	event: AriWebhookEvent;
}
```

By default, the request time must be within five minutes of your server time. You can change this
for tests:

```ts
const delivery = await Ari.webhooks.constructEvent(rawBody, headers, {
	secret: process.env.ARI_WEBHOOK_SECRET!,
	tolerance_seconds: 30
});
```

## Avoid handling the same update twice

Ari may send an update again if it does not receive a success response. The repeated request keeps
the same `delivery_id`.

Save each `delivery_id` after your work succeeds. When you receive an ID you already saved, return
success without doing the work again. Only save the ID after all related changes have finished.

A manual resend has a new delivery ID and should be handled again.

Do not use `event.id` for this check. That is the Ari submission ID, and one submission can have
several real events.

## Event names

Use `event.event` to find out what changed:

| Event             | What happened                                                   |
| ----------------- | --------------------------------------------------------------- |
| `ship.updated`    | A reviewer corrected project information.                       |
| `review.approved` | Ari approved the project.                                       |
| `review.changes`  | The maker needs to make changes before submitting again.        |
| `review.rejected` | Ari rejected the project.                                       |
| `review.reverted` | Ari removed an earlier review result.                           |
| `review.requeued` | Ari removed a result and put the project back in the queue.     |
| `review.fraud`    | Ari finished an optional fraud check after approval.            |
| `unknown`         | Ari sent a newer event that this SDK version does not know yet. |

Review events include the project ID, maker, project information, and review information. Shared
projects may also include collaborators. Programs with priority review may receive `priority`.

`ship.updated` includes `edited_by` and `changes`, which list the fields that changed. It does not
include a review result.

For `review.reverted` and `review.requeued`, `decision` is `null`. Undo anything your program did
for the earlier result. Make that work safe to run more than once.

## New event names

If Ari adds an event after your installed SDK version was released, the SDK returns it like this:

```ts
{
	event: 'unknown',
	event_name: 'review.example_event',
	payload: { event: 'review.example_event' }
}
```

Record the event, return success, and update the SDK before adding behavior for it. This prevents
an event you do not know yet from being sent again and again.

## Test your webhook route

`generateTestHeaders()` makes Ari-style headers for local tests. It is only for tests.

```ts
const body = JSON.stringify({
	event: 'review.example_event',
	id: 'cm1234567890abcdefghijkl',
	external_id: 'project-123'
});

const headers = await Ari.webhooks.generateTestHeaders(body, {
	secret: 'whsec_example',
	delivery_id: 'delivery-123',
	timestamp: 1_751_500_000
});

const request = new Request('http://localhost:3000/webhooks/ari', {
	method: 'POST',
	headers,
	body
});
```

When a test uses a fixed timestamp, pass `now: new Date(timestamp * 1000)` to `constructEvent()`,
`unwrap()`, or `createHandler()`.

## Other webhook helpers

| Helper                                                 | What it does                                          |
| ------------------------------------------------------ | ----------------------------------------------------- |
| `Ari.webhooks.unwrap(request, options)`                | Checks and reads a standard `Request`.                |
| `Ari.webhooks.constructEvent(body, headers, options)`  | Checks and reads a body and headers you already have. |
| `Ari.webhooks.verifySignature(body, headers, options)` | Returns `true` or `false` without reading the event.  |
| `Ari.webhooks.createHandler(options)`                  | Creates a complete request handler.                   |
| `Ari.webhooks.generateTestHeaders(body, options)`      | Creates headers for a local test.                     |

These helpers are also available as named imports from `@hackclub/ari`.
