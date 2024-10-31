UPDATE
    users
SET
    email = LOWER(email)
WHERE
    email <> LOWER(email);