import * as Yup from 'yup';

export const emailValidation = Yup.string()
  .required(`É preciso preencher o campo de e-mail.`)
  .email(`O e-mail informado não é válido.`);

export const passwordValidation = Yup.string().required(
  `É preciso preencher o campo de senha.`
);

export const loginSchema = Yup.object().shape({
  email: emailValidation,
  password: passwordValidation,
  rememberMe: Yup.boolean(),
});
