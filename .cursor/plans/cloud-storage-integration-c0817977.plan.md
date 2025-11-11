<!-- c0817977-ac4c-4192-b77f-87e6f1a0c214 e5af8868-c5db-4686-8c77-fd7e2472e7ea -->
# Fix Text Color Dark Mode Switching

## Problem

The problem/solution boxes are using `text-black dark:!text-white` which is causing both light and dark mode to show white text. The `!important` modifier is interfering with Tailwind's dark mode variant system.

## Solution

Remove all `!important` modifiers and use standard Tailwind classes: `text-black dark:text-white`. This matches the working pattern used by other elements on the page (like the "Capture", "Organise", "Manage" headings which use `text-foreground`).

## Changes

Update `app/page.tsx`:

- Replace `text-black dark:!text-white` with `text-black dark:text-white` for all problem/solution text in all three sections (Capture, Organise, Manage)
- Remove the `!important` modifier completely to allow Tailwind's dark mode system to work properly

## Files to modify

- `app/page.tsx` (lines 360-361, 364-365, 382-383, 386-387, 404-405, 408-409)