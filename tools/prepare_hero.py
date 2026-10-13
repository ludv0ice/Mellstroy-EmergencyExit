"""Normalize the approved directional atlas; Pillow is only a developer art tool."""
from pathlib import Path
from collections import deque
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/source/mellstroy-directions-generated.png'
ATTACK_SOURCE = ROOT / 'assets/source/mellstroy-attacks-generated.png'
OUTPUT = ROOT / 'public/assets/custom'
FRAME = 60
ORIGIN = (30, 30)
FOOT_BASELINE = 44
BODY_HEIGHT = 26


def spans(values, gap=3):
    result = []
    start = last = None
    for index, occupied in enumerate(values):
        if not occupied:
            continue
        if last is not None and index - last > gap + 1:
            result.append((start, last + 1))
            start = None
        if start is None:
            start = index
        last = index
    if start is not None:
        result.append((start, last + 1))
    return result


def extract(source_path, minimum_columns):
    source = Image.open(source_path).convert('RGBA')
    alpha = source.getchannel('A')
    rows = spans([alpha.crop((0, y, source.width, y + 1)).getextrema()[1] > 100
                  for y in range(source.height)], gap=10)
    if len(rows) != 4:
        raise ValueError(f'Expected four facing rows, found {len(rows)}')
    cells = []
    for y0, y1 in rows:
        columns = spans([alpha.crop((x, y0, x + 1, y1)).getextrema()[1] > 100
                         for x in range(source.width)])
        if len(columns) < minimum_columns:
            raise ValueError('Missing animation poses in source row')
        cells.append([source.crop((x0, y0, x1, y1)) for x0, x1 in columns])
    return cells


def head_anchor(image):
    # The largest brown component is the hair, not the moving fist. This also
    # works when the back-facing arm extends above the head.
    brown = {(x, y) for y in range(image.height) for x in range(image.width)
             if (lambda r, g, b, a: a > 100 and 20 <= r < 120 and g < 100
                 and b < 70 and r > g * 1.15 and r > b * 1.3)(*image.getpixel((x, y)))}
    largest = []
    while brown:
        queue = deque([brown.pop()])
        component = []
        while queue:
            x, y = queue.popleft()
            component.append((x, y))
            for point in [(x-1, y), (x+1, y), (x, y-1), (x, y+1)]:
                if point in brown:
                    brown.remove(point)
                    queue.append(point)
        if len(component) > len(largest):
            largest = component
    if not largest:
        raise ValueError('Cannot locate character head for stable anchoring')
    return ((min(x for x, y in largest) + max(x for x, y in largest) + 1) / 2,
            min(y for x, y in largest))


def main():
    cells = extract(SOURCE, 15)

    # Generation supplied ten walk candidates; use eight and retain all seven attacks.
    walks = [row[:8] for row in cells]
    attacks = [row[:7] for row in extract(ATTACK_SOURCE, 7)]
    walk_scale = BODY_HEIGHT / max(image.getbbox()[3] - image.getbbox()[1]
                                   for row in walks for image in row)
    attack_scale = BODY_HEIGHT / max(image.getbbox()[3] - head_anchor(image)[1]
                                     for row in attacks for image in row)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, animation in [('mellstroy-directions', walks), ('mellstroy-attacks', attacks)]:
        count = len(animation[0])
        scale = walk_scale if name == 'mellstroy-directions' else attack_scale
        sheet = Image.new('RGBA', (FRAME * count, FRAME * 4))
        for row_index, row in enumerate(animation):
            for frame_index, image in enumerate(row):
                bounds = image.getbbox()
                image = image.crop(bounds)
                # Align the head/body, not the full silhouette: extended hands must not
                # move the torso's anchor sideways during a punch.
                if name == 'mellstroy-directions':
                    head = image.getchannel('A').crop((0, 0, image.width, round(image.height * .28))).getbbox()
                    center_x = (head[0] + head[2]) / 2
                else:
                    center_x, _ = head_anchor(image)
                normalized = image.resize((max(1, round(image.width * scale)),
                                           max(1, round(image.height * scale))), Image.Resampling.NEAREST)
                x = frame_index * FRAME + round(ORIGIN[0] - center_x * scale)
                y = row_index * FRAME + FOOT_BASELINE - normalized.height
                sheet.paste(normalized, (x, y))
        sheet.save(OUTPUT / (name + '.png'), optimize=True)
        print(name, sheet.size, 'rows=down,up,left,right', 'origin=', ORIGIN)


if __name__ == '__main__':
    main()
