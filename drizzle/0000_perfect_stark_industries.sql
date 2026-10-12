CREATE TABLE `dictionary` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`language` text NOT NULL,
	`word` text NOT NULL,
	`word_key` text NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dictionary_language_word_key_unique` ON `dictionary` (`language`,`word_key`);--> statement-breakpoint
CREATE TABLE `usage_daily` (
	`date` text PRIMARY KEY NOT NULL,
	`images` integer DEFAULT 0 NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL
);
