CREATE TABLE `positions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`portfolio_id` integer NOT NULL,
	`isin` text NOT NULL,
	`load_date` text NOT NULL,
	`load_price` real NOT NULL,
	`quantity` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`portfolio_id`) REFERENCES `portfolios`(`id`) ON UPDATE no action ON DELETE cascade
);
