https://www.reddit.com/r/google/comments/300kf0/calendar_changes_to_start_datetime_automatically/
Post back once done?

## TODO?
- snapping?
- recurrant event: which to modify
- better UX to see change (without reloading)
- Modifying event with end time not on 15-min-increment (ex: 11:05) will round when saving. Expected bahavior (or):
  1. start time snaps to 15, end unchanged (becomes 9-10:01) preserves even start times
  2. start time snaps to 15 + ending offset (becomes 9:01-10:01) preserves even duration


## Unrelated features
- Copy one to calendar (hijack ... copy to ___ menu)
- More precision for dragging start/end
- Option to don't move end time when editing in full-screen menu
