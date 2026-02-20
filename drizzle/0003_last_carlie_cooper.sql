CREATE TABLE `usage` (
	`account` text PRIMARY KEY NOT NULL,
	`cpu` integer DEFAULT 0 NOT NULL,
	`net` integer DEFAULT 0 NOT NULL
);
