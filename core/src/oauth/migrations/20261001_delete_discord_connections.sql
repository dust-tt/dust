-- Discord bot is removed. Drop leftover OAuth rows so they are not deserialized as an unknown provider.
DELETE FROM connections
WHERE provider = 'discord';

DELETE FROM credentials
WHERE provider = 'discord';
