import React from "react";

export type AppContext = {
  activeChaser?: string;
  focusedChaser?: string;
  onlyShowOnline?: boolean;
};

export const DefaultAppContext: AppContext = {
  onlyShowOnline: false,
};

export const AppContext = React.createContext<AppContext>(DefaultAppContext);
