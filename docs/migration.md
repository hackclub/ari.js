# Moving existing Ari code to this SDK

Use this guide if your program already calls Ari with `fetch` and has its own code for signing
requests.

The SDK uses the same field names as Ari, including names such as `external_id` and `repo_url`. In
most programs, you can keep the project object you already build.

## Start the client

Create one server-side Ari client:

```ts
import { Ari } from '@hackclub/ari';

const ari = new Ari({
	programId: process.env.ARI_PROGRAM_ID!,
	signingSecret: process.env.ARI_SIGNING_SECRET!
});
```

## Send projects

Replace your `fetch` and request-signing code with:

```ts
const result = await ari.ships.create(project);
```

Keep `result.id`. It identifies this exact Ari submission.

## Check status

To find the newest submission for a project:

```ts
await ari.ships.status({ external_id: 'project-123' });
```

To find one exact submission:

```ts
await ari.ships.status({ id: 'cm1234567890abcdefghijkl' });
```

## Withdraw projects

Replace your withdrawal request with:

```ts
await ari.ships.withdraw('project-123');
```

The SDK does not try a withdrawal again automatically. If the connection fails after you send it,
call `ships.status()` before deciding what to show the user.

## Receive review updates

Remove your old webhook-checking code and give the original request to the SDK:

```ts
const delivery = await Ari.webhooks.unwrap(request, {
	secret: process.env.ARI_WEBHOOK_SECRET!
});
```

Use `delivery.delivery_id` to avoid handling the same request twice. Do not use
`delivery.event.id`; that is the Ari submission ID and can appear in several different events.

## Keep the two secrets separate

The signing secret is for requests your program sends to Ari. The webhook secret is for requests Ari sends to your program.

```dotenv
ARI_SIGNING_SECRET=whsec_example_signing
ARI_WEBHOOK_SECRET=whsec_example_webhook
```

Please PLEASE PLEASE, replace a secret if the old code printed it in logs, sent it to a browser, or included it in an error report.
