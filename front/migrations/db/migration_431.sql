update user_messages
set
    "origin" = 'triggered'
from user_messages
where
    "userContextOrigin" is null
    and content not like 'Transcript%'
update user_messages
set
    "origin" = 'transcript'
where
    "userContextOrigin" is null
    and content like 'Transcript%'