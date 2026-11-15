# Sources for figures shown in the walkthrough

Every number on the page comes from a source listed here. Anything without one stays `TODO(musa)` and is not shown.

## The switch (stops 1 and 2)

The walkthrough's switch uses the published figures for one common mechanical switch, the CHERRY MX Red (sold as MX2A Red).

Source: CHERRY, product page "CHERRY MX RED", https://www.cherry.de/en-gb/product/mx2a-red (read 14 Nov 2026).

| Figure on the page | Value | Page wording |
| --- | --- | --- |
| Force to press | 45 cN | "45 cN operating force"; Properties: "Actuation force 45 cN" |
| Where the press registers | 2 mm | "2.0 mm pre travel"; Properties: "Pre-Travel 2 mm" |
| All the way down | 4 mm | "4.0 mm total travel"; Properties: "Actuator travel 4 mm" |
| Push at the start | 30 cN | Properties: "Initial force 30 cN" |
| Push at the bottom | 100 cN | Properties: "Final force 100 cN" |


## The cable (stop 3)

The cable stop shows no figures. Its copy makes two claims, both standard USB behaviour:
- A keyboard sends a code for the key's position, not a letter; the computer maps it to a letter through the layout (USB HID Usage Tables, Keyboard/Keypad page). https://www.usb.org/hid
- The data wires are a twisted pair carrying the signal as opposites, so interference common to both cancels (USB 2.0 Specification, differential signalling). https://www.usb.org/document-library/usb-20-specification

TODO(musa): these two links were not re-read on 15 Nov 2026; check them before going public.

The wire colours in the cutaway follow the site's palette, not the USB colour code; the drawing is illustrative.

## The processor (stop 4)

No figures. The copy says the keyboard driver reads the key's code and the system maps it to a letter through the layout before passing it to the program (standard operating-system keyboard handling). The die is drawn, not a real chip's layout, and is not labelled as cores. The capacitors on the package are decoupling capacitors, which steady the chip's supply.

## The graphics (stop 5)

No figures. Claims, all standard: the graphics processor is often part of the same chip as the main processor (integrated graphics); fonts store letters as outlines of points joined by lines and curves (TrueType/OpenType), so they scale cleanly; text is rasterised onto a pixel grid with partly covered edge pixels given in-between shades (anti-aliasing); the finished image is held in memory, one value per pixel (a frame buffer), and sent to the display repeatedly ("many times a second", no rate given). The drawing on the page is the browser's own anti-aliased rendering of the M in Schibsted Grotesk on a 20 x 20 grid, so the partly lit pixels are real coverage values, not painted. Its outline is traced from the same glyph; the studs mark the traced corners, not the font file's stored points.

## "Go deeper" points (all stops)

No new figures; the 2 mm, 4 mm, 30 cN and 100 cN come from the CHERRY table above. The other claims are general, standard behaviour:
- Linear switches feel the same all the way down; tactile and clicky switches add a bump or a click (CHERRY product range, same site).
- Keyboard keys are wired as a matrix of rows and columns that the keyboard's controller scans repeatedly ("many times a second", no rate given).
- One keyboard types in many languages because the computer applies the layout (USB HID Usage Tables, above).
- USB data travels as a differential pair; twisting makes interference common to both wires (USB 2.0 Specification, above).
- The processor handles incoming input through interrupts: it pauses its current work briefly, deals with the input, then resumes (standard operating-system behaviour).
- A processor's logic is built from transistors, which act as electrically controlled switches with no moving parts.

TODO(musa): skim these before going public; none states a number.

## Textures (Poly Haven, CC0)

Every photo texture comes from Poly Haven, licensed CC0 (public domain: free to use, no credit required). Downloaded 15 Nov 2026 through the Poly Haven API and converted to WebP. Files are in `public/assets/<id>/`.

| Used for | Id | Author | Source size | Shipped | Page |
| --- | --- | --- | --- | --- | --- |
| Keyboard case | `black_walnut_veneer_02` | Jenelle van Heerden | 4k colour, 2k normal and roughness | 4096 px colour (darkened to oiled walnut, pores added), 2048 px normal, 1024 px roughness | https://polyhaven.com/a/black_walnut_veneer_02 |
| Desk top | `oak_veneer_01` | Jenelle van Heerden | 2k | 2048 px colour (darkened to oiled oak) and normal, 1024 px roughness (lifted to a satin finish) | https://polyhaven.com/a/oak_veneer_01 |
| Candle flame | `brass_candleholders` (flame texture only) | Tina | 2k | 256 px | https://polyhaven.com/a/brass_candleholders |

The lamp, candle, mug, cable and keyboard are built in code; no other files were downloaded into the repo.

Licence: https://polyhaven.com/license
