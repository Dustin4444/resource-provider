DROP TABLE `usage`;--> statement-breakpoint
CREATE TABLE `usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account` text NOT NULL,
	`cpu` integer NOT NULL,
	`net` integer NOT NULL,
	`created_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `idx_usage_account_created` ON `usage` (`account`,`created_at`);