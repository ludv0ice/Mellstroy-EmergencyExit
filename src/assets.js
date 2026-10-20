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
