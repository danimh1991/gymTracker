CREATE TABLE `externalActivities` (
	`id` text PRIMARY KEY NOT NULL,
	`ownerId` text NOT NULL,
	`sport` text NOT NULL,
	`date` text NOT NULL,
	`durationMinutes` integer NOT NULL,
	`distanceKm` real,
	`laps` integer,
	`elevationGainM` integer,
	`intensity` text NOT NULL,
	`notes` text NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `external_activities_owner_date` ON `externalActivities` (`ownerId`,`date`);