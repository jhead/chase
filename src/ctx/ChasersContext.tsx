import React, {
  PropsWithChildren,
  useContext,
  useEffect,
  useState,
} from "react";
import { Chaser, getChasers } from "../services/chasers";
import { AppContext } from "./AppContext";

export type ChasersContext = {
  chasers: Chaser[];
};

export const EmptyChasersContext: ChasersContext = { chasers: [] };

export const ChasersContext =
  React.createContext<ChasersContext>(EmptyChasersContext);

export const WithChasers: React.FC<PropsWithChildren> = ({ children }) => {
  const { onlyShowOnline } = useContext(AppContext);
  const [chasers, setChasers] = useState<Chaser[]>([]);

  const refreshChasers = async () => {
    const res = await getChasers();
    const chasers = res.features.filter((chaser) => {
      if (onlyShowOnline) return chaser.properties.stream_status;
      return true;
    });

    setChasers(chasers);
  };

  useEffect(() => {
    refreshChasers();
    const inter = setInterval(refreshChasers, 5000);
    return () => clearInterval(inter);
  }, []);

  const ctx: ChasersContext = { chasers };

  return (
    <ChasersContext.Provider value={ctx}>{children}</ChasersContext.Provider>
  );
};
