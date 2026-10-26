CREATE TABLE `ai_searches` (
	`id` integer PRIMARY KEY NOT NULL,
	`venue_id` integer NOT NULL,
	`status` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`started_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`finished_at` text,
	`expires_at` text,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`web_search_count` integer DEFAULT 0 NOT NULL,
	`cost_usd_micros` integer DEFAULT 0 NOT NULL,
	`candidates` integer DEFAULT 0 NOT NULL,
	`verified` integer DEFAULT 0 NOT NULL,
	`error` text,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ai_searches_venue_started_idx` ON `ai_searches` (`venue_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `ai_searches_started_idx` ON `ai_searches` (`started_at`);--> statement-breakpoint
CREATE TABLE `ai_verifications` (
	`id` integer PRIMARY KEY NOT NULL,
	`ai_search_id` integer NOT NULL,
	`url` text NOT NULL,
	`http_status` integer,
	`artist_found` integer NOT NULL,
	`date_found` integer NOT NULL,
	`verdict` text NOT NULL,
	`checked_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`ai_search_id`) REFERENCES `ai_searches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ai_verifications_search_idx` ON `ai_verifications` (`ai_search_id`);--> statement-breakpoint
CREATE TABLE `classification_cache` (
	`title_hash` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`method` text NOT NULL,
	`reason` text,
	`model` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY NOT NULL,
	`venue_id` integer NOT NULL,
	`source_kind` text NOT NULL,
	`title` text NOT NULL,
	`artist_name` text,
	`artist_norm` text,
	`tour_name` text,
	`date` text NOT NULL,
	`open_time` text,
	`start_time` text,
	`detail_url` text,
	`source_url` text,
	`source_label` text,
	`category` text DEFAULT 'unknown' NOT NULL,
	`classified_by` text,
	`fingerprint` text NOT NULL,
	`ai_search_id` integer,
	`first_seen_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`last_seen_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ai_search_id`) REFERENCES `ai_searches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_fingerprint_unique` ON `events` (`fingerprint`);--> statement-breakpoint
CREATE INDEX `events_venue_date_idx` ON `events` (`venue_id`,`date`);--> statement-breakpoint
CREATE TABLE `fetch_runs` (
	`id` integer PRIMARY KEY NOT NULL,
	`venue_id` integer NOT NULL,
	`trigger` text NOT NULL,
	`started_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`finished_at` text,
	`status` text NOT NULL,
	`error_kind` text,
	`http_status` integer,
	`pages_fetched` integer DEFAULT 0 NOT NULL,
	`events_found` integer DEFAULT 0 NOT NULL,
	`events_live` integer DEFAULT 0 NOT NULL,
	`message` text,
	`scraper_version` integer,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `fetch_runs_venue_started_idx` ON `fetch_runs` (`venue_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `prefectures` (
	`id` integer PRIMARY KEY NOT NULL,
	`region_id` integer NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prefectures_slug_unique` ON `prefectures` (`slug`);--> statement-breakpoint
CREATE INDEX `prefectures_region_idx` ON `prefectures` (`region_id`);--> statement-breakpoint
CREATE TABLE `regions` (
	`id` integer PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`display_name` text NOT NULL,
	`sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `regions_slug_unique` ON `regions` (`slug`);--> statement-breakpoint
CREATE TABLE `venue_fetch_state` (
	`venue_id` integer PRIMARY KEY NOT NULL,
	`last_attempt_at` text,
	`last_success_at` text,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`last_error_kind` text,
	`last_events_found` integer,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `venue_policies` (
	`id` integer PRIMARY KEY NOT NULL,
	`venue_id` integer NOT NULL,
	`robots_url` text NOT NULL,
	`robots_result` text NOT NULL,
	`terms_url` text,
	`terms_verdict` text NOT NULL,
	`terms_quote` text,
	`checked_at` text NOT NULL,
	`checked_by` text NOT NULL,
	`note` text,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `venue_policies_venue_checked_idx` ON `venue_policies` (`venue_id`,`checked_at`);--> statement-breakpoint
CREATE TABLE `venues` (
	`id` integer PRIMARY KEY NOT NULL,
	`prefecture_id` integer NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`area` text NOT NULL,
	`official_url` text NOT NULL,
	`schedule_url` text,
	`fetch_mode` text NOT NULL,
	`scraper_key` text,
	`scraper_config` text,
	`venue_kind` text NOT NULL,
	`sort_order` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`prefecture_id`) REFERENCES `prefectures`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `venues_slug_unique` ON `venues` (`slug`);--> statement-breakpoint
CREATE INDEX `venues_prefecture_idx` ON `venues` (`prefecture_id`);