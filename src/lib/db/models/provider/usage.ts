import { eq, sql } from 'drizzle-orm';

import { database } from '$lib/db';
import { AbstractDatabase } from '$lib/db/abstract';

export interface AccountUsage {
	account: string;
	cpu: number;
	net: number;
}

export class UsageDatabase extends AbstractDatabase {
	async getUsage(account: string): Promise<AccountUsage> {
		const result = await database
			.select()
			.from(this.schema.usage)
			.where(eq(this.schema.usage.account, account))
			.limit(1);

		if (result.length === 0) {
			return { account, cpu: 0, net: 0 };
		}

		return result[0];
	}

	async incrementUsage(account: string, cpu: number, net: number): Promise<void> {
		await database
			.insert(this.schema.usage)
			.values({ account, cpu, net })
			.onConflictDoUpdate({
				target: this.schema.usage.account,
				set: {
					cpu: sql`${this.schema.usage.cpu} + ${cpu}`,
					net: sql`${this.schema.usage.net} + ${net}`
				}
			});
	}

	async resetAllUsage(): Promise<void> {
		await database.delete(this.schema.usage);
	}
}

export const usageDatabase = new UsageDatabase();
