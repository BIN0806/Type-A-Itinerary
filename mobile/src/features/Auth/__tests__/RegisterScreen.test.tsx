/**
 * RegisterScreen Tests
 * Tests for registration UI and validation logic
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { RegisterScreen } from '../RegisterScreen';
import { apiService } from '../../../services/api';

// Mock navigation
const mockNavigate = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
} as any;

// Mock API service
jest.mock('../../../services/api', () => ({
  apiService: {
    register: jest.fn(),
  },
}));

// Mock Alert
jest.spyOn(Alert, 'alert');

describe('RegisterScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Form Validation', () => {
    it('should render all form fields', () => {
      const { getByPlaceholderText } = render(
        <RegisterScreen navigation={mockNavigation} />
      );

      expect(getByPlaceholderText('Email')).toBeTruthy();
      expect(getByPlaceholderText(/Password \(min 8 characters\)/)).toBeTruthy();
      expect(getByPlaceholderText('Confirm Password')).toBeTruthy();
    });

    it('should show error when fields are empty', () => {
      const { getByText } = render(
        <RegisterScreen navigation={mockNavigation} />
      );

      const signUpButton = getByText('Sign Up');
      fireEvent.press(signUpButton);

      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Please fill all fields');
    });

    it('should show error when password is too short', () => {
      const { getByPlaceholderText, getByText } = render(
        <RegisterScreen navigation={mockNavigation} />
      );

      fireEvent.changeText(getByPlaceholderText('Email'), 'test@example.com');
      fireEvent.changeText(getByPlaceholderText(/Password \(min 8/), 'short');
      fireEvent.changeText(getByPlaceholderText('Confirm Password'), 'short');

      const signUpButton = getByText('Sign Up');
      fireEvent.press(signUpButton);

      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        'Password must be at least 8 characters'
      );
    });

    it('should show error when passwords do not match', () => {
      const { getByPlaceholderText, getByText } = render(
        <RegisterScreen navigation={mockNavigation} />
      );

      fireEvent.changeText(getByPlaceholderText('Email'), 'test@example.com');
      fireEvent.changeText(getByPlaceholderText(/Password \(min 8/), 'password123');
      fireEvent.changeText(getByPlaceholderText('Confirm Password'), 'password456');

      const signUpButton = getByText('Sign Up');
      fireEvent.press(signUpButton);

      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Passwords do not match');
    });

    it('should accept valid credentials', async () => {
      (apiService.register as jest.Mock).mockResolvedValue({
        id: '123',
        email: 'test@example.com',
      });

      const { getByPlaceholderText, getByText } = render(
        <RegisterScreen navigation={mockNavigation} />
      );

      fireEvent.changeText(getByPlaceholderText('Email'), 'test@example.com');
      fireEvent.changeText(getByPlaceholderText(/Password \(min 8/), 'password123');
      fireEvent.changeText(getByPlaceholderText('Confirm Password'), 'password123');

      const signUpButton = getByText('Sign Up');
      fireEvent.press(signUpButton);

      await waitFor(() => {
        expect(apiService.register).toHaveBeenCalledWith('test@example.com', 'password123');
      });
    });
  });

  describe('Registration Flow', () => {
    it('should show loading state during registration', async () => {
      (apiService.register as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      const { getByPlaceholderText, getByText, queryByTestId } = render(
        <RegisterScreen navigation={mockNavigation} />
      );

      fireEvent.changeText(getByPlaceholderText('Email'), 'test@example.com');
      fireEvent.changeText(getByPlaceholderText(/Password \(min 8/), 'password123');
      fireEvent.changeText(getByPlaceholderText('Confirm Password'), 'password123');

      const signUpButton = getByText('Sign Up');
      fireEvent.press(signUpButton);

      // Should show loading indicator
      await waitFor(() => {
        expect(queryByTestId('loading-indicator')).toBeTruthy();
      });
    });

    it('should navigate to login on successful registration', async () => {
      (apiService.register as jest.Mock).mockResolvedValue({
        id: '123',
        email: 'test@example.com',
      });

      const { getByPlaceholderText, getByText } = render(
        <RegisterScreen navigation={mockNavigation} />
      );

      fireEvent.changeText(getByPlaceholderText('Email'), 'test@example.com');
      fireEvent.changeText(getByPlaceholderText(/Password \(min 8/), 'password123');
      fireEvent.changeText(getByPlaceholderText('Confirm Password'), 'password123');

      const signUpButton = getByText('Sign Up');
      fireEvent.press(signUpButton);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Success',
          'Account created! Please login.',
          expect.any(Array)
        );
      });
    });

    it('should show error message on registration failure', async () => {
      (apiService.register as jest.Mock).mockRejectedValue({
        response: {
          status: 400,
          data: {
            detail: 'Email already registered',
          },
        },
      });

      const { getByPlaceholderText, getByText } = render(
        <RegisterScreen navigation={mockNavigation} />
      );

      fireEvent.changeText(getByPlaceholderText('Email'), 'existing@example.com');
      fireEvent.changeText(getByPlaceholderText(/Password \(min 8/), 'password123');
      fireEvent.changeText(getByPlaceholderText('Confirm Password'), 'password123');

      const signUpButton = getByText('Sign Up');
      fireEvent.press(signUpButton);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Registration Failed',
          'Email already registered'
        );
      });
    });

    it('should show generic error message on network failure', async () => {
      (apiService.register as jest.Mock).mockRejectedValue(
        new Error('Network Error')
      );

      const { getByPlaceholderText, getByText } = render(
        <RegisterScreen navigation={mockNavigation} />
      );

      fireEvent.changeText(getByPlaceholderText('Email'), 'test@example.com');
      fireEvent.changeText(getByPlaceholderText(/Password \(min 8/), 'password123');
      fireEvent.changeText(getByPlaceholderText('Confirm Password'), 'password123');

      const signUpButton = getByText('Sign Up');
      fireEvent.press(signUpButton);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Registration Failed',
          'Could not create account'
        );
      });
    });
  });

  describe('UI/UX', () => {
    it('should disable form during submission', async () => {
      (apiService.register as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      const { getByPlaceholderText, getByText } = render(
        <RegisterScreen navigation={mockNavigation} />
      );

      fireEvent.changeText(getByPlaceholderText('Email'), 'test@example.com');
      fireEvent.changeText(getByPlaceholderText(/Password \(min 8/), 'password123');
      fireEvent.changeText(getByPlaceholderText('Confirm Password'), 'password123');

      const signUpButton = getByText('Sign Up');
      fireEvent.press(signUpButton);

      // Button should be disabled during loading
      expect(signUpButton.props.accessibilityState?.disabled).toBe(true);
    });

    it('should have link to login screen', () => {
      const { getByText } = render(
        <RegisterScreen navigation={mockNavigation} />
      );

      const loginLink = getByText(/Already have an account\?/);
      fireEvent.press(loginLink);

      expect(mockNavigate).toHaveBeenCalledWith('Login');
    });

    it('should mask password fields', () => {
      const { getByPlaceholderText } = render(
        <RegisterScreen navigation={mockNavigation} />
      );

      const passwordField = getByPlaceholderText(/Password \(min 8/);
      const confirmField = getByPlaceholderText('Confirm Password');

      expect(passwordField.props.secureTextEntry).toBe(true);
      expect(confirmField.props.secureTextEntry).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should trim whitespace from email', async () => {
      (apiService.register as jest.Mock).mockResolvedValue({ id: '123' });

      const { getByPlaceholderText, getByText } = render(
        <RegisterScreen navigation={mockNavigation} />
      );

      fireEvent.changeText(getByPlaceholderText('Email'), '  test@example.com  ');
      fireEvent.changeText(getByPlaceholderText(/Password \(min 8/), 'password123');
      fireEvent.changeText(getByPlaceholderText('Confirm Password'), 'password123');

      const signUpButton = getByText('Sign Up');
      fireEvent.press(signUpButton);

      await waitFor(() => {
        // API should be called with trimmed email
        expect(apiService.register).toHaveBeenCalledWith(
          expect.not.stringMatching(/^\s+|\s+$/),
          'password123'
        );
      });
    });

    it('should handle rapid button presses', async () => {
      (apiService.register as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      const { getByPlaceholderText, getByText } = render(
        <RegisterScreen navigation={mockNavigation} />
      );

      fireEvent.changeText(getByPlaceholderText('Email'), 'test@example.com');
      fireEvent.changeText(getByPlaceholderText(/Password \(min 8/), 'password123');
      fireEvent.changeText(getByPlaceholderText('Confirm Password'), 'password123');

      const signUpButton = getByText('Sign Up');
      
      // Press multiple times rapidly
      fireEvent.press(signUpButton);
      fireEvent.press(signUpButton);
      fireEvent.press(signUpButton);

      await waitFor(() => {
        // Should only call API once due to loading state
        expect(apiService.register).toHaveBeenCalledTimes(1);
      });
    });
  });
});
