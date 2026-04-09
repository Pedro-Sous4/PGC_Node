import { memo } from 'react';

import Image from 'next/image';

import LoginImage from '@/public/images/sign-in-rafiki.svg';

function DesktopSideLogin() {
  return (
    <div
      className="w-7/12 h-full bg-primary-blue rounded-l-lg flex flex-col items-center justify-center"
      data-testid="desktop-side-login"
    >
      <div className="w-96 h-96 relative animate-float-slow">
        <Image
          src={LoginImage}
          alt="Pessoa realizando login no seu telefone numa sala de estar"
          fill
          priority
        />
      </div>
      <a
        href="https://storyset.com/user"
        className="text-xs text-gray-300 pb-6"
      >
        User illustrations by Storyset
      </a>
      <h2 className="text-slate-50 text-xl max-w-xs text-center">
        A melhor experiencia de login que você já teve na sua vida.
      </h2>
    </div>
  );
}

export default memo(DesktopSideLogin);
