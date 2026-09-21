/*
 * Horn Call Homies - CLEO Redux v1.0
 * GTA San Andreas Classic, single-player; CLEO Redux 1.3+ and CLEO+.
 * Install this one file in CLEO. Remove older HornCallHomies builds first.
 *
 * Release behavior:
 *  - a fresh horn press recruits nearby Families members into CJ's REAL group;
 *  - NO TASK_ENTER_CAR_AS_PASSENGER is issued by this script;
 *  - NO script/mission-ped ownership is taken;
 *  - NO stay-in-car flag, seat reservation, pose repair, warp, or re-entry logic;
 *  - GTA San Andreas' normal player-group AI handles movement, vehicle entry,
 *    passenger seating, staying in the car, exiting, combat, and following CJ;
 *  - recruits remain normal group members after the ride;
 *  - existing Families passengers already riding in CJ's car are recruited first;
 *  - seat demand is reserved immediately for existing/recent group members, so
 *    repeated horn presses cannot recruit more homies than the car can carry.
 *
 */

const DEBUG = false;
const CALL_RADIUS = 10.0;
const CHECK_INTERVAL_MS = 100;
const HORN_REARM_MS = 300;
const FAMILIES_PED_TYPE = 8;
const MAX_SCAN_STEPS = 4096;
const MAX_PASSENGER_SLOTS = 8;

let hornArmed = true;
let hornUpSince = -1;
let lastCheckAt = -CHECK_INTERVAL_MS;

function debug(message) {
    if (DEBUG) log('[HornCallHomies] ' + message);
}

function exists(ped) {
    return Number.isInteger(ped) && ped >= 0 && native('DOES_CHAR_EXIST', ped);
}

function vehicleExists(car) {
    return Number.isInteger(car) && car >= 0 && native('DOES_VEHICLE_EXIST', car);
}

function distanceSquared(a, b) {
    const x = a.x - b.x;
    const y = a.y - b.y;
    const z = a.z - b.z;
    return x * x + y * y + z * z;
}

function isReacting(ped) {
    return native('IS_CHAR_FIGHTING', ped) || native('IS_CHAR_USING_GUN', ped);
}

function drivingContext(playing) {
    if (!playing || ONMISSION || !native('IS_PLAYER_CONTROL_ON', 0)) return null;

    const cj = native('GET_PLAYER_CHAR', 0);
    if (!exists(cj) || native('IS_CHAR_DEAD', cj)) return null;
    if (native('GET_CHAR_AREA_VISIBLE', cj) !== 0) return null;
    if (!native('IS_CHAR_IN_ANY_CAR', cj)) return null;

    const car = native('STORE_CAR_CHAR_IS_IN_NO_SAVE', cj);
    if (!vehicleExists(car) || native('IS_CAR_DEAD', car)) return null;
    if (native('GET_DRIVER_OF_CAR', car) !== cj) return null;
    if (!native('IS_THIS_MODEL_A_CAR', native('GET_CAR_MODEL', car))) return null;

    return {
        cj,
        car,
        group: native('GET_PLAYER_GROUP', 0)
    };
}

function passengerCapacity(car) {
    const count = native('GET_MAXIMUM_NUMBER_OF_PASSENGERS', car);
    if (!Number.isInteger(count) || count <= 0) return 0;
    return Math.min(count, MAX_PASSENGER_SLOTS);
}

function passengerOccupants(car) {
    const occupants = new Set();
    const capacity = passengerCapacity(car);

    for (let seat = 0; seat < capacity; seat++) {
        const ped = native('GET_CHAR_IN_CAR_PASSENGER_SEAT', car, seat);
        if (Number.isInteger(ped) && ped >= 0 && exists(ped)) occupants.add(ped);
    }

    return occupants;
}


function countLiveGroupMembers(ctx) {
    let count = 0;
    const seen = new Set();
    let progress = 0;

    for (let step = 0; step < MAX_SCAN_STEPS; step++) {
        const result = native('GET_ANY_CHAR_NO_SAVE_RECURSIVE', progress);
        if (!result || typeof result !== 'object') break;
        if (!Number.isInteger(result.progress) || result.progress <= progress) break;
        progress = result.progress;

        const ped = result.anyChar;
        if (!Number.isInteger(ped) || ped < 0) break;
        if (ped === ctx.cj || seen.has(ped)) continue;
        seen.add(ped);

        if (!exists(ped) || native('IS_CHAR_DEAD', ped)) continue;
        if (native('IS_GROUP_MEMBER', ped, ctx.group)) count++;
    }

    return count;
}

