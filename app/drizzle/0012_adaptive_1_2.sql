ALTER TABLE `userSettings` ADD `defaultTrainingLocation` text DEFAULT 'gym' NOT NULL;
--> statement-breakpoint
ALTER TABLE `userSettings` ADD `locationEquipmentOverrides` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE `userSettings` ADD `customEquipmentProfiles` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `workouts` ADD `trainingLocation` text;
--> statement-breakpoint
ALTER TABLE `workouts` ADD `sessionModality` text;
--> statement-breakpoint
ALTER TABLE `workouts` ADD `muscleFocus` text;
--> statement-breakpoint
ALTER TABLE `workouts` ADD `equipmentProfileVersion` text;
