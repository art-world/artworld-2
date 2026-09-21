// Named camera moves. Each is a pure function of elapsed seconds and the
// room's measured dimensions, so any move replays identically. No hand-flown
// one-off camera code.
//
// Room space: the projection is at z = 0 and the room runs back to
// room.depth. x is across the room, centred on 0. y is up from the floor.
//
// Distances are in metres, not fractions of the room, because the room is
// 46m long and a fraction of that is never the shot you want. Every move is
// clamped to the room at the end, so a shorter room still works.

const EYE = 1.62;

// Smooth, non-repeating drift. Never lands on the same frame twice.
function wander(t, seed){
  return Math.sin(t * 0.22 + seed) * 0.62
       + Math.sin(t * 0.095 + seed * 2.3) * 0.32
       + Math.sin(t * 0.04 + seed * 5.1) * 0.12;
}

// Handheld float, present in every move so nothing is ever locked off.
function float(t){
  return {
    x: Math.sin(t * 0.61) * 0.012 + Math.sin(t * 1.43) * 0.005,
    y: Math.sin(t * 0.47 + 1.1) * 0.014 + Math.sin(t * 1.77) * 0.004,
  };
}

// 0..1, one full pass every `period` seconds.
const cycle = (t, period) => (1 - Math.cos((t / period) * Math.PI * 2)) * 0.5;

const MOVES = {
  // Down the room toward the projection, and back out. The long shot.
  approach(t, room){
    const u = cycle(t, 125);
    return {
      pos: [wander(t, 0.4) * room.halfWidth * 0.3, EYE + wander(t, 3.2) * 0.12, room.at(9 + u * 23)],
      look: [wander(t, 1.9) * room.halfWidth * 0.16, EYE * 0.95, 0],
      fov: 48 - u * 5,
    };
  },

  // Sideways across the room, projection always in frame.
  drift(t, room){
    const x = Math.sin(t * 0.075) * room.halfWidth * 0.76;
    return {
      pos: [x, EYE + 0.2 + wander(t, 2.1) * 0.1, room.at(11.5 + wander(t, 0.9) * 3.4)],
      look: [x * 0.15, EYE * 0.92, 0],
      fov: 54,
    };
  },

  // An arc around the figure, which stands between the camera and the wall.
  orbit(t, room){
    const cz = room.figure;
    const a = Math.sin(t * 0.062) * 1.3;
    const r = 5.0 + Math.sin(t * 0.038) * 1.6;
    return {
      pos: [Math.sin(a) * r, EYE + 0.05 + Math.sin(t * 0.09) * 0.2, room.at(cz + Math.cos(a) * r)],
      look: [0, EYE * 0.85, room.at(cz * 0.5)],
      fov: 46,
    };
  },

  // Up off the floor to above head height, tipping toward the wall.
  rise(t, room){
    const u = cycle(t, 105);
    return {
      pos: [wander(t, 4.4) * room.halfWidth * 0.26, 0.35 + u * 3.9, room.at(16 - u * 7)],
      look: [0, 0.8 + u * 1.7, 0],
      fov: 52 + u * 6,
    };
  },

  // Almost locked off. Only the handheld float and a slow push.
  static(t, room){
    return {
      pos: [room.halfWidth * 0.12, EYE, room.at(12 - Math.sin(t * 0.03) * 2.1)],
      look: [0, EYE * 0.96, 0],
      fov: 44,
    };
  },

  // Backing away from the wall, into the dark at the far end.
  retreat(t, room){
    const u = cycle(t, 150);
    return {
      pos: [wander(t, 2.7) * room.halfWidth * 0.38, EYE + 0.35 + wander(t, 5.5) * 0.18, room.at(8 + u * 28)],
      look: [wander(t, 0.3) * room.halfWidth * 0.22, EYE, 0],
      fov: 60 - u * 12,
    };
  },
};

export const moveNames = Object.keys(MOVES);

export function sample(name, t, room){
  const move = MOVES[name] || MOVES.approach;
  const out = move(t, room);
  const f = float(t);
  out.pos[0] += f.x;
  out.pos[1] += f.y;
  // Keep the camera inside the room whatever the move asked for.
  out.pos[0] = Math.max(-room.halfWidth * 0.86, Math.min(room.halfWidth * 0.86, out.pos[0]));
  out.pos[1] = Math.max(0.3, Math.min(room.height * 0.86, out.pos[1]));
  out.pos[2] = Math.max(room.near, Math.min(room.depth * 0.98, out.pos[2]));
  return out;
}
