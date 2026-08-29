# Ari.js

Your least favorite review platform at Hack Club, now in a JavaScript SDK!

> please use this SDK **ONLY ON THE SERVER SIDE**. The signing secret or the webhook secret must never be sent to a browser or placed in a public environment variable.

## Install

With Bun:

```sh
bun add @hackclub/ari
```

With npm:

```sh
npm install @hackclub/ari
```

## Send a project

Create the Ari client with the program ID and signing secret from your program settings:

```ts
import { Ari } from '@hackclub/ari';

const ari = new Ari({
	programId: process.env.ARI_PROGRAM_ID!,
	signingSecret: process.env.ARI_SIGNING_SECRET!
});

const result = await ari.ships.create({
	external_id: 'project-123',
	title: 'Example Project',
	description: 'Example project description.',
	maker: {
		email: 'example@hackclub.com',
		name: 'Example',
		slack_id: 'U1234567890'
	},
	repo_url: 'https://github.com/example/project',
	demo_url: 'https://example.com/demo',
	thumbnail_url: 'https://example.com/image.png',
	hackatime_projects: ['example-project']
});

console.log(result.id, result.status);
```

`external_id` is the project ID your own program already uses for tracking the project. Keep `result.id` too: it points to this exact submission in Ari, so it comes handy for internal tracking about it's state inside of the reviewing process.

Sending a project will also check the most common input mistakes and handles the signing Ari requires for webhooks, so you can catch up invalid data before sending it to the unified or to a reviewer.

## Check a project

Use your own project ID to get the newest submission:

```ts
const status = await ari.ships.status({ external_id: 'project-123' });

if (status.phase === 'reviewed') {
	console.log(status.decision);
}
```

Or, you can use an Ari submission ID when you need one exact submission:

```ts
const status = await ari.ships.status({ id: 'cm1234567890abcdefghijkl' });
```

## Withdraw a project

```ts
await ari.ships.withdraw('project-123');
```

A project can only be withdrawn while its review is still open.

## Receive updates from Ari

Ari can send your program a request when a review changes. This is called a webhook.

Use the webhook secret from Ari for this step. It is different from the signing secret used above for sending ships.

```ts
import { Ari } from '@hackclub/ari';

export const POST = Ari.webhooks.createHandler({
	secret: process.env.ARI_WEBHOOK_SECRET!,
	async on_event(event, context) {
		console.log(context.delivery_id, event.event);
	}
});
```

Make a `POST` route on your server for recieving webhooks from Ari. The handler works directly with a standard JavaScript `Request` and returns a standard `Response`, so have fun with that.

Ari may send the same update again if your server did not confirm the first one, so make sure to confirm it when it went through and you could process it and save it, if you had any errors during that process, just drop it with a non 2xx response code, that way Ari can repeat it in a later time.

See the [webhook guide](docs/webhooks.md) for event names and complete examples.

## Handle errors

The SDK gives you separate error types for bad input, errors, timeouts and problems Ari might present while processing something.

```ts
import { AriApiError, AriInputError } from '@hackclub/ari';

try {
	await ari.ships.status({ external_id: 'project-123' });
} catch (error) {
	if (error instanceof AriInputError) {
		console.error(error.field, error.message);
	} else if (error instanceof AriApiError) {
		console.error(error.status, error.code);
	} else {
		throw error;
	}
}
```

The SDK tries `create` and `status` again after a network issue happens, fyi, it won't try `withdraw` again automatically. If a withdrawal drops, check the project status before trying to show a result.

## More cool stuff about the SDK

- [All methods and fields](docs/api.md)
- [Receiving webhooks](docs/webhooks.md)
- [Moving existing Ari code to this SDK](docs/migration.md)
- [Guide for coding agents](AGENTS.md)
