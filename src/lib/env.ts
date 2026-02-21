import envExample from '../../.env.example' with { type: 'text' };

import { generalLog } from './logger';

export async function createEnvironmentalFile() {
	const path = './.env';
	const file = Bun.file(path);

	const exists = await file.exists();

	if (exists) {
		generalLog.warn(`Configuration file already exists, skipping.`);
		process.exit();
	}

	await Bun.write(path, envExample);
}
