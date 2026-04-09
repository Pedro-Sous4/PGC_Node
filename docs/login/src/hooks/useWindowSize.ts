import { useEffect, useState } from 'react';

import { getUserAgentReduxState, getWidthForUseWindowSize } from './utils';

export interface WindowSizes {
  width: number;
  height: number;
  isMobile: boolean;
  isHorizontal: boolean;
  isDesktop: boolean;
  isTablet: boolean;
}

const useWindowSize = (userAgent: string | null) => {
  const userAgentState = getUserAgentReduxState(userAgent);
  const isMobileRedux = userAgentState.devices.isMobile;
  const isTabletRedux = userAgentState.devices.isTablet;
  const isDesktopRedux = userAgentState.devices.isDesktop;
  const [windowSize, setWindowSize] = useState<WindowSizes>({
    width: getWidthForUseWindowSize(isDesktopRedux, isTabletRedux),
    height: 0,
    isMobile: isMobileRedux,
    isHorizontal: false,
    isDesktop: isDesktopRedux,
    isTablet: isTabletRedux,
  });

  useEffect(() => {
    function handleResize() {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
        isMobile: window.innerWidth < 768,
        isHorizontal: window.innerHeight <= 612,
        isTablet: window.innerWidth >= 768 && window?.innerWidth < 1024,
        isDesktop: window.innerWidth >= 1024,
      });
    }

    window?.addEventListener(`resize`, handleResize);

    handleResize();

    return () => window?.removeEventListener(`resize`, handleResize);
  }, []);

  return windowSize;
};

export default useWindowSize;
