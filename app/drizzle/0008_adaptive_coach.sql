ALTER TABLE `userSettings` ADD `adaptiveEnabled` integer DEFAULT 1 NOT NULL;
ALTER TABLE `userSettings` ADD `defaultDurationMinutes` integer DEFAULT 50 NOT NULL;
ALTER TABLE `userSettings` ADD `usualFrequency` integer DEFAULT 2 NOT NULL;
ALTER TABLE `userSettings` ADD `variationLevel` integer DEFAULT 2 NOT NULL;
ALTER TABLE `userSettings` ADD `priorities` text DEFAULT '{}' NOT NULL;
ALTER TABLE `userSettings` ADD `exercisePreferences` text DEFAULT '{}' NOT NULL;
ALTER TABLE `userSettings` ADD `availableEquipment` text DEFAULT '[]' NOT NULL;
CREATE TABLE `adaptiveProposals` (
  `id` text PRIMARY KEY NOT NULL,
  `ownerId` text NOT NULL,
  `status` text NOT NULL,
  `createdAt` text NOT NULL,
  `updatedAt` text NOT NULL,
  `constraintsJson` text NOT NULL,
  `contextJson` text NOT NULL,
  `originalPlanJson` text NOT NULL,
  `currentPlanJson` text NOT NULL,
  `rationaleJson` text NOT NULL,
  `rulesVersion` text NOT NULL,
  `source` text NOT NULL,
  `latencyMs` integer,
  `errorCode` text
);
CREATE INDEX `adaptive_proposals_owner_created` ON `adaptiveProposals` (`ownerId`,`createdAt`);
ALTER TABLE `workouts` ADD `sessionType` text DEFAULT 'legacy' NOT NULL;
ALTER TABLE `workouts` ADD `proposalId` text REFERENCES adaptiveProposals(id);
UPDATE `workouts` SET `sessionType`=CASE WHEN `dayId`='G' THEN 'legacy' WHEN `isFreeDay`=1 THEN 'manual' ELSE 'template' END;
