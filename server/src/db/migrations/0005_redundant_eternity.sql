CREATE TABLE `price_observations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`isin` text NOT NULL,
	`price` real NOT NULL,
	`observed_at` integer DEFAULT (unixepoch()) NOT NULL,
	`observed_day` text NOT NULL,
	`data_source` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `price_observations_isin_day_price_unique` ON `price_observations` (`isin`,`observed_day`,`price`);--> statement-breakpoint
CREATE INDEX `price_observations_isin_observed_at_idx` ON `price_observations` (`isin`,`observed_at`);