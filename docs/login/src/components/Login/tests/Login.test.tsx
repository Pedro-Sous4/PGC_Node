import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Login, { LoginProps } from '..';

const mockProps = {
  userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36`,
} as LoginProps;

describe(`Login`, () => {
  afterAll(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    jest.resetAllMocks();
  });

  test(`when userAgent prop and innerWidth is from a desktop device, should render element with data-testid equals to "desktop-side-login"`, () => {
    render(<Login {...mockProps} />);

    expect(screen.getByTestId(`desktop-side-login`)).toBeInTheDocument();
  });

  test(`when userAgent prop and innerWidth is from a mobile device, shouldn't render element with data-testid equals to "desktop-side-login"`, () => {
    const modifiedMockProps = {
      userAgent: `Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1`,
    } as LoginProps;

    const customGlobal = global;

    customGlobal.innerWidth = 320;

    render(<Login {...modifiedMockProps} />);

    expect(screen.queryByTestId(`desktop-side-login`)).not.toBeInTheDocument();
  });

  test(`when clicking on the submit button whitout filling the inputs, should render 2 error messages`, async () => {
    render(<Login {...mockProps} />);

    const submitButton = screen.getByRole(`button`, { name: /entrar/i });

    await userEvent.click(submitButton);

    expect(
      screen.getByText(`É preciso preencher o campo de e-mail.`)
    ).toBeInTheDocument();

    expect(
      screen.getByText(`É preciso preencher o campo de senha.`)
    ).toBeInTheDocument();
  });

  test(`when clicking on the submit button whitout filling the inputs, should render 2 error messages`, async () => {
    render(<Login {...mockProps} />);

    const submitButton = screen.getByRole(`button`, { name: /entrar/i });

    await userEvent.click(submitButton);

    expect(
      screen.getByText(`É preciso preencher o campo de e-mail.`)
    ).toBeInTheDocument();

    expect(
      screen.getByText(`É preciso preencher o campo de senha.`)
    ).toBeInTheDocument();
  });

  test(`when clicking on the submit button and filling the email input with a invalid email, should render error message "O email informado não é válido."`, async () => {
    render(<Login {...mockProps} />);

    const submitButton = screen.getByRole(`button`, { name: /entrar/i });
    const emailInput = screen.getByPlaceholderText(/kaladin@gmail.com/i);

    await userEvent.type(emailInput, `invalidemail`);

    await userEvent.click(submitButton);

    expect(
      screen.getByText(`O e-mail informado não é válido.`)
    ).toBeInTheDocument();
  });

  test(`when clicking on the submit button and filling both inputs with valid values, shouldn't render error messages"`, async () => {
    render(<Login {...mockProps} />);

    const submitButton = screen.getByRole(`button`, { name: /entrar/i });
    const emailInput = screen.getByPlaceholderText(/kaladin@gmail.com/i);
    const passwodrdInput = screen.getByPlaceholderText(/sua senha/i);

    await userEvent.type(emailInput, `valid@email.com`);
    await userEvent.type(passwodrdInput, `123456`);

    await userEvent.click(submitButton);

    expect(
      screen.queryByText(`O e-mail informado não é válido.`)
    ).not.toBeInTheDocument();

    expect(
      screen.queryByText(`É preciso preencher o campo de email.`)
    ).not.toBeInTheDocument();
  });
});
