from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = Image.open(root / 'tools/art-source/detonator-raw.png').convert('RGBA')
frames = [
    source.crop((i * source.width // 4, 0, (i + 1) * source.width // 4, source.height))
    for i in range(4)
]
boxes = [
    frame.getchannel('A').point(lambda alpha: 255 if alpha > 24 else 0).getbbox()
    for frame in frames
]
bounds = (
    min(box[0] for box in boxes),
    min(box[1] for box in boxes),
    max(box[2] for box in boxes),
    max(box[3] for box in boxes),
)
scale = 26 / (bounds[3] - bounds[1])
size = (round((bounds[2] - bounds[0]) * scale), 26)
strip = Image.new('RGBA', (240, 60))
for index, frame in enumerate(frames):
    normalized = frame.crop(bounds).resize(size, Image.Resampling.NEAREST)
    strip.alpha_composite(normalized, (index * 60 + 30 - size[0] // 2, 44 - size[1]))
strip.save(root / 'assets/custom/mellstroy-detonator.png', optimize=True)
