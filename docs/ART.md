# Новые игровые ассеты

Генерация выполнена встроенным **ImageGen**. Выбранные результаты нормализованы общим масштабом на всю анимацию. В текущем проекте сохранены конечные игровые текстуры; дубли исходников и увеличенные промежуточные изображения доступны в истории Git. При сокращении проекта игровые PNG не изменялись. Размеры ниже относятся к конечным игровым файлам.

| Файл в `assets/custom/` | Исходный спрайт | Размер PNG | Кадры | Кадр | Origin |
|---|---|---|---|---|---|
| `mellstroy-walk.png` | `sprPWalkUnarmed` | 480×60 | 8 | 60×60 | 30,30 |
| `mellstroy-punch.png` | `sprPAttackPunch` | 308×32 | 7 | 44×32 | 13,16 |
| `police-walk.png` | `sprPoliceWalkM16` | 256×24 | 8 | 32×24 | 8,10 |
| `police-unarmed.png` | `sprPoliceWalkUnarmed` | 256×32 | 8 | 32×32 | 16,16 |
| `police-corpse.png` | `sprPoliceBackMachinegun` | 240×60 | 4 | 60×60 | 30,30 |
| `escape-car.png` | `sprPlayerCar` | 1391×70 | 13 | 107×70 | 53,46 |
| `streamer-desk.png` | `sprAndersDesk` | 318×25 | 6 | 53×25 | 26,14 |
| `floor-atlas.png` | `tlFloorTiles` | 816×368 | Атлас | Исходная сетка | Исходные координаты тайлов |

Манифест — `assets/custom/skins.json`. При первоначальной нормализации отбрасывались почти прозрачные случайные пиксели при измерении силуэта, сохранялся одинаковый масштаб внутри полосы и переносился центр видимой области каждого исходного кадра. Атлас полов приведён к исходному разрешению; его визуальное содержимое является генеративной заменой, а не гарантированной попиксельной копией сетки материалов.

Герой основан на обобщённом узнаваемом образе Mellstroy: короткие каштановые волосы, борода, чёрная футболка. Фотореференс пользователя не предоставлялся.

## Направленные анимации героя

Для вертикального персонажа добавлены два прозрачных атласа. Строки в обоих файлах: **вниз, вверх, влево, вправо**. Каждый кадр 60×60, общая точка привязки 30,30, нижняя граница стоп нормализована к y=44. Общий масштаб внутри каждой анимации сохраняется; вытянутая рука не сдвигает голову и корпус по горизонтали.

| Файл | Размер | Кадры в строке | Строки |
|---|---|---:|---:|
| `mellstroy-directions.png` | 480×240 | 8 ходьбы | 4 |
| `mellstroy-attacks.png` | 420×240 | 7 удара | 4 |

Исходные генерации сохранены в `tools/art-source/`, воспроизводимая нормализация — `python3 tools/prepare_hero.py` с Pillow. Первый исходный атлас содержит дополнительные варианты ходьбы; выбран цикл из восьми кадров. Удары подготовлены отдельным атласом, чтобы руки явно тянулись вверх/вниз и в соответствующую сторону для боковых направлений. Старые спрайты и их контрольные хеши сохранены; игра использует новые ключи `heroDirectional` и `punchDirectional` в `skins.json`.

## Использованные промпты

### Ходьба Mellstroy

Use case: precise-object-edit. Production sprite replacement for top-down pixel action browser game. Edit target is the supplied eight-frame unarmed walking strip. Replace the masked jacket character with streamer Mellstroy: short brown hair, short brown beard, black t-shirt, pale skin, dark grey pants and sneakers. Preserve the exact overhead viewpoint, facing direction of the input poses, compact proportions, pixel-cluster style, eight sequential walk poses and center position of each frame. No mask. Output a single horizontal strip of exactly EIGHT equal square 60x60 slots, transparent background, total dimensions 480x60 pixels if possible; if larger, keep that same 8:1 strip layout with eight equal slots. Character visible silhouette should occupy about 16x26 pixels within each 60x60 slot, as in source; no enlarging the body. Keep a clean pixel grid, clear blocky shapes, no text, no scenery, no glow, no ground shadows, no extra poses. This is an in-engine texture, not artwork.

### Полицейский с винтовкой

Edit target: eight-frame top-down police walking with rifle sprite strip, 256x24 pixels, eight 32x24 slots. Replace officers with modern dark navy police tactical uniforms, black vests, dark blue police cap, tan exposed hands, grey rifle. Keep EXACT input overhead viewpoint (head at left side of body, rifle points to the right), all eight walk poses, pose spacing, silhouette dimensions, position and slot order. Low-resolution pixel art, limited palette, crisp nearest-neighbor edges. Output eight frames in ONE horizontal strip, transparent background, no text, no extra objects or labels or environment. Preserve 32x24 slot aspect. This is a tiny in-game asset, not a character illustration. Same scale and framing as reference.

### Безоружный полицейский

