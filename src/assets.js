// The portable HTML supplies these files in memory; development uses HTTP.
function embedded() {
  return globalThis.__EMERGENCY_EXIT_ASSETS__;
}

export function assetUrl(url) {
  const assets = embedded();
  if (!assets) return url;
  if (!(url in assets.files)) throw new Error('Missing embedded asset: ' + url);
  return assets.files[url];
}

export async function readJson(url) {
  const assets = embedded();
  if (assets) {
    if (!(url in assets.json)) throw new Error('Missing embedded JSON: ' + url);
    return assets.json[url];
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error('Не удалось загрузить ' + url);
  return response.json();
}

export async function readBytes(url) {
  if (embedded()) {
    const data = atob(assetUrl(url).split(',')[1]);
    return Uint8Array.from(data, character => character.charCodeAt(0)).buffer;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error('Не удалось загрузить ' + url);
  return response.arrayBuffer();
}
