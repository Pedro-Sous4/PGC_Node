import { HTMLAttributes, memo } from 'react';

import Spinner from '../Spinner';

export interface ButtonProps extends HTMLAttributes<HTMLElement> {
  isSubmiting: boolean;
}

function ButtonSubmit({ isSubmiting = false, ...rest }: ButtonProps) {
  return (
    <button className="border-none " type="submit" {...rest}>
      {isSubmiting ? (
        <Spinner className="text-white animate-spin-fast" size={26} />
      ) : (
        `Entrar`
      )}
    </button>
  );
}

export default memo(ButtonSubmit);
