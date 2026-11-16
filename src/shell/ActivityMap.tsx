// ============================================================================
// The activity map: CARTO raster tiles (the same basemaps as iStride's web
// maps, config/mapTiles.ts in TempoRun) drawn by MapLibre, so Android needs no
// Google key. Shows the route so far, the planned route, and follows the member.
// ============================================================================

import { Camera, GeoJSONSource, Layer, Map, type StyleSpecification } from '@maplibre/maplibre-react-native';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { CARTO_API_KEY } from './config';
import { colors } from './theme';

/** [longitude, latitude], MapLibre's order. */
export type LngLat = [number, number];

const BASEMAPS = {
  /** Dark Matter: iStride's live tracker. */
  dark: 'dark_all',
  /** Voyager: colored, for previews. */
  voyager: 'rastertiles/voyager',
  /** Positron: light. */
  light: 'light_all',
} as const;

const styleFor = (basemap: keyof typeof BASEMAPS): StyleSpecification => {
  const key = CARTO_API_KEY ? `?key=${CARTO_API_KEY}` : '';
  return {
    version: 8,
    sources: {
      carto: {
        type: 'raster',
        tiles: ['a', 'b', 'c', 'd'].map((s) => `https://${s}.basemaps.cartocdn.com/${BASEMAPS[basemap]}/{z}/{x}/{y}@2x.png${key}`),
        tileSize: 256,
        maxzoom: 20,
        attribution: '© OpenStreetMap contributors © CARTO',
      },
    },
    layers: [{ id: 'carto', type: 'raster', source: 'carto' }],
  };
};

const line = (coords: LngLat[]) => ({
  type: 'Feature' as const,
  properties: {},
  geometry: { type: 'LineString' as const, coordinates: coords },
});

export function ActivityMap({
  route,
  planned = [],
  basemap = 'dark',
  follow = true,
  style,
}: {
  /** The route so far. */
  route: LngLat[];
  /** The planned route, if one was chosen. */
  planned?: LngLat[];
  basemap?: keyof typeof BASEMAPS;
  /** Keep the member centered, pointing the way they're moving. */
  follow?: boolean;
  style?: ViewStyle;
}) {
  const last = route.length ? route[route.length - 1] : planned[0];
  return (
    <View style={[styles.box, style]}>
      <Map style={StyleSheet.absoluteFill} mapStyle={styleFor(basemap)} logo={false} compass={false} attribution>
        <Camera
          initialViewState={last ? { center: last, zoom: 15 } : { zoom: 2 }}
          trackUserLocation={follow ? 'course' : undefined}
        />
        {planned.length > 1 && (
          <GeoJSONSource id="planned" data={line(planned)}>
            <Layer id="planned-line" type="line" paint={{ 'line-color': '#94A3B8', 'line-width': 4, 'line-dasharray': [2, 2] }} />
          </GeoJSONSource>
        )}
        {route.length > 1 && (
          <GeoJSONSource id="route" data={line(route)}>
            <Layer id="route-line" type="line" paint={{ 'line-color': colors.teal, 'line-width': 5 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
          </GeoJSONSource>
        )}
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', borderRadius: 20, backgroundColor: '#1E293B', minHeight: 220 },
});
