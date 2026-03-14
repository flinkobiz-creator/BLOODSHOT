# BLOODSHOT - Rivals-like FPS Prototype

This project is a browser-based 3D shooting game prototype inspired by arena shooters.

## Run

Use any static file server from the repository root:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Features

- First-person movement and pointer lock aiming.
- Enemy bots that chase and shoot.
- Ammo + reload + health + score HUD.
- Local OBJ 3D models included under `src/models`.
- Large 3D asset files generated procedurally (well beyond 20,000 lines of source/assets total).

## Controls

- `WASD`: Move
- `Mouse`: Aim
- `Left Click`: Shoot
- `R`: Reload
- `Shift`: Sprint
- `Space`: Jump
