CREATE TABLE `bodyWeights` (
	`id` text PRIMARY KEY NOT NULL,
	`ownerId` text NOT NULL,
	`date` text NOT NULL,
	`weightKg` real NOT NULL
);
--> statement-breakpoint
CREATE INDEX `weight_owner_date` ON `bodyWeights` (`ownerId`,`date`);--> statement-breakpoint
CREATE TABLE `days` (
	`id` text PRIMARY KEY NOT NULL,
	`routineId` text NOT NULL,
	`title` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`routineId`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`shortName` text NOT NULL,
	`type` text NOT NULL,
	`movementPattern` text NOT NULL,
	`primaryMuscles` text NOT NULL,
	`secondaryMuscles` text NOT NULL,
	`equipment` text NOT NULL,
	`metricType` text NOT NULL,
	`bodyweightExercise` integer NOT NULL,
	`supportsAssistance` integer NOT NULL,
	`supportsAddedWeight` integer NOT NULL,
	`defaultRepMin` integer NOT NULL,
	`defaultRepMax` integer NOT NULL,
	`defaultRIR` text NOT NULL,
	`notes` text NOT NULL,
	`enabled` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`ownerId` text NOT NULL,
	`name` text NOT NULL,
	`exerciseId` text NOT NULL,
	`metric` text NOT NULL,
	`target` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `personalRecords` (
	`id` text PRIMARY KEY NOT NULL,
	`ownerId` text NOT NULL,
	`exerciseId` text NOT NULL,
	`setId` text,
	`metric` text NOT NULL,
	`value` real NOT NULL,
	`achievedAt` text NOT NULL,
	FOREIGN KEY (`exerciseId`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`setId`) REFERENCES `workoutSets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `routineExercises` (
	`id` text PRIMARY KEY NOT NULL,
	`dayId` text NOT NULL,
	`exerciseId` text NOT NULL,
	`position` integer NOT NULL,
	`sets` integer NOT NULL,
	`repMin` integer NOT NULL,
	`repMax` integer NOT NULL,
	`rir` text NOT NULL,
	`optional` integer NOT NULL,
	`notes` text NOT NULL,
	`priority` text NOT NULL,
	FOREIGN KEY (`dayId`) REFERENCES `days`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exerciseId`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `routines` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `skillLogs` (
	`id` text PRIMARY KEY NOT NULL,
	`ownerId` text NOT NULL,
	`progressionId` text NOT NULL,
	`date` text NOT NULL,
	`reps` integer,
	`durationSeconds` real,
	`notes` text NOT NULL,
	FOREIGN KEY (`progressionId`) REFERENCES `skillProgressions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `skillProgressions` (
	`id` text PRIMARY KEY NOT NULL,
	`skillId` text NOT NULL,
	`name` text NOT NULL,
	`level` integer NOT NULL,
	FOREIGN KEY (`skillId`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `skills` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workoutExercises` (
	`id` text PRIMARY KEY NOT NULL,
	`workoutId` text NOT NULL,
	`dayId` text NOT NULL,
	`exerciseId` text NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`sets` integer NOT NULL,
	`repMin` integer NOT NULL,
	`repMax` integer NOT NULL,
	`rir` text NOT NULL,
	`optional` integer NOT NULL,
	`notes` text NOT NULL,
	`priority` text NOT NULL,
	`metricType` text NOT NULL,
	`bodyweightExercise` integer NOT NULL,
	`supportsAssistance` integer NOT NULL,
	`supportsAddedWeight` integer NOT NULL,
	`variant` text NOT NULL,
	FOREIGN KEY (`workoutId`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exerciseId`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `we_workout` ON `workoutExercises` (`workoutId`);--> statement-breakpoint
CREATE TABLE `workoutSets` (
	`id` text PRIMARY KEY NOT NULL,
	`workoutId` text NOT NULL,
	`workoutExerciseId` text NOT NULL,
	`exerciseId` text NOT NULL,
	`setNumber` integer NOT NULL,
	`reps` integer,
	`weight` real,
	`bodyweight` real,
	`assistanceWeight` real,
	`addedWeight` real,
	`RIR` integer,
	`RPE` real,
	`durationSeconds` real,
	`distance` real,
	`notes` text NOT NULL,
	`completed` integer NOT NULL,
	`timestamp` text NOT NULL,
	FOREIGN KEY (`workoutId`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workoutExerciseId`) REFERENCES `workoutExercises`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exerciseId`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_set` ON `workoutSets` (`workoutExerciseId`,`setNumber`);--> statement-breakpoint
CREATE INDEX `sets_workout` ON `workoutSets` (`workoutId`);--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`ownerId` text NOT NULL,
	`dayId` text NOT NULL,
	`status` text NOT NULL,
	`startedAt` text NOT NULL,
	`finishedAt` text,
	`bodyweight` real,
	`notes` text NOT NULL,
	FOREIGN KEY (`dayId`) REFERENCES `days`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_active_per_owner` ON `workouts` (`ownerId`) WHERE "workouts"."status" = 'active';--> statement-breakpoint
CREATE INDEX `workouts_owner_date` ON `workouts` (`ownerId`,`startedAt`);