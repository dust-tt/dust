// This is a virtual Google Drive Id used in our code base to represent the "user space".
// This is different from the "My Drive" space, which is an actual Drive.
// For example, "Shared with me" items live in this space, for the currently authenticated user.
// We use this ID locally in place of a real google drive ID.
// This id is stored in the GoogleDriveSyncToken table in the "driveId" column.
// Please note that a file "shared with me" could live in an actual drive (e.g. "My Drive") of the user who shared it.
export const GOOGLE_DRIVE_USER_SPACE_VIRTUAL_DRIVE_ID = "userspace";

// "Shared with me" files have a null file.parent field on Gdrive,
// and a "sharedWithMe=true" property.
// On our side, we want to group them into one virtual folder in our UI. This is the ID of that virtual folder.
export const GOOGLE_DRIVE_SHARED_WITH_ME_VIRTUAL_ID = "sharedWithMe";
