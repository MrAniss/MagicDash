import { createContext, useContext, useState } from 'react';

const ComarketContext = createContext();

export function ComarketProvider({ children }) {
  const [includeComarket, setIncludeComarket] = useState(false);
  return (
    <ComarketContext.Provider value={{ includeComarket, setIncludeComarket }}>
      {children}
    </ComarketContext.Provider>
  );
}

export function useComarket() {
  return useContext(ComarketContext);
}
