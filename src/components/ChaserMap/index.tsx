import { PropsOf } from "@emotion/react";
import styled from "@emotion/styled";
import { latLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  PropsWithChildren,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { AppContext } from "../../ctx/AppContext";
import { ChasersContext } from "../../ctx/ChasersContext";
import L from "leaflet";
import { RADAR_SITES } from "../../data/radarSites";

export type Coordinate = {
  lat: number;
  lng: number;
};

export type MarkerData = {
  id: string;
  label: string;
  coordinate: Coordinate;
  isActive?: boolean;
};

export type RadarSite = {
  id: string;
  name: string;
  coordinate: Coordinate;
};

const StyledPopup = styled(Popup)`
  white-space: pre-wrap;
`;

type PopupProps = {
  isActive?: boolean;
} & PropsOf<typeof StyledPopup>;

const DynamicPopup: React.FC<PropsWithChildren<PopupProps>> = ({
  isActive,
  children,
  ...extraProps
}) => {
  const map = useMap();
  const ref = useRef<any>(undefined);

  useEffect(() => {
    if (!ref.current) return;

    if (isActive) {
      ref.current?.openOn(map);
    } else {
      map.closePopup(ref.current);
    }
  }, [isActive, map]);

  return (
    <StyledPopup ref={ref} {...extraProps}>
      {children}
    </StyledPopup>
  );
};

// Custom icon for radar sites
const radarIcon = new L.Icon({
  iconUrl:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIxOCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDA2NmZmIiBzdHJva2Utd2lkdGg9IjMiLz48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIxMiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDA2NmZmIiBzdHJva2Utd2lkdGg9IjMiLz48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSI2IiBmaWxsPSIjMDA2NmZmIiBzdHJva2Utd2lkdGg9IjMiLz48L3N2Zz4=",
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -20],
});

// Custom icon for selected radar sites
const selectedRadarIcon = new L.Icon({
  iconUrl:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIxOCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDBmZjAwIiBzdHJva2Utd2lkdGg9IjMiLz48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIxMiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDBmZjAwIiBzdHJva2Utd2lkdGg9IjMiLz48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSI2IiBmaWxsPSIjMDBmZjAwIiBzdHJva2Utd2lkdGg9IjMiLz48L3N2Zz4=",
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -20],
});

export type ChaserMapProps = {
  selectedRadar: RadarSite | null;
  onRadarSelect: (radar: RadarSite | null) => void;
};

export const ChaserMap: React.FC<ChaserMapProps> = ({
  selectedRadar,
  onRadarSelect,
}) => {
  const { activeChaser } = useContext(AppContext);
  const { chasers } = useContext(ChasersContext);
  const [markers, setMarkers] = useState<MarkerData[]>([]);

  useEffect(() => {
    const markers: MarkerData[] = chasers.map((chaser) => {
      const [lng, lat] = chaser.geometry.coordinates;
      const label = `${chaser.properties.name}\n${chaser.properties.location}`;
      return {
        id: chaser.properties.id,
        label,
        coordinate: { lat, lng },
        isActive: activeChaser === chaser.properties.id,
      };
    });

    setMarkers(markers);
  }, [chasers, activeChaser]);

  return (
    <MapComponent
      markers={markers}
      selectedRadar={selectedRadar}
      onRadarSelect={onRadarSelect}
    />
  );
};

type MapUpdaterProps = {
  markers: MarkerData[];
  shouldRecenter?: boolean;
};

const MapUpdater: React.FC<MapUpdaterProps> = ({ markers, shouldRecenter }) => {
  const [hasLoaded, setLoaded] = useState(false);
  const map = useMap();

  const recenter = () => {
    const coords: [number, number][] = markers.map((m) => [
      m.coordinate.lat,
      m.coordinate.lng,
    ]);

    const bounds = latLngBounds(coords.length > 0 ? coords : [[0, 0]]);
    map.fitBounds(bounds);
  };

  useEffect(() => {
    // Skip if no markers yet
    if (markers.length === 0) return;

    if (!hasLoaded || shouldRecenter) {
      recenter();
    }

    if (!hasLoaded) {
      setLoaded(true);
    }
  }, [markers, map]);

  return null;
};

export type MapProps = {
  markers: MarkerData[];
  shouldRecenter?: boolean;
  selectedRadar: RadarSite | null;
  onRadarSelect: (radar: RadarSite | null) => void;
};

export const MapComponent: React.FC<MapProps> = ({
  markers,
  shouldRecenter,
  selectedRadar,
  onRadarSelect,
}) => {
  const handleRadarClick = (site: RadarSite) => {
    onRadarSelect(site);
  };

  return (
    <MapContainer center={[39, -98]} zoom={4} style={{ height: "50%", width: "100%" }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {markers.map((marker) => (
        <Marker
          key={marker.id}
          position={[marker.coordinate.lat, marker.coordinate.lng]}
        >
          <DynamicPopup isActive={marker.isActive}>{marker.label}</DynamicPopup>
        </Marker>
      ))}
      {RADAR_SITES.map((site) => (
        <Marker
          key={site.id}
          position={[site.coordinate.lat, site.coordinate.lng]}
          icon={selectedRadar?.id === site.id ? selectedRadarIcon : radarIcon}
          eventHandlers={{
            click: () => handleRadarClick(site),
          }}
        >
          <DynamicPopup>
            <div>
              <strong>{site.name}</strong>
              <br />
              ID: {site.id}
            </div>
          </DynamicPopup>
        </Marker>
      ))}
      <MapUpdater markers={markers} shouldRecenter={shouldRecenter} />
    </MapContainer>
  );
};
