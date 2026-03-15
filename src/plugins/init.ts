// Import all plugins to trigger their registerPlugin() calls.
// This file should be imported early in the app (e.g. from main.tsx).

import "@chase/layer-basemap";
import "@chase/layer-radar-sites";
import "@chase/layer-radar-l2";
import "@chase/layer-noaa-alerts";
