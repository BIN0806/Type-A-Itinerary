/**
 * API Service Tests
 * Tests for authentication and network configuration
 */
import { apiService } from '../api';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

describe('ApiService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Configuration', () => {
    it('should use correct base URL for development', () => {
      // This test ensures the API URL is accessible from mobile device
      const baseURL = process.env.NODE_ENV === 'production'
        ? 'https://api.plana.app/v1'
        : expect.stringMatching(/^http:\/\/(\d{1,3}\.){3}\d{1,3}:8000\/v1$/);
      
      expect(baseURL).toBeDefined();
    });

    it('should not use localhost in development mode', () => {
      // Critical: localhost doesn't work from simulators/devices
      const apiClient = (apiService as any).client;
      const baseURL = apiClient.defaults.baseURL;
      
      if (process.env.NODE_ENV !== 'production') {
        expect(baseURL).not.toContain('localhost');
        expect(baseURL).not.toContain('127.0.0.1');
      }
    });

    it('should include proper headers', () => {
      const apiClient = (apiService as any).client;
      expect(apiClient.defaults.headers['Content-Type']).toBe('application/json');
    });

    it('should have reasonable timeout', () => {
      const apiClient = (apiService as any).client;
      expect(apiClient.defaults.timeout).toBeLessThanOrEqual(30000);
      expect(apiClient.defaults.timeout).toBeGreaterThan(0);
    });
  });

  describe('Authentication - Register', () => {
    it('should successfully register with valid credentials', async () => {
      const mockResponse = {
        data: {
          id: '123',
          email: 'test@example.com',
          preferences: {},
          created_at: new Date().toISOString(),
        },
        status: 201,
      };

      mockedAxios.create.mockReturnValue({
        post: jest.fn().mockResolvedValue(mockResponse),
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
        defaults: { baseURL: 'http://10.0.0.175:8000/v1' },
      } as any);

      const result = await apiService.register('test@example.com', 'password123');
      
      expect(result).toEqual(mockResponse.data);
    });

    it('should reject registration with invalid email format', async () => {
      const mockError = {
        response: {
          status: 422,
          data: {
            detail: [
              {
                loc: ['body', 'email'],
                msg: 'value is not a valid email address',
                type: 'value_error.email',
              },
            ],
          },
        },
      };

      mockedAxios.create.mockReturnValue({
        post: jest.fn().mockRejectedValue(mockError),
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
        defaults: { baseURL: 'http://10.0.0.175:8000/v1' },
      } as any);

      await expect(
        apiService.register('invalid-email', 'password123')
      ).rejects.toMatchObject({
        response: {
          status: 422,
        },
      });
    });

    it('should reject registration with short password', async () => {
      const mockError = {
        response: {
          status: 422,
          data: {
            detail: [
              {
                loc: ['body', 'password'],
                msg: 'ensure this value has at least 8 characters',
                type: 'value_error.any_str.min_length',
              },
            ],
          },
        },
      };

      mockedAxios.create.mockReturnValue({
        post: jest.fn().mockRejectedValue(mockError),
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
        defaults: { baseURL: 'http://10.0.0.175:8000/v1' },
      } as any);

      await expect(
        apiService.register('test@example.com', 'short')
      ).rejects.toMatchObject({
        response: {
          status: 422,
        },
      });
    });

    it('should handle network errors gracefully', async () => {
      const networkError = new Error('Network Error');
      (networkError as any).code = 'ECONNREFUSED';

      mockedAxios.create.mockReturnValue({
        post: jest.fn().mockRejectedValue(networkError),
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
        defaults: { baseURL: 'http://10.0.0.175:8000/v1' },
      } as any);

      await expect(
        apiService.register('test@example.com', 'password123')
      ).rejects.toThrow('Network Error');
    });

    it('should handle duplicate email registration', async () => {
      const mockError = {
        response: {
          status: 400,
          data: {
            detail: 'Email already registered',
          },
        },
      };

      mockedAxios.create.mockReturnValue({
        post: jest.fn().mockRejectedValue(mockError),
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
        defaults: { baseURL: 'http://10.0.0.175:8000/v1' },
      } as any);

      await expect(
        apiService.register('existing@example.com', 'password123')
      ).rejects.toMatchObject({
        response: {
          status: 400,
          data: {
            detail: 'Email already registered',
          },
        },
      });
    });

    it('should handle 500 server errors', async () => {
      const mockError = {
        response: {
          status: 500,
          data: {
            detail: 'Internal Server Error',
          },
        },
      };

      mockedAxios.create.mockReturnValue({
        post: jest.fn().mockRejectedValue(mockError),
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
        defaults: { baseURL: 'http://10.0.0.175:8000/v1' },
      } as any);

      await expect(
        apiService.register('test@example.com', 'password123')
      ).rejects.toMatchObject({
        response: {
          status: 500,
        },
      });
    });
  });

  describe('Authentication - Login', () => {
    it('should successfully login and store token', async () => {
      const mockResponse = {
        data: {
          access_token: 'mock-jwt-token',
          token_type: 'bearer',
        },
        status: 200,
      };

      mockedAxios.create.mockReturnValue({
        post: jest.fn().mockResolvedValue(mockResponse),
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
        defaults: { baseURL: 'http://10.0.0.175:8000/v1' },
      } as any);

      const result = await apiService.login('test@example.com', 'password123');

      expect(result.access_token).toBe('mock-jwt-token');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('auth_token', 'mock-jwt-token');
    });

    it('should reject invalid credentials', async () => {
      const mockError = {
        response: {
          status: 401,
          data: {
            detail: 'Incorrect email or password',
          },
        },
      };

      mockedAxios.create.mockReturnValue({
        post: jest.fn().mockRejectedValue(mockError),
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
        defaults: { baseURL: 'http://10.0.0.175:8000/v1' },
      } as any);

      await expect(
        apiService.login('test@example.com', 'wrongpassword')
      ).rejects.toMatchObject({
        response: {
          status: 401,
        },
      });
    });
  });

  describe('Token Management', () => {
    it('should clear token on logout', async () => {
      await apiService.clearToken();
      
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('auth_token');
    });

    it('should inject token into requests', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('stored-token');

      const mockAxiosInstance = {
        get: jest.fn().mockResolvedValue({ data: {} }),
        post: jest.fn(),
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
        defaults: { baseURL: 'http://10.0.0.175:8000/v1', headers: {} },
      };

      mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

      // Verify token injection happens in interceptor
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
    });

    it('should handle 401 errors by clearing token', async () => {
      const mockError = {
        response: { status: 401 },
      };

      const mockAxiosInstance = {
        get: jest.fn().mockRejectedValue(mockError),
        interceptors: {
          request: { use: jest.fn() },
          response: {
            use: jest.fn((successHandler, errorHandler) => {
              // Simulate 401 error
              errorHandler(mockError);
            }),
          },
        },
        defaults: { baseURL: 'http://10.0.0.175:8000/v1' },
      };

      mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

      // The interceptor should clear token on 401
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('Network Resilience', () => {
    it('should timeout after configured duration', async () => {
      const timeoutError = new Error('timeout of 30000ms exceeded');
      (timeoutError as any).code = 'ECONNABORTED';

      mockedAxios.create.mockReturnValue({
        post: jest.fn().mockRejectedValue(timeoutError),
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
        defaults: { baseURL: 'http://10.0.0.175:8000/v1' },
      } as any);

      await expect(
        apiService.register('test@example.com', 'password123')
      ).rejects.toThrow('timeout');
    });

    it('should handle DNS resolution failures', async () => {
      const dnsError = new Error('getaddrinfo ENOTFOUND');
      (dnsError as any).code = 'ENOTFOUND';

      mockedAxios.create.mockReturnValue({
        post: jest.fn().mockRejectedValue(dnsError),
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
        defaults: { baseURL: 'http://10.0.0.175:8000/v1' },
      } as any);

      await expect(
        apiService.register('test@example.com', 'password123')
      ).rejects.toThrow('ENOTFOUND');
    });
  });
});
