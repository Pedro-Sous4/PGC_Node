import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import LoginInput, { LoginInputProps } from '..';

const mockedProps = {
  placeholder: `placeholder`,
  register: {},
} as LoginInputProps;
describe(`LoginInput`, () => {
  afterAll(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    jest.resetAllMocks();
  });

  test(`should render label message on screen when label prop is passed`, () => {
    const modifiedProps = {
      ...mockedProps,
      label: `mocked-label`,
    } as LoginInputProps;

    render(<LoginInput {...modifiedProps} />);

    const label = screen.getByText(`mocked-label`);

    expect(label).toBeInTheDocument();
    expect(label).toBeVisible();
  });

  test(`should render error message on screen when error prop is passed`, () => {
    const modifiedProps = {
      ...mockedProps,
      error: `mocked-error`,
    } as LoginInputProps;

    render(<LoginInput {...modifiedProps} />);

    const error = screen.getByText(`mocked-error`);

    expect(error).toBeInTheDocument();
    expect(error).toBeVisible();
  });

  test(`when disable prop equals to true input should be disabled`, () => {
    const modifiedProps = {
      ...mockedProps,
      disabled: true,
    } as LoginInputProps;

    render(<LoginInput {...modifiedProps} />);

    const input = screen.getByPlaceholderText(`placeholder`);

    expect(input).toBeInTheDocument();
    expect(input).toBeDisabled();
  });

  test(`when disable prop is not passed input shouldn't be disabled`, () => {
    render(<LoginInput {...mockedProps} />);

    const input = screen.getByPlaceholderText(`placeholder`);

    expect(input).toBeInTheDocument();
    expect(input).not.toBeDisabled();
  });

  test(`when isPassword equals to true input type should be "password"`, () => {
    const modifiedProps = {
      ...mockedProps,
      isPassword: true,
    } as LoginInputProps;

    render(<LoginInput {...modifiedProps} />);

    const input = screen.getByPlaceholderText(`placeholder`);

    expect(input).toHaveAttribute(`type`, `password`);
  });

  test(`should render show/hide password button on screen when isPassword prop value equals to true`, () => {
    const modifiedProps = {
      ...mockedProps,
      isPassword: true,
    } as LoginInputProps;

    render(<LoginInput {...modifiedProps} />);

    expect(
      screen.getByRole(`button`, { name: `mostrar/esconder senha` })
    ).toBeInTheDocument();
  });

  test(`should change input type to text when clicking on the button with name "mostrar/esconder senha" and isPassword is equal to true `, async () => {
    const modifiedProps = {
      ...mockedProps,
      isPassword: true,
    } as LoginInputProps;

    render(<LoginInput {...modifiedProps} />);

    const button = screen.getByRole(`button`, {
      name: `mostrar/esconder senha`,
    });

    await userEvent.click(button);

    const input = screen.getByPlaceholderText(`placeholder`);

    expect(input).toHaveAttribute(`type`, `text`);
  });

  test(`when isPassword is equal to true and clicking on the button with name "mostrar/esconder senha" 2 times in a row, should change input to type to text and then to password`, async () => {
    const modifiedProps = {
      ...mockedProps,
      isPassword: true,
    } as LoginInputProps;

    render(<LoginInput {...modifiedProps} />);

    const button = screen.getByRole(`button`, {
      name: `mostrar/esconder senha`,
    });

    await userEvent.click(button);

    const input = screen.getByPlaceholderText(`placeholder`);

    expect(input).toHaveAttribute(`type`, `text`);

    await userEvent.click(button);

    expect(input).toHaveAttribute(`type`, `password`);
  });

  test(`should render element with data-testid "open-eye-icon" when password is true `, () => {
    const modifiedProps = {
      ...mockedProps,
      isPassword: true,
    } as LoginInputProps;

    render(<LoginInput {...modifiedProps} />);

    const eyeIcon = screen.getByTestId(`open-eye-icon`);

    expect(eyeIcon).toBeVisible();
    expect(eyeIcon).toBeInTheDocument();
  });

  test(`when isPassword is equal to true and clicking on the button with name "mostrar/esconder senha" should change icon from element with data-testid "open-eye-icon" to "invisible-eye-icon"`, async () => {
    const modifiedProps = {
      ...mockedProps,
      isPassword: true,
    } as LoginInputProps;

    render(<LoginInput {...modifiedProps} />);

    const eyeOpenIcon = screen.getByTestId(`open-eye-icon`);

    expect(eyeOpenIcon).toBeVisible();
    expect(eyeOpenIcon).toBeInTheDocument();

    const button = screen.getByRole(`button`, {
      name: `mostrar/esconder senha`,
    });

    await userEvent.click(button);

    const eyeInvisibleIcon = screen.getByTestId(`invisible-eye-icon`);

    expect(eyeInvisibleIcon).toBeVisible();
    expect(eyeInvisibleIcon).toBeInTheDocument();

    expect(eyeOpenIcon).not.toBeVisible();
    expect(eyeOpenIcon).not.toBeInTheDocument();
  });

  test(`shouldn't render show/hide password button on screen when isPassword is not passed`, () => {
    const modifiedProps = {
      ...mockedProps,
    } as LoginInputProps;

    render(<LoginInput {...modifiedProps} />);

    expect(
      screen.queryByRole(`button`, { name: `mostrar/esconder senha` })
    ).not.toBeInTheDocument();
  });

  test(`when StartIcon prop is passed should render StartIcon and component with data-testid "start-icon-wrapper"`, () => {
    const modifiedProps = {
      ...mockedProps,
      StartIcon: <div data-testid="mocked-start-icon" />,
    } as LoginInputProps;

    render(<LoginInput {...modifiedProps} />);

    expect(screen.getByTestId(`mocked-start-icon`)).toBeInTheDocument();
    expect(screen.getByTestId(`start-icon-wrapper`)).toBeInTheDocument();
  });
});