Edit the eight-frame police walk strip into modern police in dark navy short-sleeve uniforms, black tactical vests, blue caps, light hands. These officers are UNARMED: empty hands, no rifle or pistol anywhere. Preserve EXACT overhead viewpoint, orientation, eight sequential walking poses, shape and center of each 32x32 frame. Head/body orientation as source, compact pixel-art character about 14x24 pixels within each slot, not a portrait. ONE horizontal strip of eight equal slots, transparent background, crisp limited-palette pixels. No words, labels, scenery, ground shadows or additional frames. Use same palette as dark navy contemporary tactical police.

Уточняющий промпт для выбранной финальной версии:

Remove ALL background, haze, fringe, smoky grey and white shapes from this asset. Keep ONLY the eight navy-uniform police pixel characters in their existing positions, facing and size. Everything outside the eight character silhouettes must be fully transparent alpha=0, including the entire gray smoke and all white streaks. No checkerboard or color background. Do not add anything. Keep one horizontal eight-frame walk strip, each character isolated on pure transparency. This is background extraction, not a stylistic scene edit. Crisp opaque pixel-art silhouette edges.

### Удар Mellstroy

Use case precise-object-edit. Image1 is edit target: seven-frame overhead pixel-art punch animation, seven 44x32 pixel slots, body anchor near x=13 y=16 and fist extends toward RIGHT. Image2 is identity reference only: Mellstroy with short brown hair, brown beard, black T-shirt and grey pants. Replace every character in Image1 with this Mellstroy character. Preserve all SEVEN original sequential punch poses, original top-down perspective, punch direction to the right, slot order, body size, body anchor, framing and animation. One horizontal strip of seven equal slots. Strict tiny pixel-art body approx16x24 pixels, fist extends additional16px to the right. No mask. Transparent background, no labels, no smoke or glow, no environment or shadows. Full strip exact308x32 if possible; otherwise keep seven same relative slots. Same character in every frame.

### Тела полицейских

Use case precise-object-edit. Image1 edit target: four top-down police corpse animation frames, four 60x60 pixel slots. Image2 palette reference: contemporary dark navy uniform, black vest and blue cap. Replace Image1's old teal uniforms with modern navy police uniforms matching Image2, preserve all FOUR horizontal corpse poses, positions and compact original size approx43x24 in each slot, keep blood details in pink-red pixel clusters at the head. One horizontal strip, four equal square60x60 slots, total240x60 if possible. Strict tiny low resolution pixel-art texture. Transparent background, no smoke, no shadows, no words, no scenery, no extra frames. Keep source overhead view and angle, not perspective.

### Машина побега

Use case precise-object-edit. Edit the supplied 13-frame overhead escape car sprite strip. Replace the silver retro car with a black modern sports sedan with subtle violet reflections, cyan tinted windows and red tail lights. Preserve EXACT thirteen source frame poses, including the SAME door opening/closing poses and orientation, body dimensions, frame order, transparent canvas and source overhead orthographic viewpoint. Every frame is the SAME car, facing RIGHT in a horizontal row, doors open and close as in reference. Thirteen equal107x70 slots, entire1391x70 strip if possible. Car visible body107x52 low resolution pixels; do not alter scale or add people or smoke. Crisp limited-palette pixel art suitable for Hotline Miami style. Fully transparent outside car silhouette, no labels, logos, shadows, environment or extra frames. Keep all THIRTEEN sequential frames, not fewer.

### Стол стримера

Edit the supplied six-frame pixel-art overhead desk texture into a contemporary streamer workstation for Mellstroy's apartment. Preserve exactly SIX equal 53x25 slots in one horizontal strip, original silhouette size, top-down orthographic angle, furniture shape and placement, opaque/transparent bounds. Add black desk, three small cyan/pink monitors, RGB keyboard, microphone arm, small camera, black computer tower. Six frames are subtle screen flicker variations of SAME workstation, not six different items. Strict low resolution pixel art, crisp clusters, same scale as reference. Transparent background, no shadows outside bounds, no text, no scenery, no extra objects, no perspective. Keep original 318x25 strip geometry if possible, else same slots and ratio.

### Полы

Use case precise-object-edit. Edit this production top-down pixel-art floor tile atlas for a neon night police-chase browser game starring a streamer. Maintain EXACT atlas arrangement, all tile footprints, positions and transparent blank areas, do not rearrange anything. Original atlas dimensions 816x368, each small tile grid 16 pixels. Replace decorative tile materials only: contemporary dark violet and teal parquet, cool graphite concrete, muted pink motel bathroom ceramics, dim gold club tiles, asphalt and cyan pool water. Keep every tile seamless with itself, no perspective, no words or logos, no bevels or shadows outside original tile areas. Pixel-art material texture in limited palettes matching Hotline Miami pixel art, crisp pixels, compatible with original source rectangle coordinates. Keep layout identical. Transparent background where source transparent.

Интерфейс обновлён 16 октября 2026: шрифт Exo 2 от Google Fonts, лицензия SIL OFL в `FONT-LICENSE.txt`. Исходный Justice сохранён для целостности оригинальных материалов, меню использует Exo 2.
