import math
from pathlib import Path

OUT = Path('src/models')
OUT.mkdir(parents=True, exist_ok=True)

def write_obj(path, width, depth, amplitude, freq_x, freq_y, scale=1.0, z_scale=1.0):
    verts = []
    faces = []
    for y in range(depth + 1):
        for x in range(width + 1):
            nx = x / width
            ny = y / depth
            z = amplitude * math.sin(nx * math.pi * freq_x) * math.cos(ny * math.pi * freq_y)
            verts.append(((x - width / 2) * scale, z * z_scale, (y - depth / 2) * scale))

    def idx(x, y):
        return y * (width + 1) + x + 1

    for y in range(depth):
        for x in range(width):
            a = idx(x, y)
            b = idx(x + 1, y)
            c = idx(x + 1, y + 1)
            d = idx(x, y + 1)
            faces.append((a, b, c))
            faces.append((a, c, d))

    with path.open('w', encoding='utf-8') as f:
        f.write(f'o {path.stem}\n')
        for v in verts:
            f.write(f'v {v[0]:.5f} {v[1]:.5f} {v[2]:.5f}\n')
        for face in faces:
            f.write(f'f {face[0]} {face[1]} {face[2]}\n')

def write_weapon(path, segments=2200):
    verts = []
    faces = []
    # cylinder-like weapon body
    rings = 14
    for i in range(segments):
        z = i * 0.015
        radius = 0.14 + 0.02 * math.sin(i * 0.09)
        for r in range(rings):
            ang = (2 * math.pi * r) / rings
            x = math.cos(ang) * radius
            y = math.sin(ang) * radius
            verts.append((x, y, z))

    def vi(i, r):
        return i * rings + r + 1

    for i in range(segments - 1):
        for r in range(rings):
            rn = (r + 1) % rings
            a, b, c, d = vi(i, r), vi(i, rn), vi(i + 1, rn), vi(i + 1, r)
            faces.append((a, b, c))
            faces.append((a, c, d))

    with path.open('w', encoding='utf-8') as f:
        f.write('o weapon_rifle\n')
        for v in verts:
            f.write(f'v {v[0]:.5f} {v[1]:.5f} {v[2]:.5f}\n')
        for face in faces:
            f.write(f'f {face[0]} {face[1]} {face[2]}\n')

write_obj(OUT / 'arena.obj', width=120, depth=120, amplitude=1.8, freq_x=8, freq_y=7, scale=0.6, z_scale=1.0)
write_obj(OUT / 'character.obj', width=110, depth=110, amplitude=0.9, freq_x=10, freq_y=10, scale=0.04, z_scale=2.0)
write_weapon(OUT / 'weapon.obj', segments=1700)
print('generated')
