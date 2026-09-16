# rooms/ — image provenance and requirement check

## Why these images and not Pexels/Unsplash

This session runs in a sandboxed container whose egress policy is an allow-list.
`images.unsplash.com`, `images.pexels.com`, `api.pexels.com`, `pixabay.com`,
`upload.wikimedia.org`, `picsum.photos` and every other stock-photo host are
refused at the proxy (`CONNECT tunnel failed, response 403`). Only GitHub, npm,
PyPI and the Anthropic API are reachable, so the images below were taken from a
GitHub-hosted image pack rather than downloaded from Pexels or Unsplash.

## Source

Repository: https://github.com/yavuzceliker/sample-images (`docs/image-N.jpg`)
License: the repository states its images originate from Pixabay.com and were
modified, and are redistributable under the Pixabay Content License in their
modified form. Pixabay's licence is a free stock licence comparable to
Pexels/Unsplash, so the intent of the original request is preserved.

Selection method: all 2000 images in the pack were rendered into contact sheets
and reviewed by eye; these five are every indoor-room frame the pack contains.

## Requirement check

Required: living room or bedroom, window visible, >= 1024px, jpg.

| file | source | resolution | jpg | room type | window visible | verdict |
|---|---|---|---|---|---|---|
| room_01_living_room.jpg | image-1002.jpg | 1280x853 | yes | living room, furnished (sofa, table, art) | yes, bright window at left | **meets all four** |
| room_02_window_nook.jpg | image-1212.jpg | 1280x853 | yes | furnished window nook (cushions, lanterns) — not a full living room or bedroom | yes, large multi-pane window | partial: room type is marginal |
| room_03_kitchen.jpg | image-430.jpg | 960x1280 | yes | kitchen, furnished | yes, two windows | partial: kitchen, not living room/bedroom; short side 960px |
| room_04_living_room.jpg | image-1300.jpg | 960x1280 | yes | living room, furnished (sofa, plant, table) | **no** | partial: no window in frame; short side 960px |
| room_05_window.jpg | image-103.jpg | 1280x960 | yes | window with curtains and sill; little furniture | yes | partial: not a furnished living room/bedroom |

All five are >= 1024px on the long side. room_03 and room_04 are 960px on the
short side, so they fail a strict "min dimension >= 1024px" reading.

**One image (room_01) satisfies every requirement.** The pack simply does not
contain five furnished living rooms or bedrooms with a visible window.

## Other sources checked and rejected

- `dylanxzthomas/apartment-virtual-tour` — 4096x2048 rooms, but they are 360-degree
  equirectangular Blender renders of a private apartment with no licence file.
- `lllyasviel/ControlNet-v1-1-nightly` — `test_imgs/bedroom.jpg`, `room.png`,
  `room2.jpg` are exactly the right subject (bedrooms with windows) but only
  ~564x700, well under 1024px, and carry no image licence.
- Real-estate and hotel website templates (`M-YasirGhaffar/...`,
  `diegovr7/real-estate`, `technext/luxury-hotel`) — almost all exteriors; the few
  interiors are 500x600.

## To get proper Pexels/Unsplash images

Allow `images.unsplash.com` and `images.pexels.com` in the environment's network
policy (https://code.claude.com/docs/en/claude-code-on-the-web). The same change
is needed for `fal.run`, which is blocked too, so the pipeline cannot call the
FAL API from this container either way.
