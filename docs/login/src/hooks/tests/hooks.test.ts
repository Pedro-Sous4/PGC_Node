import { cleanup } from '@testing-library/react';

import { getWidthForUseWindowSize, getUserAgentReduxState } from '../utils';

describe(`hooks`, () => {
  afterAll(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    jest.resetAllMocks();
  });

  describe(`utils`, () => {
    describe(`getWidthForUseWindowSize`, () => {
      test(`when prop isDesktop equals to true should return 1024`, () => {
        const isDesktop = true;
        const isTablet = false;

        expect(getWidthForUseWindowSize(isDesktop, isTablet)).toBe(1024);
      });

      test(`when prop isTablet equals to true should return 768`, () => {
        const isDesktop = false;
        const isTablet = true;

        expect(getWidthForUseWindowSize(isDesktop, isTablet)).toBe(768);
      });

      test(`when prop isTablet and isDesktop equals to false should return 360`, () => {
        const isDesktop = false;
        const isTablet = false;

        expect(getWidthForUseWindowSize(isDesktop, isTablet)).toBe(360);
      });
    });
  });

  describe(`getUserAgentReduxState`, () => {
    test(`when is a userAgent from a desktop device should return desktop correct object`, () => {
      const desktopUserAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36`;
      const expectedObject = {
        userAgent: desktopUserAgent,
        devices: { isMobile: false, isTablet: false, isDesktop: true },
      };

      expect(getUserAgentReduxState(desktopUserAgent)).toStrictEqual(
        expectedObject
      );
    });

    test(`when is a userAgent from a tablet device should return tablet correct object`, () => {
      const tabletUserAgent = `Mozilla/5.0 (iPad; CPU OS 13_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/87.0.4280.77 Mobile/15E148 Safari/604.1`;
      const expectedObject = {
        userAgent: tabletUserAgent,
        devices: { isMobile: false, isTablet: true, isDesktop: false },
      };

      expect(getUserAgentReduxState(tabletUserAgent)).toStrictEqual(
        expectedObject
      );
    });

    test(`when is a userAgent from a mobile device should return mobile correct object`, () => {
      const mobileUserAgent = `Mozilla/5.0 (Linux; Android 6.0.1; Moto G (4)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Mobile Safari/537.36`;
      const expectedObject = {
        userAgent: mobileUserAgent,
        devices: { isMobile: true, isTablet: false, isDesktop: false },
      };

      expect(getUserAgentReduxState(mobileUserAgent)).toStrictEqual(
        expectedObject
      );
    });

    test(`when userAgent prop is falsy should return mobile state`, () => {
      const expectedObject = {
        userAgent: null,
        devices: { isMobile: true, isTablet: false, isDesktop: false },
      };

      expect(getUserAgentReduxState(null)).toStrictEqual(expectedObject);
    });
  });
});
