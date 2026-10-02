CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `users` (`id`, `name`, `createdAt`)
SELECT `id`, 'Usuario ' || ROW_NUMBER() OVER (ORDER BY `id`), datetime('now')
FROM (
	SELECT DISTINCT substr(`ownerId`, 1, length(`ownerId`) - 5) AS `id`
	FROM `userSettings`
	WHERE `ownerId` LIKE '%:real'
);
