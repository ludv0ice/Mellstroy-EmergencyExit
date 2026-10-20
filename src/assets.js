export function assetUrl(url) {
  const root = globalThis.__EMERGENCY_EXIT_ROOT__;
  if (root && url.startsWith('/')) {
    return new URL(url.slice(1), root).href;
  }
  return url;
}

export async function readJson(url) {
  const data = globalThis.__EMERGENCY_EXIT_ASSETS__;
  if (data) {
    if (!(url in data.json)) {
      throw new Error('Missing game data: ' + url);
    }
    return data.json[url];
  }
  const response = await fetch(assetUrl(url));
  if (!response.ok) {
    throw new Error('Не удалось загрузить ' + url);
  }
  return response.json();
}

export function roomSpriteKeys(metadata, room) {
  const keys = new Set(
    room.entities.map((entity) => entity.sprite).filter((k) => metadata.sprites[k]),
  );
  for (const entity of room.entities.filter((e) => e.glass)) {
    const key = entity.sprite.replace(/([HV])$/, '$1Broken');
    if (metadata.sprites[key]) {
      keys.add(key);
    }
  }
  for (const key of [
    'sprWeapons',
    'sprLegs',
    'sprPoliceLegs',
    'sprPWalkUnarmed',
    'sprEBackBlunt',
    'sprPoliceBackBlunt',
    'sprPoliceBackMachinegun',
    'sprPoliceCrawl',
    'sprBloodSplat',
    'sprBullet',
    'sprDogWalk',
    'sprBossCar1',
    'sprBossCar2',
    'sprCopCar',
    'sprDogDeadBlunt',
    'sprDogAttack',
    'sprPBackMachinegun',
    'sprPCrawl',
  ]) {
    if (metadata.sprites[key]) {
      keys.add(key);
    }
  }
  return keys;
}
