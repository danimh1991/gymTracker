ALTER TABLE `userSettings` ADD `includeWarmupInDuration` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `userSettings` ADD `generalWarmupMinutes` integer DEFAULT 7 NOT NULL;
