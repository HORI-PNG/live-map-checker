CREATE TABLE `fetch_pages` (
	`id` integer PRIMARY KEY NOT NULL,
	`venue_id` integer NOT NULL,
	`page_key` text NOT NULL,
	`url` text NOT NULL,
	`last_fetched_at` text,
	`last_status` text,
	`last_events_found` integer,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fetch_pages_venue_page_idx` ON `fetch_pages` (`venue_id`,`page_key`);--> statement-breakpoint
CREATE TABLE `robots_cache` (
	`host` text PRIMARY KEY NOT NULL,
	`fetched_at` text NOT NULL,
	`body` text,
	`http_status` integer
);
