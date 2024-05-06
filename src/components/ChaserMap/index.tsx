import { PropsOf } from "@emotion/react";
import styled from "@emotion/styled";
import L, { latLngBounds } from "leaflet";
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
  const ref = useRef<L.Popup>();

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

export const ChaserMap: React.FC = () => {
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

  return <MapComponent markers={markers} />;
};

const MapUpdater: React.FC<MapProps> = ({ markers, shouldRecenter }) => {
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
};

export const MapComponent: React.FC<MapProps> = ({
  markers,
  shouldRecenter,
}) => {
  return (
    <MapContainer center={[0, 0]} style={{ height: "400px", width: "100%" }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {markers.map((marker) => (
        <Marker
          key={marker.id}
          position={[marker.coordinate.lat, marker.coordinate.lng]}
        >
          <DynamicPopup isActive={marker.isActive}>{marker.label}</DynamicPopup>
        </Marker>
      ))}
      <MapUpdater markers={markers} shouldRecenter={shouldRecenter} />
    </MapContainer>
  );
};
