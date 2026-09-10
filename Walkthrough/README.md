# Walkthrough

A LiDAR floor-plan scanner for iPhone, in the shape of magicplan: walk a
property, scan each room with the Pro camera, and leave with a measured floor
plan, a room schedule and a 3D model you can hand to someone else.

Built on Apple's [RoomPlan](https://developer.apple.com/documentation/roomplan),
which is the same class of scanner magicplan's LiDAR mode uses. RoomPlan does the
hard part — finding walls, doors, windows and furniture in a live LiDAR feed.
This app does everything around it: the walkthrough, the 2D plan, the
measurements, the paperwork.

## What it does

- **Scan room by room.** Start a walkthrough, scan a room, name it, scan the
  next. Rooms captured in one session share a coordinate space, so they can be
  merged into a single true floor plan afterwards.
- **Draw a real floor plan.** Walls at true thickness, doors with their swing,
  windows, openings, furniture footprints, per-wall dimensions, room labels with
  area, a scale bar and a north arrow.
- **Measure.** Floor area per room and for the property, perimeter, ceiling
  height, door and window counts.
- **Export.** A two-page PDF (plan + room schedule), a USDZ model, and the room
  schedule as CSV.
- **Work in feet or metres.** Everything is stored in metres and formatted at the
  last moment, so switching units never touches the geometry.

## Requirements

| | |
|---|---|
| Device | iPhone or iPad with a LiDAR scanner — iPhone 16 Pro qualifies |
| iOS | 17.0 or later |
| Xcode | 16 or later (the project uses synchronized folder groups) |

RoomPlan does not run in the Simulator. The app opens and shows saved
walkthroughs there, but the scan button is disabled.

## Building it

1. Open `Walkthrough.xcodeproj`.
2. Select the `Walkthrough` target and set your own Team under Signing &
   Capabilities.
3. Change the bundle identifier from `com.example.Walkthrough` to your own.
4. Run on the iPhone 16 Pro.

The camera usage string is generated from the build settings
(`INFOPLIST_KEY_NSCameraUsageDescription`); there is no `Info.plist` file to
edit.

## How a walkthrough goes

1. **New walkthrough** — name, address, client.
2. **Scan a room.** Point at a wall and walk the perimeter. The banner relays
   RoomPlan's coaching ("slow down", "too dark"), and the running floor area
   updates as walls are found.
3. **Finish room.** The scan processes, the 2D plan appears, and RoomPlan's own
   guess at the room type pre-fills the name — "Bedroom", then "Bedroom 2".
4. **Save & scan next room.** The AR session is deliberately *not* paused
   between rooms, which is what keeps them in one coordinate space.
5. **Finish.** The project screen merges the rooms into one plan and offers the
   exports.

## Layout of the code

```
Walkthrough/
  Model/          WalkProject, RoomRecord, and the file-backed ProjectStore
  Capture/        RoomPlan session wrapper and the scanning UI
  FloorPlan/      plan geometry, the RoomPlan adapter, and the renderer
  Export/         multi-room merge, PDF/USDZ/CSV, printable sheets
  UI/             project list, project detail, room detail
  Support/        units and settings
```

The one deliberate seam: **`FloorPlan/CapturedRoom+Plan.swift` is the only file
that knows about both RoomPlan and the app's own plan model.** Everything drawn,
measured, printed or shared goes through it. The geometry either side of that
file is plain Swift, so it can be reasoned about without a device in hand.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how a scan becomes a plan,
and what is deliberately left out.

## Status

The code is complete and structured, but it has **never been compiled or run** —
it was written in a Linux container with no Swift toolchain and no device. Treat
the first build as a bring-up: expect to fix a signature or two against the
RoomPlan SDK on your machine before it runs. The parts most worth checking first
are listed at the end of the architecture doc.
