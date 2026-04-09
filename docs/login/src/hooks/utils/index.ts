export const getUserAgentReduxState = (userAgent: string | null) => {
  if (!userAgent) {
    return {
      userAgent,
      devices: { isMobile: true, isTablet: false, isDesktop: false },
    };
  }

  const isMobile = Boolean(
    userAgent?.match(
      /(android|webos|iphone|ipod|blackberry|iemobile|opera mini)/i
    )
  );

  const isTablet = Boolean(
    userAgent?.match(
      /(tablet|ipad|playbook|xoom|kindle|silk)|(android(?!.*mobile))/i
    )
  );

  return {
    userAgent,
    devices: { isMobile, isTablet, isDesktop: !isMobile && !isTablet },
  };
};

export const getWidthForUseWindowSize = (
  isDesktop: boolean,
  isTablet: boolean
) => {
  if (isDesktop) {
    return 1024;
  }

  if (isTablet) {
    return 768;
  }

  return 360;
};
