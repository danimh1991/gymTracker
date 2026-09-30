CREATE TABLE `templateExercises` (
	`id` text PRIMARY KEY NOT NULL,
	`templateId` text NOT NULL,
	`exerciseId` text NOT NULL,
	`position` integer NOT NULL,
	`sets` integer NOT NULL,
	`repMin` integer NOT NULL,
	`repMax` integer NOT NULL,
	`rir` text NOT NULL,
	`optional` integer NOT NULL,
	`notes` text NOT NULL,
	`priority` text NOT NULL,
	FOREIGN KEY (`templateId`) REFERENCES `workoutTemplates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exerciseId`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `template_exercises_template` ON `templateExercises` (`templateId`);--> statement-breakpoint
CREATE TABLE `workoutTemplates` (
	`id` text PRIMARY KEY NOT NULL,
	`ownerId` text NOT NULL,
	`dayId` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `templates_owner_day` ON `workoutTemplates` (`ownerId`,`dayId`);--> statement-breakpoint
ALTER TABLE `exercises` ADD `ownerId` text;--> statement-breakpoint
ALTER TABLE `workouts` ADD `templateName` text DEFAULT '' NOT NULL;