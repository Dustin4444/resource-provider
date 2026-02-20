import { beforeEach, describe, expect, it } from 'bun:test';

import { usageDatabase } from '$lib/db/models/provider/usage';

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
	});
});
