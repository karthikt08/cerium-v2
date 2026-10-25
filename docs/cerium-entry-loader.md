# CERIUM entrance media

The workspace entrance uses `/media/cerium-entry.mp4` when it is available.
If this file is missing, unsupported or blocked, the loading screen gracefully
falls back to the existing CERIUM wordmark instead of breaking sign-in.

For local development, copy the optimized file supplied with the feature into:

    public/media/cerium-entry.mp4

The source is the user's logo_animation.mp4; the optimized version is muted,
960×540, 24 fps, with its opening logo reveal preserved. The page plays it
at 2× speed and permits skipping. It does not delay the workspace beyond the
minimum visible introduction when startup is otherwise fast.

After installing the file locally, the media can be committed with
`git add public/media/cerium-entry.mp4` and a normal Git commit.

Do not require the video asset for authentication, billing, or API access.
