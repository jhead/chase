export type ChasersResponse = {
  type: "FeatureCollection";
  features: Chaser[];
};

export type Chaser = {
  type: "Feature";
  properties: {
    id: string;
    name: string;
    stream_status: boolean;
    gps_update: string; // timestamp
    viewers: number;
    location: string;
    heading: null;
    stream_id: string;
    live_timestamp: string; // timestamp
  };
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
};

export const getChasers = async (): Promise<ChasersResponse> => {
  const res = await fetch(
    "https://api.livestormchasing.com/api/v1/chasers?geojson=true"
  );

  return res.json();
};
