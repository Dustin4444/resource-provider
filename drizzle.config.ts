import { defineConfig } from 'drizzle-kit';

import { DATABASE_FILE } from 'src/config';

export default defineConfig({
	schema: './src/lib/db/schema.ts',
	out: './drizzle',
	dialect: 'sqlite',
	dbCredentials: {
		url: DATABASE_FILE
	}
});
