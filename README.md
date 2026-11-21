# Quadrant Chart Builder

**[Open the Quadrant Chart Builder](https://satejp10.github.io/Quadrant-Chart-Builder/)**

A single-file web app for making 2x2 quadrant charts. Open `Quadrant_Chart_Builder.html` in a browser. There is no login, no install, and no build step.

## How to use

- Click an empty spot on the chart to add a point.
- Drag a point to move it. With a point selected, the arrow keys nudge it (hold Shift for bigger steps). Delete removes it.
- Double-click any label or point name to rename it.
- Fill in the title, footnote, axis ends, and corner names in the Labels card. Name and place points in the Points card.
- Undo and Redo sit above the chart. Ctrl+Z undoes and Ctrl+Y (or Ctrl+Shift+Z) redoes. On a Mac, use Cmd.
- In the Export card, download a PNG or SVG, or copy the SVG code. PNG and SVG downloads include the Instrument Sans font when it can be fetched.
- Save project file keeps a copy of your chart. Open project file loads one back.
- Copy as JSON or Copy as Mermaid puts the setup on the clipboard. Paste either one under Setup as text and press Load to rebuild the chart.

Drafts save in this browser only. Save a project file to keep your work.

## Phones

On narrow screens the chart stacks its labels above and below the plot, so the text stays readable. Swipe on an empty part of the chart to scroll the page. A finger that starts on a point drags it.

## Files

- `Quadrant_Chart_Builder.html`: the whole app (HTML, CSS, and JavaScript in one file). It loads the Instrument Sans font from Google Fonts.
- `index.html`: sends the short link to the app.
- `preview.png`: the picture shown in link previews.
- `README.md`: this file.

## Live site

https://satejp10.github.io/Quadrant-Chart-Builder/Quadrant_Chart_Builder.html

GitHub Pages serves the `main` branch, root folder. The short link above opens the app.
