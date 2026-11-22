ALTER TABLE `userSettings` ADD `equipmentProfile` text DEFAULT 'full_gym' NOT NULL;
--> statement-breakpoint
ALTER TABLE `userSettings` ADD `excludedExerciseIds` text DEFAULT '[]' NOT NULL;
