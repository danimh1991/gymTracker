CREATE TABLE `exerciseOverrides` (
	`id` text PRIMARY KEY NOT NULL,
	`ownerId` text NOT NULL,
	`exerciseId` text NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`exerciseId`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exercise_override_owner_exercise` ON `exerciseOverrides` (`ownerId`,`exerciseId`);