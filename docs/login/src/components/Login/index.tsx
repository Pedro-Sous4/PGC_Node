/* eslint-disable jsx-a11y/anchor-is-valid */

'use client';

import { memo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { FaLock } from 'react-icons/fa';
import { HiOutlineMail } from 'react-icons/hi';

import Link from 'next/link';

import { InferType } from 'yup';

import useWindowSize from '@/hooks/useWindowSize';
import { loginSchema } from '@/yup/schema';
import { yupResolver } from '@hookform/resolvers/yup';

import ButtonSubmit from '../ButtonSubmit';
import DesktopSideLogin from './DesktopSideLogin';
import LoginInput from './LoginInput';

type LoginForm = InferType<typeof loginSchema>;

export interface LoginProps {
  userAgent: string | null;
}

function Login({ userAgent }: LoginProps) {
  const formOptions = {
    resolver: yupResolver(loginSchema),
  };
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>(formOptions);

  const [isSubmiting, setIsSubmiting] = useState(false);

  const { isMobile } = useWindowSize(userAgent);

  const onLoginSubmit = (data: LoginForm) => {
    setIsSubmiting(true);
    setTimeout(() => {
      console.log(`data`, data);
      setIsSubmiting(false);
    }, 2000);
  };

  return (
    <div
      className="flex flex-col align-top w-full h-full rounded-2xl font-bold justify-center items-center md:flex-row  md:h-screen md:w-screen"
      onSubmit={handleSubmit(onLoginSubmit)}
    >
      <div className="py-12 px-6 h-full w-full flex flex-col md:w-5/12  justify-center items-center">
        <h1 className="text-4xl text-gray-900 text-center">Faça seu login</h1>
        <form
          className="flex flex-col items-start mt-12 w-full md:max-w-md"
          onSubmit={handleSubmit(onLoginSubmit)}
        >
          <LoginInput
            placeholder="kaladin@gmail.com"
            register={register(`email`)}
            label="E-mail"
            error={errors.email?.message}
            StartIcon={<HiOutlineMail className="text-gray-400" size={16} />}
          />
          <LoginInput
            placeholder="sua senha"
            register={register(`password`)}
            label="Senha"
            isPassword
            error={errors.password?.message}
            StartIcon={<FaLock className="text-gray-400" size={12} />}
            wrapperClassName="mt-6"
          />
          <div className="w-full flex justify-between mt-2">
            <label
              htmlFor="remenberMe"
              className="flex w-full items-center cursor-pointer"
            >
              <input
                id="remenberMe"
                type="checkbox"
                className="mr-2"
                {...register(`rememberMe`)}
              />
              <span className="text-sm font-normal text-gray-400">
                Lembrar de mim
              </span>
            </label>
            <Link
              href="#"
              className="text-sm text-gray-400 font-normal w-full text-end"
            >
              Esqueci minha senha
            </Link>
          </div>
          <ButtonSubmit
            className="flex justify-center items-center w-full bg-primary-blue h-12 rounded-sm text-white font-semibold transition ease-in-out delay 100 hover:bg-primary-blue-light mt-8 mb-10"
            isSubmiting={isSubmiting}
          />
        </form>
        <Link href="#" className="text-sm text-gray-400 font-normal">
          Não tem conta ainda?{` `}
          <span className="text-primary-blue">Crie agora</span>
        </Link>
      </div>
      {!isMobile && <DesktopSideLogin />}
    </div>
  );
}

export default memo(Login);
