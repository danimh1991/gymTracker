CREATE TABLE `userSettings` (
	`ownerId` text PRIMARY KEY NOT NULL,
	`trainingDays` integer DEFAULT 3 NOT NULL
);
