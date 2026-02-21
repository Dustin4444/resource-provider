import { createMockFetch } from './mock-fetch';

import { runMigrations } from '$lib/db/migrate';

const originalFetch = globalThis.fetch;
globalThis.fetch = createMockFetch(originalFetch) as typeof globalThis.fetch;

runMigrations();