function recruitFamiliesAlreadyInCar(ctx) {
    const capacity = passengerCapacity(ctx.car);
    if (capacity <= 0) return 0;

    // The user's rule is follower-count vs passenger-capacity. Existing group
    // members reserve places even if they are currently on foot, so do not add
    // an in-car passenger if that would push the group above this car's capacity.
    let followerRoom = Math.max(0, capacity - countLiveGroupMembers(ctx));
    if (followerRoom <= 0) return 0;

    let recruited = 0;

    for (let seat = 0; seat < capacity && followerRoom > 0; seat++) {
        const ped = native('GET_CHAR_IN_CAR_PASSENGER_SEAT', ctx.car, seat);
        if (!Number.isInteger(ped) || ped < 0 || !exists(ped)) continue;
        if (native('IS_CHAR_DEAD', ped)) continue;
        if (native('GET_PED_TYPE', ped) !== FAMILIES_PED_TYPE) continue;
        if (native('IS_GROUP_MEMBER', ped, ctx.group)) continue;
        if (native('IS_CHAR_SCRIPT_CONTROLLED', ped)) continue;

        native('SET_GROUP_MEMBER', ctx.group, ped);

        if (native('IS_GROUP_MEMBER', ped, ctx.group)) {
            recruited++;
            followerRoom--;
            debug('IN-CAR RECRUIT SUCCESS ped ' + ped + ' from passenger seat ' + seat +
                ': already riding with CJ, now added to CJ group in-place.');
        } else {
            debug('IN-CAR RECRUIT FAILED ped ' + ped + ' from passenger seat ' + seat +
                ': SET_GROUP_MEMBER did not stick.');
        }
    }

    return recruited;
}

function groupMembersWaitingForSeat(ctx, occupants) {
    let waiting = 0;
    const seen = new Set();
    let progress = 0;

    for (let step = 0; step < MAX_SCAN_STEPS; step++) {
        const result = native('GET_ANY_CHAR_NO_SAVE_RECURSIVE', progress);
        if (!result || typeof result !== 'object') break;
        if (!Number.isInteger(result.progress) || result.progress <= progress) break;
        progress = result.progress;

        const ped = result.anyChar;
        if (!Number.isInteger(ped) || ped < 0) break;
        if (ped === ctx.cj || seen.has(ped)) continue;
        seen.add(ped);

        if (!exists(ped) || native('IS_CHAR_DEAD', ped)) continue;
        if (!native('IS_GROUP_MEMBER', ped, ctx.group)) continue;

        // Anyone already occupying one of CJ's passenger slots is already
        // accounted for by the occupied-seat count. Every other live group
        // member reserves one passenger place because vanilla group AI may
        // send them to CJ's car at any moment.
        if (!occupants.has(ped)) waiting++;
    }

    return waiting;
}

function availableRecruitSeats(ctx) {
    const capacity = passengerCapacity(ctx.car);
    if (capacity <= 0) return {available: 0, capacity: 0, occupied: 0, waiting: 0};

    const occupants = passengerOccupants(ctx.car);
    const occupied = occupants.size;
    const waiting = groupMembersWaitingForSeat(ctx, occupants);
    const available = Math.max(0, capacity - occupied - waiting);

    return {available, capacity, occupied, waiting};
}

function canRecruit(ped, ctx, origin) {
    if (ped === ctx.cj || !exists(ped)) return false;
    if (native('IS_CHAR_DEAD', ped) || native('GET_PED_TYPE', ped) !== FAMILIES_PED_TYPE) return false;
    if (!native('IS_CHAR_ON_FOOT', ped) || native('IS_CHAR_IN_ANY_CAR', ped)) return false;
    if (native('IS_CHAR_ENTERING_ANY_CAR', ped) || native('IS_CHAR_EXITING_ANY_CAR', ped)) return false;
    if (native('IS_CHAR_SCRIPT_CONTROLLED', ped)) return false;
    if (native('IS_GROUP_MEMBER', ped, ctx.group)) return false;
    if (native('GET_CHAR_AREA_VISIBLE', ped) !== 0 || native('IS_CHAR_SWIMMING', ped)) return false;
    if (isReacting(ped)) return false;

    return distanceSquared(origin, native('GET_CHAR_COORDINATES', ped)) <= CALL_RADIUS * CALL_RADIUS;
}

