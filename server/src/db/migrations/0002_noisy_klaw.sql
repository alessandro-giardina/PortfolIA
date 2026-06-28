CREATE TABLE `securities` (
	`isin` text PRIMARY KEY NOT NULL,
	`name` text,
	`price` real,
	`ticker` text,
	`instrument_type` text,
	`total_annual_fees` text,
	`currency` text,
	`issuer` text,
	`segment` text,
	`dividend_policy` text,
	`fetched_at` integer DEFAULT (unixepoch()) NOT NULL
);
