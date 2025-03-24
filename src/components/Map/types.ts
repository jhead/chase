export type FeatureCollection = {
  type: "FeatureCollection";
  features: Feature[];
};

export type Feature = {
  type: "Feature";
  id: string;
  properties: Record<string, any>;
  geometry: Shape;
};

export type Shape = Polygon | MultiPolygon;

export type MultiPolygon = {
  type: "MultiPolygon";
  coordinates: PolygonCoords[];
};

export type Polygon = {
  type: "Polygon";
  coordinates: PolygonCoords;
};

export type PolygonCoords = [Coord[]];
export type Coord = [number, number];
