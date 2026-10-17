# Cursor Closet

A Chrome extension for uploading your own cursor designs and switching between them on any website.

Each **set** has three states:

| State   | When it shows                                     | Required |
| ------- | ------------------------------------------------- | -------- |
| Default | Everywhere                                        | Yes      |
| Hover   | Over links, buttons, and anything clickable       | No (uses Default) |
| Click   | While the mouse button is held down               | No       |

## Install (unpacked)

1. Open `chrome://extensions` (also works in Arc, Brave and Edge).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose this `cursor-closet` folder.
4. Pin the extension from the puzzle-piece menu so it's always in the toolbar.

## Use it

- **Toolbar popup**: switch sets with one click, or turn custom cursors off.
- **Manage sets** (or right-click the icon → Options) opens your closet. Click a set to use it on every site. Each set also has:
  - **View**: opens the set in a pop-up where you can re-upload images, click the preview to set the **hotspot** (the exact pixel that does the clicking), pick a size, choose whether text fields keep the normal I-beam, try it in the test area, or delete the set.
  - **Export**: saves the set as a `.json` file to back up or share.
- **Import** (next to **+ New set**) loads a set someone exported.
- `samples/` has three SVGs you can use to try uploading.

## Design tips

- Export at **32 × 32** for a normal-sized cursor. SVGs stay sharp at every size; PNGs look best when exported at 64 × 64 or larger.
- Leave a little transparent padding so the outline isn't clipped.
- Chrome supports cursors up to 128px, but anything over 32px switches back to the normal arrow near the edges of the window. That's a Chrome rule, not a bug.

## Limits

- Only works on web pages. It can't change the cursor on Chrome's own pages (`chrome://…`, the Chrome Web Store, the new tab page) or in Chrome's tab bar and menus.
- Cursors that have a job, like resize handles, drag/grab, "not allowed" and loading, stay native. That's on purpose.
- Images are rendered at 1x and 2x, so they stay crisp on Retina screens.
