const defaults = {
  kind: 'decor',
  scaleX: 1,
  scaleY: 1,
  angle: 0,
  frame: 0,
  depth: 0,
  visible: true,
  solid: false,
  isWall: false,
  furniture: false,
  glass: false,
  broken: false,
};

export function buildRoom(manifest, raw) {
  const entities = raw.entities.map((entity, id) => ({
    ...defaults,
    id,
    ...entity,
    solid: entity.solid || /^objWallSoft[HV]$/.test(entity.name),
    isWall: entity.isWall || /^objWallSoft[HV]$/.test(entity.name),
    init: { ...entity.init },
    meta: manifest.sprites[entity.sprite],
    mask: manifest.sprites[entity.mask],
  }));
  return { ...raw, entities };
}

export function connectsTo(exit, room) {
  return exit.init.nextroom === room || !!exit.targets?.includes(room);
}

export function rectFor(entity) {
  if (entity.bounds) return { ...entity.bounds, entity };
  const m = entity.mask ?? entity.meta;
  if (!m) return null;
  const b = m.bbox,
    ox = m.originX,
    oy = m.originY;
  const corners = [
    [b[0] - ox, b[1] - oy],
    [b[2] - ox + 1, b[1] - oy],
    [b[2] - ox + 1, b[3] - oy + 1],
    [b[0] - ox, b[3] - oy + 1],
  ];
  const c = Math.cos(entity.angle),
    s = Math.sin(entity.angle);
  const points = corners.map(([x, y]) => [
    entity.x + x * entity.scaleX * c - y * entity.scaleY * s,
    entity.y + x * entity.scaleX * s + y * entity.scaleY * c,
  ]);
  return {
    x: Math.min(...points.map((p) => p[0])),
    y: Math.min(...points.map((p) => p[1])),
    w:
      Math.max(...points.map((p) => p[0])) -
      Math.min(...points.map((p) => p[0])),
    h:
      Math.max(...points.map((p) => p[1])) -
      Math.min(...points.map((p) => p[1])),
    entity,
  };
}
