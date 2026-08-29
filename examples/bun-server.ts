import { Ari } from '@hackclub/ari';

const ariWebhook = Ari.webhooks.createHandler({
	secret: process.env.ARI_WEBHOOK_SECRET!,
	async on_event(event, context) {
		console.log(context.delivery_id, event.event);
	}
});

Bun.serve({
	port: 3000,
	routes: {
		'/webhooks/ari': {
			POST: ariWebhook
		}
	}
});
