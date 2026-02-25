import { beforeEach, describe, expect, it } from 'bun:test';

import { database } from '$lib/db';
import { usageDatabase } from '$lib/db/models/provider/usage';
import * as schema from '$lib/db/schema';

describe('Resource Provider (v2)', () => {
	describe('Testing Database', () => {
		beforeEach(async () => {
			await usageDatabase.resetAllUsage();
		});
		it('should be empty initially', async () => {
			const result = await usageDatabase.getUsage('eosio');
			expect(result).toEqual({ account: 'eosio', cpu: 0, net: 0 });
		});
		it('should add usage', async () => {
			await usageDatabase.incrementUsage('eosio', 100, 50);
			const result = await usageDatabase.getUsage('eosio');
			expect(result).toEqual({ account: 'eosio', cpu: 100, net: 50 });
			await usageDatabase.incrementUsage('eosio', 100, 50);
			const result2 = await usageDatabase.getUsage('eosio');
			expect(result2).toEqual({ account: 'eosio', cpu: 200, net: 100 });
		});
		it('should not count expired usage', async () => {
			const expired = Math.floor(Date.now() / 1000) - 25 * 3600;
			database
				.insert(schema.usage)
				.values({ account: 'eosio', cpu: 500, net: 500, created_at: expired })
				.run();
			await usageDatabase.incrementUsage('eosio', 100, 50);
			const result = await usageDatabase.getUsage('eosio');
			expect(result).toEqual({ account: 'eosio', cpu: 100, net: 50 });
		});
		it('should cleanup expired records', async () => {
			const expired = Math.floor(Date.now() / 1000) - 25 * 3600;
			database
				.insert(schema.usage)
				.values({ account: 'eosio', cpu: 500, net: 500, created_at: expired })
				.run();
			await usageDatabase.incrementUsage('eosio', 100, 50);
			await usageDatabase.cleanupExpired();
			const rows = database.select().from(schema.usage).all();
			expect(rows.length).toBe(1);
			expect(rows[0].cpu).toBe(100);
		});
	});
});
