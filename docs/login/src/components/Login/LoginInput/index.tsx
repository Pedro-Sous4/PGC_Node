import { HTMLAttributes, memo, useState } from 'react';
import { UseFormRegisterReturn } from 'react-hook-form';
import { AiOutlineEye, AiOutlineEyeInvisible } from 'react-icons/ai';

export interface LoginInputProps extends HTMLAttributes<HTMLElement> {
  label?: string;
  error?: string;
  disabled?: boolean;
  placeholder: string;
  isPassword?: boolean;
  register: UseFormRegisterReturn;
  StartIcon?: JSX.Element;
  wrapperClassName?: string;
}

function LoginInput({
  label,
  error,
  disabled = false,
  placeholder,
  register,
  isPassword = false,
  StartIcon,
  wrapperClassName = ``,
  ...rest
}: LoginInputProps) {
  const [focused, setFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(isPassword);

  return (
    <>
      <div
        className={`border-solid border-gray-400 border w-full rounded-md h-12 relative flex items-center bg-white ${wrapperClassName} ${
          focused && !error ? `border-blue-500 shadow-blue` : ``
        } ${error ? `border-red-600` : ``} }`}
      >
        {label && (
          <span className="absolute text-gray-900 -top-4 left-1 bg-white rounded-lg px-2 text-sm h-6 font-normal">
            {label}
          </span>
        )}

        {StartIcon && (
          <div
            className="h-full flex items-center justify-center pl-2"
            data-testid="start-icon-wrapper"
          >
            {StartIcon}
          </div>
        )}

        <input
          disabled={disabled}
          placeholder={placeholder}
          type={showPassword ? `password` : `text`}
          onFocus={() => setFocused(true)}
          className=" w-full h-12 bg-transparent text-gray-900 font-normal placeholder:text-gray-400 placeholder:text-sm placeholder:font-normal focus:outline-none pl-2"
          {...rest}
          {...register}
          onBlur={() => setFocused(false)}
        />

        {isPassword && (
          <button
            type="button"
            className="absolute right-2"
            aria-label="mostrar/esconder senha"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? (
              <AiOutlineEye
                size={20}
                color="#9CA3AF"
                data-testid="open-eye-icon"
              />
            ) : (
              <AiOutlineEyeInvisible
                size={20}
                color="#9CA3AF"
                data-testid="invisible-eye-icon"
              />
            )}
          </button>
        )}
      </div>
      {error && <p className="text-red-600 text-xs left-2 mt-2">{error}</p>}
    </>
  );
}

export default memo(LoginInput);
