# How a scan becomes a floor plan

## The pipeline

```
LiDAR + camera
      │
      ▼
RoomCaptureSession ──► CapturedRoomData   (raw, kept on disk for merging)
      │
      ▼
CapturedRoom          (walls, doors, windows, openings, objects, floors)
      │
      │  RoomPlanFlattener  ← the only place RoomPlan and the plan model meet
      ▼
FloorPlanData         (Codable 2D geometry: segments, openings, footprints)
      │
      ├──► FloorPlanCanvas  ──► screen, thumbnails, PDF
      ├──► area / perimeter ──► room schedule, CSV
      └──► CapturedRoom.export ──► USDZ
```

`FloorPlanData` is cached inside `project.json`. That is what makes the project
list instant: drawing a room never decodes a scan. The scans stay on disk and are
read back only for exporting 3D and for merging.

## Flattening 3D to 2D

RoomPlan returns each surface as a 4×4 transform, a size, and a category. A wall
becomes a line on the ground plane:

- **centre** = the transform's translation column
- **direction** = the transform's normalised local x axis
- **endpoints** = centre ± direction × (width / 2)
- **plan coordinates** = the world x and z of those endpoints

Plan space is metres, x east, y south. Screen space flips y so north points up.

Doors, windows and openings are the same calculation. They are drawn by erasing
the wall underneath them and re-drawing in their own notation: a window as a thin
line, a door as a leaf plus its quarter-circle swing.

Objects use the transform's x and z axes for a rotated footprint rectangle. The
rotation is snapped to a right angle when it is within three degrees of one,
because a hand-held scan is never quite square and a plan that is one degree off
reads as sloppy.

## Two places the code is deliberately defensive

**Floor polygons.** RoomPlan gives a floor outline for most scans. Its corners
are documented as local to the surface, and reading them as world coordinates
instead is a one-line difference that would silently draw the room in the wrong
place. Rather than bet on one reading, `RoomPlanFlattener` builds both, scores
each on how far it lands from the walls and how far its area strays from theirs,
and keeps the better one. If neither lands on the walls, the convex hull of the
wall endpoints is used instead. Area then comes from the shoelace formula over
whichever outline won.

**Framework enums read as text.** Room types and object categories are matched
from `String(describing:)` rather than by pattern-matching the framework's enum
cases. A new category in a future iOS release becomes `.unknown` instead of
breaking the build.

## Multi-room

The interesting constraint: rooms are only mergeable if they were captured in the
same AR world coordinate space. So `CaptureController.finishRoom()` calls
`stop(pauseARSession: false)` — the room capture ends, the AR session keeps
tracking, and the next room lands in the same space as the last one.

`StructureAssembler` then has two paths:

1. **Every room still has its raw `CapturedRoomData`** → RoomPlan's
   `StructureBuilder` merges them. Shared walls line up, doors connect. This is a
   true plan.
2. **Anything is missing** → the rooms are laid out on a grid at true scale, and
   the result is labelled as an arrangement, on screen and on the printed page.

The second path exists because a plan that quietly invents where rooms sit is
worse than one that admits it doesn't know. Per-room areas are correct either
way; only the relative placement is unknown.

Property totals sum the per-room areas rather than measuring the merged outline,
so the headline number does not shift when a merge is recomputed.

## Rendering once

`FloorPlanCanvas` is a pure SwiftUI `Canvas`: no state, no gestures. It backs the
64-point thumbnail on a project card, the full-screen plan, and the PDF page.
`FloorPlanView` adds pinch, pan and double-tap-to-fit on top without duplicating
any drawing, and `PlanSheet` wraps it in a title block for print. The PDF is
produced with `ImageRenderer` drawing into a `CGContext`, so the plan stays
vector rather than being rasterised.

`FloorPlanStyle` carries the three looks — `.preview`, `.detail`, `.print`. The
print style is fixed black-on-white on purpose: a PDF has no dark mode.

## What is deliberately not here

- **Editing the plan.** You cannot drag a wall, split a room, or correct a
  mis-detected door. This is the largest gap against magicplan, and it needs an
  editable geometry model with undo, not a patch to the renderer.
- **Photos and annotations** pinned to rooms.
- **Cloud sync, accounts, sharing links.** Everything is on the device.
- **Furniture symbols.** Objects are drawn as footprints with an SF Symbol, not
  as drafted furniture blocks.
- **Multi-storey.** RoomPlan reports a story index per section; the app ignores
  it and treats a walkthrough as one floor.

## Worth checking on first build

This code has not been compiled. Where it is most likely to need a nudge against
the real SDK:

1. `CapturedRoomData` being `Codable` — `ProjectStore` encodes it to JSON so
   rooms can be merged later. If the SDK disagrees, drop the raw-data write and
   the app still works; it just loses true multi-room merging.
2. `RoomCaptureSession.Instruction` case names in `CaptureController`.
3. `stop(pauseARSession:)`, which is iOS 17 and up.
4. `CapturedRoom.Surface.polygonCorners` and `CapturedRoom.floors`, both iOS 17.
5. The `exportOptions:` label on `export(to:)` for `CapturedRoom` and
   `CapturedStructure`.
