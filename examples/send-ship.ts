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

console.log(result);