function nearbyCandidates(ctx) {
    const origin = native('GET_CHAR_COORDINATES', ctx.cj);
    const candidates = [];
    const seen = new Set();
    let progress = 0;

    for (let step = 0; step < MAX_SCAN_STEPS; step++) {
        const result = native('GET_ANY_CHAR_NO_SAVE_RECURSIVE', progress);
        if (!result || typeof result !== 'object') break;
        if (!Number.isInteger(result.progress) || result.progress <= progress) break;
        progress = result.progress;

        const ped = result.anyChar;
        if (!Number.isInteger(ped) || ped < 0) break;
        if (seen.has(ped)) continue;
        seen.add(ped);

        if (canRecruit(ped, ctx, origin)) {
            candidates.push({
                ped,
                distance: distanceSquared(origin, native('GET_CHAR_COORDINATES', ped))
            });
        }
    }

    candidates.sort((a, b) => a.distance - b.distance || a.ped - b.ped);
    return candidates;
}

function recruitForRide(ctx) {
    // Let vanilla group AI own everything. First adopt any eligible Families
    // passengers who are already sitting in CJ's current car, then work out
    // whether there is room for additional outside homies.
    native('SET_GROUP_FOLLOW_STATUS', ctx.group, true);
    const adoptedInCar = recruitFamiliesAlreadyInCar(ctx);

    const seats = availableRecruitSeats(ctx);
    if (seats.available <= 0) {
        if (adoptedInCar > 0) {
            debug('Horn adopted ' + adoptedInCar + ' existing Families passenger(s); no room remains for outside recruits. capacity=' +
                seats.capacity + ' occupied=' + seats.occupied + ' groupWaiting=' + seats.waiting + '.');
        } else {
            debug('Honk: no unreserved passenger place. capacity=' + seats.capacity +
                ' occupied=' + seats.occupied + ' groupWaiting=' + seats.waiting + '.');
        }
        return;
    }

    const candidates = nearbyCandidates(ctx);
    if (candidates.length === 0) {
        if (adoptedInCar > 0) {
            debug('Horn adopted ' + adoptedInCar + ' existing Families passenger(s); no eligible outside Families member within ' +
                CALL_RADIUS + ' metres.');
        } else {
            debug('Honk: no eligible Families member within ' + CALL_RADIUS + ' metres.');
        }
        return;
    }

    let recruited = 0;
    const origin = native('GET_CHAR_COORDINATES', ctx.cj);

    // Candidates are distance-sorted, so the first eligible homies reserve
    // the available places. Keep trying later candidates only if recruitment
    // itself fails; never exceed the calculated passenger demand.
    for (let i = 0; i < candidates.length && recruited < seats.available; i++) {
        const ped = candidates[i].ped;
        if (!canRecruit(ped, ctx, origin)) continue;

        // 0631: group first, character second.
        native('SET_GROUP_MEMBER', ctx.group, ped);

        if (native('IS_GROUP_MEMBER', ped, ctx.group)) {
            recruited++;
            debug('RECRUIT SUCCESS ped ' + ped + ' (' + recruited + '/' + seats.available +
                ' reserved place(s)): vanilla group AI owns vehicle behavior.');
        } else {
            debug('RECRUIT FAILED ped ' + ped + ': SET_GROUP_MEMBER did not stick.');
        }
    }

    if (recruited > 0) {
        debug('Horn recruited ' + recruited + ' outside homie(s)' +
            (adoptedInCar > 0 ? ' after adopting ' + adoptedInCar + ' existing passenger(s)' : '') +
            '. capacity=' + seats.capacity + ' occupied=' + seats.occupied +
            ' alreadyWaiting=' + seats.waiting + ' newlyReserved=' + recruited +
            '. No enter-car tasks issued.');
    }
}

function tick() {
    const playing = native('IS_PLAYER_PLAYING', 0);
    const now = native('GET_GAME_TIMER');
    const hornDown = playing && native('IS_PLAYER_PRESSING_HORN', 0);
    let freshHonk = false;

    if (hornDown) {
        if (hornArmed) {
            freshHonk = true;
            hornArmed = false;
        }
        hornUpSince = -1;
    } else if (!hornArmed) {
        if (hornUpSince < 0) hornUpSince = now;
        else if (now - hornUpSince >= HORN_REARM_MS) hornArmed = true;
    }

    if (!freshHonk) return;
    if (now >= lastCheckAt && now - lastCheckAt < CHECK_INTERVAL_MS) return;
    lastCheckAt = now;

    const ctx = drivingContext(playing);
    if (ctx) recruitForRide(ctx);
}

if (HOST !== 'sa') exit('Horn Call Homies v1.0 is for GTA San Andreas Classic only.');
log('[HornCallHomies] v1.0 loaded. Existing Families passengers join first + follower/capacity reservations + vanilla group vehicle AI.');
while (true) {
    wait(0);
    tick();
}
