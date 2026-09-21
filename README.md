# Horn Call Homies v1.0

A lightweight CLEO Redux mod for **Grand Theft Auto: San Andreas Classic** that lets CJ call nearby Families members into his group with the car horn and then leaves vehicle behavior to the game's normal homie/group AI.

## Requirements

- GTA San Andreas Classic (single-player)
- CLEO Redux 1.3+
- CLEO+

## Installation

1. Remove any older `HornCallHomies` test/build files from your `CLEO` folder.
2. Copy `HornCallHomies_v1.0.js` into the game's `CLEO` folder.
3. Start the game normally.

## How it works

While CJ is driving a normal car in free roam, press the **vehicle horn** near Families members.

- Existing Families passengers already riding in CJ's car are recruited into CJ's group first, without being forced to leave or re-enter.
- After that, the mod recruits the nearest eligible Families members on foot within **10 metres**.
- The number of recruits is limited by the car's **passenger capacity versus CJ's existing live followers**.
- A follower counts toward the limit even if they are still on foot and have not entered the car yet.
- Repeated horn presses cannot over-recruit while group members are still waiting for a seat.
- Vanilla GTA SA group AI handles running to the car, entering, choosing seats, sitting, staying in the vehicle, exiting, combat, and following CJ.
- Recruited homies remain normal members of CJ's group after the ride.

### Examples

- A coupe with 1 passenger seat and 0 followers can recruit 1 homie.
- A coupe with 1 passenger seat and 1 existing follower recruits nobody, whether that follower is inside or outside the car.
- A 4-door car with 3 passenger seats and 1 existing follower can recruit up to 2 more.
- If CJ steals a Families car with a Families passenger already sitting inside, honking recruits that passenger in-place before filling any remaining follower capacity.

## Safety / compatibility behavior

The mod does not recruit while CJ is on a mission or in an interior. It only works while CJ is the driver of a normal car and has player control.

Eligible outside recruits must be living Families members who are on foot, not swimming, not already in CJ's group, not entering/exiting another vehicle, not script-controlled, and not actively fighting or using a gun.

The mod does **not** issue its own passenger-entry task, warp peds into seats, repair passenger poses, or repeatedly force re-entry. This is intentional: GTA San Andreas' native group AI owns the actual vehicle behavior after recruitment.

## Version history

### v1.0

- First release.
- Uses vanilla CJ group recruitment for stable vehicle behavior.
- Limits new recruits using follower count versus vehicle passenger capacity.
- Treats followers still on foot as reserved passenger demand.
- Recruits existing Families passengers already in CJ's car before recruiting outside homies.
- Fresh-horn input prevents held/flickering horn state from repeatedly recruiting.
