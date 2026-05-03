# Blended Addressbar

An addressbar that belongs to the page.

Blended Addressbar is a Zen Browser mod that reshapes the dual-toolbar addressbar into a page-aware browser frame with adaptive colors.

## Features

- Adaptive addressbar background and foreground colors from active-page semantic colors.
- Readability guardrails for adaptive foreground colors.
- Compact framed browser surface with subtle spacing, radius, and shadow.
- Compact-mode toolbar icon colors that follow the addressbar foreground.
- Preference-driven loading bar height, opacity, and color source.

## Preferences

The mod exposes its settings through `preferences.json`.

- `uc.loadbar.color-source`: choose Zen primary color, page foreground, page background, or a custom color.
- `uc.loadbar.color`: custom loading bar color.
- `uc.loadbar.height`: loading bar height.
- `uc.loadbar.opacity`: loading bar opacity as a percentage.
- `uc.loadbar.centerbar`: center the loading animation.
- `uc.loadbar.roundedcorner`: enable rounded loading bar corners.
- `uc.loadbar.shadow`: enable loading bar shadow.

## Manual Installation

1. Copy this folder into your Zen profile's `chrome/sine-mods` directory.
2. Ensure Sine is installed and enabled.
3. Reload Sine mods or restart Zen Browser.
4. Enable `Blended Addressbar` from Sine settings.

## Compatibility

This mod targets Zen Browser dual-toolbar layouts. Compact mode is supported, but visual validation is still recommended after Zen updates because browser chrome selectors can change.
