import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('accounts', {
	account: text('account').primaryKey(),
	min_ms: integer('min_ms').notNull(),
	min_kb: integer('min_kb').notNull(),
	inc_ms: integer('inc_ms').notNull(),
	inc_kb: integer('inc_kb').notNull(),
	max_fee: text('max_fee').notNull()
});

export const contracts = sqliteTable('contracts', {
	contract: text('contract').primaryKey(),
	abi: text('abi').notNull()
});

export const manager = sqliteTable('manager', {
	account: text('account').primaryKey(),
	permission: text('permission').notNull(),
	key: text('key').notNull()
});

export const usage = sqliteTable('usage', {
	account: text('account').primaryKey(),
	cpu: integer('cpu').notNull().default(0),
	net: integer('net').notNull().default(0)
});
